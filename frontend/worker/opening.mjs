import{LAUNCH_OPENING_MS,LAUNCH_OPENING_ISO,openingState}from'../public/launch/opening-clock.mjs';
export function launchDocument(html,now=Date.now()){
 if(now<LAUNCH_OPENING_MS)return html;
 return html.replace('class="launch-locked" data-launch-opening="pending"','data-launch-opening="open" data-server-opening="open"').replace('id="opening-screen" class="opening-screen"','id="opening-screen" class="opening-screen" hidden aria-hidden="true"').replace('id="launch-shell" inert aria-hidden="true"','id="launch-shell"');
}
export function launchOpeningResponse(request,now=Date.now()){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 return new Response(request.method==='HEAD'?null:JSON.stringify({schema:'echo-launch-opening/v1',opensAt:LAUNCH_OPENING_ISO,opensAtMs:LAUNCH_OPENING_MS,serverTimeMs:now,open:openingState(now).open,scope:'website-opening;not-an-onchain-permission-lock'}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
