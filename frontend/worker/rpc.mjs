const endpoints=['https://bsc-dataseed.nariox.org','https://bsc-dataseed.bnbchain.org'];
export const fail=code=>{throw Error(code);};
export function integer(value){const n=typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value)?Number(BigInt(value)):Number(value);if(!Number.isSafeInteger(n)||n<0)fail('CHAIN_INTEGER');return n;}
export async function rpcBatch(url,calls,{fetchImpl=fetch,timeoutMs=12000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let phase='fetch',status=null;
 try{
  const body=calls.map(([method,params],i)=>({jsonrpc:'2.0',id:i+1,method,params}));
  const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body.length===1?body[0]:body),signal:controller.signal,redirect:'manual'});
  status=response.status;phase='response';if(!response.ok)fail('RPC_UNAVAILABLE');const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1048576){await reader.cancel();fail('RPC_RESPONSE_LIMIT');}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}
  let data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data))data=[data];
  if(data.length!==calls.length||new Set(data.map(x=>x.id)).size!==calls.length)fail('RPC_RESPONSE_INVALID');
  return calls.map((_,i)=>{const r=data.find(x=>x.id===i+1);if(!r||r.error||!Object.hasOwn(r,'result'))fail('RPC_READ_FAILED');return r.result;});
 }catch(e){console.error(JSON.stringify({event:'echo-launch-rpc-failure',host:new URL(url).hostname,phase,status,errorName:e?.name,code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:'RPC_UNAVAILABLE'}));if(/^[A-Z][A-Z0-9_]+$/.test(e?.message??''))throw e;fail('RPC_UNAVAILABLE');}finally{clearTimeout(timer);}
}
export async function chainContext({fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const [[chain,head],[crossChain]]=await Promise.all([rpcBatch(endpoints[0],[['eth_chainId',[]],['eth_getBlockByNumber',['latest',false]]],{fetchImpl}),rpcBatch(endpoints[1],[['eth_chainId',[]]],{fetchImpl})]);
 if(chain!=='0x38'||crossChain!=='0x38')fail('WRONG_CHAIN');const latest=integer(head?.number),timestamp=integer(head?.timestamp);
 if(latest<12||now-timestamp>120||timestamp>now+30)fail('STALE_CHAIN_HEAD');
 const number=latest-12,tag='0x'+number.toString(16),[[block],[other]]=await Promise.all(endpoints.map(url=>rpcBatch(url,[['eth_getBlockByNumber',[tag,false]]],{fetchImpl})));
 if(!/^0x[0-9a-f]{64}$/i.test(block?.hash??'')||block.hash!==other?.hash||integer(block.number)!==number||integer(other.number)!==number)fail('CANONICAL_HEADER_MISMATCH');
 if(now-integer(block.timestamp)>120)fail('STALE_CONFIRMED_BLOCK');
 return {chainId:56,headNumber:latest,number,tag,hash:block.hash,timestamp:integer(block.timestamp),depth:12,observedAt:new Date(now*1000).toISOString(),quorumHeaders:true};
}
export function requestProvider({fetchImpl=fetch}={}){
 let queue=[],scheduled=false;
 const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_getLogs','eth_getTransactionByHash','eth_getTransactionReceipt','eth_blockNumber']);
 async function flush(){const work=queue;queue=[];scheduled=false;let last;for(const url of [endpoints[0],'https://bsc.drpc.org','https://bsc-rpc.publicnode.com']){try{const values=await rpcBatch(url,work.map(x=>[x.method,x.params]),{fetchImpl});work.forEach((x,i)=>x.resolve(values[i]));return;}catch(e){last=e;}}work.forEach(x=>x.reject(last));}
 return {request({method,params=[]}){if(!allowed.has(method))return Promise.reject(Error('READ_ONLY_RPC'));return new Promise((resolve,reject)=>{queue.push({method,params,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(flush);}});}};
}
export async function recheck(context,options){const [[a],[b]]=await Promise.all(endpoints.map(url=>rpcBatch(url,[['eth_getBlockByNumber',[context.tag,false]]],options)));if(a?.hash!==context.hash||b?.hash!==context.hash)fail('CANONICAL_HEADER_CHANGED');}
export async function logsAt(filter,options){return (await rpcBatch('https://bsc-rpc.publicnode.com',[['eth_getLogs',[filter]]],options))[0];}
