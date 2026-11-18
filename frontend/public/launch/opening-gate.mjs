import{LAUNCH_OPENING_MS,createOpeningCountdown}from'./opening-clock.mjs';
export function installOpeningGate({onOpen=()=>{}}={}){
 const overlay=document.getElementById('opening-screen'),clock=document.getElementById('opening-clock'),shell=document.getElementById('launch-shell');
 if(!overlay||!clock||!shell)throw Error('OPENING_SHELL_MISSING');
 // The Worker has already compared its own clock with the fixed opening time.
 // Never re-lock an open response or wait for a second network request to paint.
 if(document.documentElement.dataset.serverOpening==='open'){
  overlay.hidden=true;overlay.setAttribute('aria-hidden','true');shell.inert=false;shell.removeAttribute('aria-hidden');document.documentElement.classList.remove('launch-locked');onOpen();
  return {opened:true,refresh(){},synchronize(){}};
 }
 let request=0,resync;
 const countdown=createOpeningCountdown({onTick:s=>{if(clock.textContent!==s.text)clock.textContent=s.text;document.documentElement.dataset.launchOpening='countdown';},onOpen:()=>{overlay.hidden=true;overlay.setAttribute('aria-hidden','true');shell.inert=false;shell.removeAttribute('aria-hidden');document.documentElement.classList.remove('launch-locked');document.documentElement.dataset.launchOpening='open';clearInterval(resync);document.removeEventListener('visibilitychange',resume);onOpen();}});
 async function synchronize(){if(countdown.opened)return;const id=++request;try{const r=await fetch('/launch-api/opening',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('OPENING_CLOCK_UNAVAILABLE');const d=await r.json();if(id!==request||d.schema!=='echo-launch-opening/v1'||d.opensAtMs!==LAUNCH_OPENING_MS) return;countdown.synchronize({serverTimeMs:d.serverTimeMs});}catch{document.documentElement.dataset.openingClock='waiting-for-server';}}
 function resume(){if(!document.hidden){countdown.refresh();void synchronize();}}
 shell.inert=true;document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',resume);resync=setInterval(synchronize,30000);void synchronize();return countdown;
}
