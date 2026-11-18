import {verifyMessage,keccak256,toUtf8Bytes} from 'ethers';
import runtime from './runtime-config.json' with {type:'json'};
import {TRAFFIC_START_ISO,TRAFFIC_START_SECONDS} from '../public/traffic/policy.mjs';
import {readTrafficReport} from './traffic-report.mjs';
const COOKIE='echo_visit',INTERNAL='echo_internal',AGE=2592000;
const cookies=request=>Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(s=>s.trim().split('=')).filter(a=>a.length===2));
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const day=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
export function visitCookie(request){const c=cookies(request);return c[INTERNAL]==='1'||/^[\da-f-]{36}$/i.test(c[COOKIE]||'')?null:COOKIE+'='+crypto.randomUUID()+'; Path=/; Max-Age='+AGE+'; Secure; HttpOnly; SameSite=Lax';}
export function trafficRange(from,to,now=Date.now()){const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;if(!valid(from)||!valid(to))throw Error('INVALID_DATE_RANGE');const days=(Date.parse(to)-Date.parse(from))/86400000;if(days<0||days>30||to>day(now))throw Error('INVALID_DATE_RANGE');return {from,to};}
export function trafficMessage({from,to,issuedAt}){return ['ECHO private traffic report','Origin: https://echobsc.fun','Chain ID: 56','Administrator: '+runtime.platformAdmin.toLowerCase(),'Measurement starts (UTC): '+TRAFFIC_START_ISO,'From (Asia/Shanghai): '+from,'To (Asia/Shanghai): '+to,'Issued at: '+issuedAt,'Expires at: '+(issuedAt+600),'Purpose: Read anonymous website funnel totals only. No transfer, approval, transaction or settings change.'].join('\n');}
async function bodyJson(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Error('JSON_REQUIRED');const reader=request.body?.getReader();if(!reader)throw Error('JSON_REQUIRED');let size=0;const chunks=[];try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>16384){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}chunks.push(r.value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let i=0;for(const c of chunks){all.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(all));}
export async function traffic(request,env,{now=Date.now(),random=()=>crypto.randomUUID()}={}){
 const url=new URL(request.url),route=url.pathname.slice('/traffic-api/'.length),cookie=cookies(request),internal=cookie[INTERNAL]==='1';
 if(route==='status'&&request.method==='GET')return json({internal,definition:'unique browsers, not verified people',timezone:'Asia/Shanghai',measurementStartedAt:TRAFFIC_START_ISO,historyBeforeStartExcluded:true});
 if(route==='internal'&&request.method==='GET'){
  if(env.DB&&/^[\da-f-]{36}$/i.test(cookie[COOKIE]||'')){const visitor=keccak256(toUtf8Bytes(cookie[COOKIE]));await env.DB.batch([env.DB.prepare('INSERT INTO echo_traffic_exclusions (visitor,excluded_at) VALUES (?,?) ON CONFLICT(visitor) DO NOTHING').bind(visitor,Math.floor(now/1000)),env.DB.prepare('DELETE FROM echo_traffic_events WHERE visitor=?').bind(visitor)]);}
  const headers=new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});headers.append('Set-Cookie',INTERNAL+'=1; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax');headers.append('Set-Cookie',COOKIE+'=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
  return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ECHO · 内部访问已排除</title><link rel="stylesheet" href="/launch/live.css"><main><section class="panel"><h1>此浏览器已排除</h1><p>本浏览器后续访问不计入 ECHO 漏斗；之前属于本浏览器匿名标识的记录已移除。</p><p>This browser is excluded from ECHO traffic measurement.</p><p>电脑和手机、不同浏览器分别打开本链接。清除 Cookie、无痕浏览或更换浏览器后需要重新排除。没有按 IP 屏蔽其他访客。</p><a href="/">返回 ECHO</a> · <a href="/launch/">进入 Launch</a></section></main></html>',{headers});
 }
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'SAME_ORIGIN_REQUIRED'},403);
 if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
 try{
  if(route==='record'&&request.method==='POST'){
   if(internal)return new Response(null,{status:204,headers:{'Cache-Control':'no-store','X-ECHO-Traffic':'internal-excluded'}});
   if(now/1000<TRAFFIC_START_SECONDS)return new Response(null,{status:204,headers:{'Cache-Control':'no-store','X-ECHO-Traffic':'before-measurement-start'}});
   const b=await bodyJson(request);if(!['view','click'].includes(b.event)||!['site','home','mint','launch'].includes(b.page)||b.event==='click'&&!['mint','launch'].includes(b.page)||Object.keys(b).some(k=>!['event','page'].includes(k)))return json({error:'INVALID_EVENT'},400);
   const id=/^[\da-f-]{36}$/i.test(cookie[COOKIE]||'')?cookie[COOKIE]:random(),visitor=keccak256(toUtf8Bytes(id)),today=day(now),at=Math.floor(now/1000),pages=b.event==='view'&&b.page!=='site'?['site',b.page]:[b.page];
   if(await env.DB.prepare('SELECT visitor FROM echo_traffic_exclusions WHERE visitor=?').bind(visitor).first())return new Response(null,{status:204,headers:{'Cache-Control':'no-store','X-ECHO-Traffic':'internal-excluded'}});
   await env.DB.batch(pages.map(page=>env.DB.prepare('INSERT INTO echo_traffic_events (day,visitor,event,page,count,first_at,last_at) SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM echo_traffic_exclusions WHERE visitor=?) ON CONFLICT(day,visitor,event,page) DO UPDATE SET count=count+1,last_at=excluded.last_at').bind(today,visitor,b.event,page,at,at,visitor)));
   await env.DB.prepare('DELETE FROM echo_traffic_events WHERE rowid IN (SELECT rowid FROM echo_traffic_events WHERE day<? LIMIT 100)').bind(day(now-35*86400000)).run();
   return new Response(null,{status:204,headers:{'Cache-Control':'no-store','Set-Cookie':COOKIE+'='+id+'; Path=/; Max-Age='+AGE+'; Secure; HttpOnly; SameSite=Lax'}});
  }
  if(route==='challenge'&&request.method==='GET'){const range=trafficRange(url.searchParams.get('from'),url.searchParams.get('to'),now),issuedAt=Math.floor(now/1000);return json({...range,issuedAt,message:trafficMessage({...range,issuedAt}),signer:runtime.platformAdmin,financialAuthorization:false});}
  if(route==='report'&&request.method==='POST'){
   const b=await bodyJson(request),range=trafficRange(b.from,b.to,now);if(!Number.isSafeInteger(b.issuedAt)||b.issuedAt>now/1000+30||b.issuedAt<now/1000-600)return json({error:'REPORT_AUTH_EXPIRED'},401);
   let signer;try{signer=verifyMessage(trafficMessage({...range,issuedAt:b.issuedAt}),b.signature);}catch{return json({error:'ADMIN_SIGNATURE_REQUIRED'},401);}if(signer.toLowerCase()!==runtime.platformAdmin.toLowerCase())return json({error:'ADMIN_SIGNATURE_REQUIRED'},403);
   return json(await readTrafficReport(env.DB,range,{now}));
  }
  return json({error:'NOT_FOUND'},404);
 }catch(e){return json({error:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'TRAFFIC_UNAVAILABLE'},400);}
}
