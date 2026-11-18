// First-party aggregate traffic only: no address, identity, IP, user agent or full URL.
if(location.hostname==='echobsc.fun'){
 let last;const route=()=>location.pathname.startsWith('/launch')?'launch':location.hash==='#mint'||['#activity','#rules','#mechanism'].includes(location.hash)?'mint':location.hash===''||['#home','#top'].includes(location.hash)?'home':'site';
 const send=(event,page)=>{if(page)void fetch('/traffic-api/record',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({event,page}),keepalive:true}).catch(()=>{});};
 const view=()=>{const page=route();if(page!==last){last=page;send('view',page);}};
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;let u;try{u=new URL(a.href,location.href);}catch{return;}if(u.origin!==location.origin)return;const target=u.pathname.startsWith('/launch')?'launch':u.hash==='#mint'?'mint':null;if(target&&target!==route())send('click',target);},true);
 document.addEventListener('echo:module-change',view);addEventListener('hashchange',view);addEventListener('pageshow',e=>{if(e.persisted){last=null;view();}});view();
}
