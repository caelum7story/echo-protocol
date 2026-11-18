import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openLocalD1} from '../scripts/local-d1.mjs';
import {readTrafficReport} from '../worker/traffic-report.mjs';
import {traffic} from '../worker/traffic.mjs';
import {summaryHtml,detailsHtml} from '../public/traffic/view.mjs';
import {TRAFFIC_START_ISO,TRAFFIC_START_SECONDS as start} from '../public/traffic/policy.mjs';
const range={from:'2026-11-16',to:'2026-11-16'};
async function seed(DB,{visitor,page='mint',event='view',count=1,first=start+10,last=first,day='2026-11-16'}){
 await DB.prepare('INSERT INTO echo_traffic_events (day,visitor,event,page,count,first_at,last_at) VALUES (?,?,?,?,?,?,?)').bind(day,visitor,event,page,count,first,last).run();
}
test('fixed boundary excludes all earlier traffic, includes exact boundary and deduplicates returning browsers',async()=>{
 const DB=await openLocalD1();try{
  await seed(DB,{visitor:'before',count:99,first:start-30,last:start-1});
  await seed(DB,{visitor:'exact',first:start,count:2});
  await seed(DB,{visitor:'after',page:'launch',count:3});
  const d=await readTrafficReport(DB,range);
  assert.equal(d.measurementStartedAt,TRAFFIC_START_ISO);assert.equal(d.historyBeforeStartExcluded,true);
  assert.deepEqual({...d.rows.find(r=>r.page==='mint')},{page:'mint',event:'view',uv:1,events:2});
  assert.deepEqual({...d.rows.find(r=>r.page==='launch')},{page:'launch',event:'view',uv:1,events:3});
  assert.equal(d.daily.find(r=>r.page==='mint').uv,1);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM echo_traffic_events').first()).n,3,'Earlier data preserved but excluded, no destructive reset');
 }finally{DB.close();}
});
test('a browser returning after the boundary counts once; historic mixed PV and click sequence are never guessed',async()=>{
 const DB=await openLocalD1();try{
  await seed(DB,{visitor:'returning',count:12,first:start-60,last:start+10});
  await seed(DB,{visitor:'returning',event:'click',count:5,first:start-60,last:start+5});
  await seed(DB,{visitor:'internal',page:'launch'});
  await DB.prepare('INSERT INTO echo_traffic_exclusions (visitor,excluded_at) VALUES (?,?)').bind('internal',start).run();
  const d=await readTrafficReport(DB,range);
  assert.equal(d.rows.find(r=>r.page==='mint'&&r.event==='view').uv,1);
  assert.equal(d.rows.find(r=>r.page==='mint'&&r.event==='view').events,null);
  assert.equal(d.daily.find(r=>r.page==='mint').views,null);
  assert.equal(d.clickThenArrivalSameDay.find(r=>r.page==='mint').uv,null);
  assert(!d.rows.some(r=>r.page==='launch'));
  const html=summaryHtml(d);assert(html.includes('data-page="mint">1</strong>'));assert(html.includes('data-page="launch">0</strong>'));assert(html.includes('未核实'));assert(!html.includes('次数：12'));
 }finally{DB.close();}
});
test('earlier requested dates cannot bypass the boundary, later ranges remain bounded and no-prestart events are collected',async()=>{
 const DB=await openLocalD1();try{
  await seed(DB,{visitor:'old',first:start-30});await seed(DB,{visitor:'new'});
  const early=await readTrafficReport(DB,{from:'2026-11-15',to:'2026-11-16'});assert.equal(early.effectiveStartedAt,TRAFFIC_START_ISO);assert.equal(early.rows[0].uv,1);
  const later=await readTrafficReport(DB,{from:'2026-11-17',to:'2026-11-17'});assert.equal(later.rows.length,0);assert.equal(later.effectiveStartedAt,'2026-11-16T16:00:00.000Z');
  const request=new Request('https://echobsc.fun/traffic-api/record',{method:'POST',headers:{Origin:'https://echobsc.fun','Content-Type':'application/json'},body:JSON.stringify({event:'view',page:'launch'})});
  const r=await traffic(request,{DB},{now:(start-1)*1000});assert.equal(r.headers.get('X-ECHO-Traffic'),'before-measurement-start');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM echo_traffic_events').first()).n,2);
 }finally{DB.close();}
});
test('known post-boundary click arrival stays separate from direct visitors and dashboard does not expose placeholder zero',async()=>{
 const DB=await openLocalD1();try{
  await seed(DB,{visitor:'arrived',page:'launch',event:'click',first:start+1});await seed(DB,{visitor:'arrived',page:'launch',first:start+2});await seed(DB,{visitor:'direct',page:'launch',first:start+4});
  const d=await readTrafficReport(DB,range);assert.equal(d.rows.find(r=>r.event==='view').uv,2);assert.equal(d.clickThenArrivalSameDay.find(r=>r.page==='launch').uv,1);assert(summaryHtml(d).includes('data-page="launch">2</strong>'));assert(detailsHtml(d).includes('100.0%'));
  const html=await fs.readFile(new URL('../public/traffic/index.html',import.meta.url),'utf8');assert.equal((html.match(/class="traffic-number">—/g)||[]).length,2);assert(html.includes('00:53:47'));assert(!html.includes('/traffic.mjs'));
 }finally{DB.close();}
});
