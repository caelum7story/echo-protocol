import {TRAFFIC_START_ISO,TRAFFIC_START_SECONDS} from '../public/traffic/policy.mjs';

// UV is exact for this boundary because last_at proves a post-boundary visit.
// An old daily row spanning the boundary cannot reveal its exact post-boundary
// PV or click sequence. Return null for those values instead of counting history.
export async function readTrafficReport(DB,range,{now=Date.now()}={}){
 const start=Math.max(TRAFFIC_START_SECONDS,Date.parse(range.from+'T00:00:00+08:00')/1000);
 const retained="day>=? AND day<=? AND last_at>=? AND NOT EXISTS (SELECT 1 FROM echo_traffic_exclusions x WHERE x.visitor=echo_traffic_events.visitor)";
 const rows=await DB.prepare(`SELECT page,event,COUNT(DISTINCT visitor) AS uv,CASE WHEN SUM(CASE WHEN first_at<? THEN 1 ELSE 0 END)>0 THEN NULL ELSE SUM(count) END AS events FROM echo_traffic_events WHERE ${retained} GROUP BY page,event`).bind(start,range.from,range.to,start).all();
 const daily=await DB.prepare(`SELECT day,page,COUNT(DISTINCT visitor) AS uv,CASE WHEN SUM(CASE WHEN first_at<? THEN 1 ELSE 0 END)>0 THEN NULL ELSE SUM(count) END AS views FROM echo_traffic_events WHERE event='view' AND ${retained} GROUP BY day,page ORDER BY day DESC,page`).bind(start,range.from,range.to,start).all();
 const sequenceRows=await DB.prepare(`SELECT c.page,COUNT(DISTINCT c.visitor) AS uv FROM echo_traffic_events c JOIN echo_traffic_events v ON v.day=c.day AND v.visitor=c.visitor AND v.page=c.page AND v.event='view' AND v.last_at>=c.first_at WHERE c.event='click' AND c.day>=? AND c.day<=? AND c.first_at>=? AND v.first_at>=? AND NOT EXISTS (SELECT 1 FROM echo_traffic_exclusions x WHERE x.visitor=c.visitor) GROUP BY c.page`).bind(range.from,range.to,start,start).all();
 const uncertain=await DB.prepare(`SELECT DISTINCT page FROM echo_traffic_events WHERE day>=? AND day<=? AND first_at<? AND last_at>=? AND NOT EXISTS (SELECT 1 FROM echo_traffic_exclusions x WHERE x.visitor=echo_traffic_events.visitor)`).bind(range.from,range.to,start,start).all();
 const uncertainPages=new Set((uncertain.results??[]).map(r=>r.page));
 const arrivals=['mint','launch'].map(page=>({page,uv:uncertainPages.has(page)?null:(sequenceRows.results??[]).find(r=>r.page===page)?.uv??0}));
 return {schema:'echo-private-funnel/v2',...range,timezone:'Asia/Shanghai',generatedAt:new Date(now).toISOString(),measurementStartedAt:TRAFFIC_START_ISO,effectiveStartedAt:new Date(start*1000).toISOString(),historyBeforeStartExcluded:true,rows:rows.results,clickThenArrivalSameDay:arrivals,daily:daily.results,definition:'First-party anonymous browser UV, not real-person or wallet counts. Only visits at or after the fixed owner-confirmed internal-exclusion boundary count. A browser with visits on both sides counts once if it returned after the boundary. Unknown post-boundary PV or click sequence is null, never a guessed zero or historic total.',internalPolicy:'Opted-out browsers are not recorded; earlier rows for the same browser identifier are deleted on opt-out. Other devices must opt out separately.',retentionDays:35};
}
