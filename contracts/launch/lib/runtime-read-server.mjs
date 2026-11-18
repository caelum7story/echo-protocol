import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.md':'text/plain; charset=utf-8'};
export async function createRuntimeReadServer({index,staticRoot,port=0,rehearsalInfo=null}){
 if(index.status().chainId!==31337)throw Error('LOCAL_REHEARSAL_ONLY');
 const root=await fs.realpath(staticRoot);let active=0;
 const server=http.createServer(async(req,res)=>{
  const expected=`127.0.0.1:${server.address().port}`,hosts=new Set([expected,`localhost:${server.address().port}`]);
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(!hosts.has(req.headers.host)||req.headers.origin&&!hosts.has(req.headers.origin.replace(/^http:\/\//,''))){json(403,{error:'LOCAL_ORIGIN_REQUIRED'});return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){json(405,{error:'READ_ONLY_SERVICE'});return;}
  let url;try{url=new URL(req.url,'http://'+expected);}catch{json(400,{error:'INVALID_REQUEST'});return;}
  if(url.pathname.startsWith('/launch-api/')){
   if(req.method!=='GET'){json(405,{error:'READ_ONLY_SERVICE'});return;}if(active>=2){json(503,{error:'READ_CAPACITY'});return;}active++;
   try{
    const route=url.pathname.slice('/launch-api/'.length),params=url.searchParams;
    const allowed={status:[],projects:['offset','limit'],state:['address','wallet','handle'],history:['address','wallet','cursor','limit'],'nft-items':['address','wallet','block','hash','cursor','limit'],events:['address','offset','limit']}[route];
    if(!allowed){json(404,{error:'READ_ROUTE_NOT_FOUND'});return;}
    if([...params.keys()].some(k=>!allowed.includes(k))||[...params.keys()].some(k=>params.getAll(k).length!==1))throw Error('INVALID_READ_PARAMETERS');
    const page={offset:params.has('offset')?Number(params.get('offset')):0,limit:params.has('limit')?Number(params.get('limit')):50};
    let result;
    if(route==='status')result={schema:'echo-launch-read-service/v1',chainId:31337,localTestOnly:true,readOnly:true,executionReady:false,index:index.status(),rehearsal:rehearsalInfo};
    else{await index.sync();result=route==='projects'?index.projects(page):route==='events'?index.events({...page,address:params.get('address')??undefined}):route==='nft-items'?
     await index.nftItems({project:params.get('address'),wallet:params.get('wallet'),blockNumber:params.has('block')?Number(params.get('block')):undefined,blockHash:params.get('hash'),cursor:params.get('cursor')??undefined,limit:params.has('limit')?page.limit:20}):route==='history'?
     await index.history({project:params.get('address'),wallet:params.get('wallet'),cursor:params.get('cursor'),limit:params.has('limit')?page.limit:25}):
     await index.state(params.get('address'),{wallet:params.get('wallet')??undefined,handle:params.get('handle')??undefined});}
    json(200,result);
   }catch(error){const code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'READ_UNAVAILABLE';json(503,{error:code,financialExecutionAllowed:false});}
   finally{active--;}
   return;
  }
  try{
   const decoded=decodeURIComponent(url.pathname);if(decoded.split('/').some(p=>p.startsWith('.')))throw Error('STATIC_PATH');
   const file=await fs.realpath(path.resolve(root,'.'+(decoded.endsWith('/')?decoded+'index.html':decoded)));
   if(!file.startsWith(root+path.sep))throw Error('STATIC_PATH');const type=mime[path.extname(file)];if(!type)throw Error('STATIC_TYPE');
   const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch{json(404,{error:'STATIC_NOT_FOUND'});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
