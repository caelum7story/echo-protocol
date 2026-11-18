import {launchOpeningResponse,launchDocument} from './opening.mjs';
import {launchApi} from './api.mjs';
import {assets} from '../.generated/assets.mjs';
import {traffic,visitCookie} from './traffic.mjs';
import {agenticApi} from './agentic-api.mjs';
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/agentic-api/'))return agenticApi(request,env);
 if(url.pathname.startsWith('/traffic-api/'))return traffic(request,env);
 if(url.pathname==='/launch-api/opening')return launchOpeningResponse(request);
 if(url.pathname.startsWith('/launch-api/'))return launchApi(request,env);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 let name;try{name=decodeURIComponent(url.pathname);}catch{return new Response('Not found',{status:404});}
 if(name.split('/').some(p=>p==='..'||p.startsWith('.'))||name.includes('\\'))return new Response('Not found',{status:404});
 if(name.endsWith('/'))name+='index.html';if(name==='/launch')return Response.redirect(url.origin+'/launch/',308);
 const item=assets[name];if(!item)return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 if(name==='/launch/index.html'){
  const html=launchDocument(new TextDecoder().decode(Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0))));
  const headers={'Content-Type':item.type,'Content-Length':String(new TextEncoder().encode(html).length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};const cookie=visitCookie(request);if(cookie)headers['Set-Cookie']=cookie;
  return new Response(request.method==='HEAD'?null:html,{headers});
 }
 const headers={'Content-Type':item.type,'Content-Length':String(item.bytes),'X-Content-Type-Options':'nosniff','ETag':'"'+item.hash+'"','Cache-Control':/\.(?:jpg|webp|png|ttf|woff2?)$/.test(name)?'public,max-age=86400':'no-cache'};
 if(name==='/index.html'){const cookie=visitCookie(request);if(cookie)headers['Set-Cookie']=cookie;headers['Cache-Control']='private,no-cache';}
 if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
 if(request.method==='HEAD')return new Response(null,{headers});
 return new Response(Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0)),{headers});
}};
