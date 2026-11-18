export const LAUNCH_OPENING_ISO='2026-11-16T00:00:00+08:00';
export const LAUNCH_OPENING_MS=Date.parse(LAUNCH_OPENING_ISO);
export function openingState(nowMs,opensAtMs=LAUNCH_OPENING_MS){
 if(!Number.isFinite(nowMs)||!Number.isFinite(opensAtMs))throw Error('INVALID_OPENING_CLOCK');
 const remainingMs=Math.max(0,opensAtMs-nowMs),seconds=Math.ceil(remainingMs/1000);
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
 return {open:remainingMs===0,remainingMs,seconds,text:[hours,minutes,rest].map(n=>String(n).padStart(2,'0')).join(':')};
}
// A server epoch anchored to monotonic time survives local clock changes and suspended timers.
export function createOpeningCountdown({opensAtMs=LAUNCH_OPENING_MS,monotonic=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onTick=()=>{},onOpen=()=>{}}={}){
 let anchor=null,timer=null,opened=false;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 const refresh=()=>{clear();if(opened||!anchor)return;const elapsed=Math.max(0,monotonic()-anchor.monotonicMs),state=openingState(anchor.serverTimeMs+elapsed,opensAtMs);onTick(state);if(state.open){opened=true;onOpen();return;}timer=schedule(refresh,Math.min(1000,state.remainingMs));};
 return {synchronize({serverTimeMs,monotonicMs=monotonic()}){if(!Number.isFinite(serverTimeMs)||serverTimeMs<0||!Number.isFinite(monotonicMs)||monotonicMs>monotonic())throw Error('INVALID_SERVER_TIME');if(opened)return;anchor={serverTimeMs,monotonicMs};refresh();},refresh,stop:clear,get opened(){return opened;}};
}
