import http from 'node:http';
import {getAddress} from 'ethers';

const fail = code => {throw Error(code);};
const routes = {status:[],projects:['offset','limit'],state:['address','wallet','handle'],history:['address','wallet','cursor','limit'],'nft-items':['address','wallet','block','hash','cursor','limit'],events:['address','offset','limit']};
const uint = (value, max) => {if (!/^(0|[1-9][0-9]{0,15})$/.test(value)) fail('INVALID_READ_PARAMETERS'); const n=Number(value);if (!Number.isSafeInteger(n)||n>max) fail('INVALID_READ_PARAMETERS');return n;};

// This transport exposes an already verified index, not a signer or arbitrary RPC.
// Bind behind an independently configured TLS reverse proxy. No forwarded header is trusted.
export async function createPublicReadServer({index,policy,port=0}) {
  const p=structuredClone(policy), initial=index.status();
  if (p?.schema!=='echo-launch-public-read-policy/v1'||p.chainId!==initial.chainId||
    ![56,97].includes(p.chainId)&&!(p.localTestOnly===true&&p.chainId===31337)||
    !/^0x[0-9a-fA-F]{40}$/.test(p.registry??'')||p.registry.toLowerCase()!==initial.registry?.toLowerCase()||
    !Number.isSafeInteger(p.requestsPerMinute)||p.requestsPerMinute<1||p.requestsPerMinute>600||
    !Number.isSafeInteger(p.maxConcurrent)||p.maxConcurrent<1||p.maxConcurrent>4||
    !Number.isSafeInteger(p.requestDeadlineMs)||p.requestDeadlineMs<10||p.requestDeadlineMs>30000||
    !Number.isSafeInteger(p.maxResponseBytes)||p.maxResponseBytes<1024||p.maxResponseBytes>1048576||
    !Number.isSafeInteger(p.maxBlockAgeSeconds)||p.maxBlockAgeSeconds<1||p.maxBlockAgeSeconds>120||
    !Array.isArray(p.hosts)||!p.hosts.length||p.hosts.some(h=>typeof h!=='string'||!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(h))||
    !Array.isArray(p.origins)||p.origins.some(o=>{try{const u=new URL(o);return u.origin!==o||u.protocol!=='https:'||u.username||u.password;}catch{return true;}})||
    (p.chainId!==31337&&initial.confirmationsRequired<12)) fail('PUBLIC_READ_POLICY');
  let active=0,syncing=null,windowStart=Date.now(),requests=0,closing=false;
  const operations=new Set();
  const server=http.createServer(async(req,res)=>{
    const reply=(code,value)=>{
      if(res.destroyed||res.writableEnded)return;
      let body=JSON.stringify(value);
      if(Buffer.byteLength(body)>p.maxResponseBytes){code=503;body=JSON.stringify({error:'READ_RESPONSE_LIMIT',financialExecutionAllowed:false});}
      res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...(p.origins.includes(req.headers.origin)?{'Access-Control-Allow-Origin':req.headers.origin,'Vary':'Origin'}:{})});res.end(body);
    };
    if(closing){reply(503,{error:'SERVICE_STOPPING'});return;}
    const localHost=p.localTestOnly&&req.headers.host===`127.0.0.1:${server.address().port}`;
    if(!localHost&&!p.hosts.includes(req.headers.host)||req.headers.origin&&!p.origins.includes(req.headers.origin)){reply(403,{error:'READ_ORIGIN_OR_HOST'});return;}
    if(req.method!=='GET'){reply(405,{error:'READ_ONLY_SERVICE'});return;}
    if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//')||req.url.length>4096){reply(400,{error:'INVALID_READ_PARAMETERS'});return;}
    if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}
    // A global cap bounds provider cost even behind one proxy; caller-controlled XFF is ignored.
    if(++requests>p.requestsPerMinute){reply(429,{error:'READ_RATE_LIMIT'});return;}
    let route,params,page;
    try{
      const url=new URL(req.url,'https://'+p.hosts[0]);
      route=url.pathname.startsWith('/launch-api/')?url.pathname.slice(12):'';
      if(!Object.hasOwn(routes,route)){reply(404,{error:'READ_ROUTE_NOT_FOUND'});return;}
      params=url.searchParams;
      for(const key of params.keys())if(!routes[route].includes(key)||params.getAll(key).length!==1)fail('INVALID_READ_PARAMETERS');
      for(const key of ['address','wallet'])if(params.has(key))getAddress(params.get(key));
      if(['state','history','nft-items'].includes(route)&&!params.has('address'))fail('INVALID_READ_PARAMETERS');
      if(['history','nft-items'].includes(route)&&!params.has('wallet'))fail('INVALID_READ_PARAMETERS');
      if(params.has('handle')&&!/^[a-z0-9-]{1,63}\.ai$/.test(params.get('handle')))fail('INVALID_READ_PARAMETERS');
      if(params.has('cursor')&&!/^[A-Za-z0-9_.-]{1,1000}$/.test(params.get('cursor')))fail('INVALID_READ_PARAMETERS');
      if(params.has('hash')&&!/^0x[0-9a-fA-F]{64}$/.test(params.get('hash')))fail('INVALID_READ_PARAMETERS');
      if(params.has('block'))uint(params.get('block'),Number.MAX_SAFE_INTEGER);
      page={offset:params.has('offset')?uint(params.get('offset'),1000000):0,limit:params.has('limit')?uint(params.get('limit'),route==='nft-items'?100:100):route==='history'?25:route==='nft-items'?20:50};
      if(page.limit<1)fail('INVALID_READ_PARAMETERS');
    }catch{reply(400,{error:'INVALID_READ_PARAMETERS'});return;}
    if(active>=p.maxConcurrent){reply(503,{error:'READ_CAPACITY'});return;}
    active++;
    const operation=(async()=>{
      syncing??=Promise.resolve().then(()=>index.sync()).finally(()=>{syncing=null;});
      await syncing;
      const status=index.status();
      if(!['healthy','waiting-confirmations'].includes(status.health))fail('INDEX_NOT_CAUGHT_UP');
      if(!status.head||Date.now()/1000-status.head.timestamp>p.maxBlockAgeSeconds||status.head.timestamp>Date.now()/1000+30)fail('INDEX_STALE_BLOCK');
      if(route==='status')return {schema:'echo-launch-public-read-service/v1',chainId:p.chainId,readOnly:true,executionReady:false,financialExecutionAllowed:false,index:status,localTestOnly:p.localTestOnly===true};
      if(route==='projects')return index.projects(page);
      if(route==='events')return index.events({...page,address:params.get('address')??undefined});
      if(route==='state')return index.state(params.get('address'),{wallet:params.get('wallet')??undefined,handle:params.get('handle')??undefined});
      if(route==='history')return index.history({project:params.get('address'),wallet:params.get('wallet'),cursor:params.get('cursor'),limit:page.limit});
      return index.nftItems({project:params.get('address'),wallet:params.get('wallet'),blockNumber:params.has('block')?Number(params.get('block')):undefined,blockHash:params.get('hash'),cursor:params.get('cursor')??undefined,limit:page.limit});
    })();
    operations.add(operation);
    // A timed-out read keeps its concurrency slot until the real operation ends.
    operation.finally(()=>{active--;operations.delete(operation);}).catch(()=>{});
    let timer;
    try{
      const value=await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('READ_DEADLINE')),p.requestDeadlineMs);})]);
      reply(200,value);
    }catch(error){reply(503,{error:/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'READ_UNAVAILABLE',financialExecutionAllowed:false});}
    finally{clearTimeout(timer);}
  });
  server.maxConnections=32;server.requestTimeout=10000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,server,status:()=>({activeReads:active,closing,readOnly:true}),async close(){closing=true;server.closeIdleConnections();await Promise.allSettled([...operations]);await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
