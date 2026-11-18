import http from 'node:http';
import {EventEmitter} from 'node:events';
import {Wallet,getBytes,toBeHex} from 'ethers';
import {EdrContext,ContractDecoder,GENERIC_CHAIN_TYPE,genericChainProviderFactory,l1GenesisState,l1HardforkFromString,MineOrdering,GasEstimationMode} from '@nomicfoundation/edr';

const endpoints=new Set(['https://bsc-dataseed.bnbchain.org','https://bsc.publicnode.com']);
const allowed=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getProof','eth_call']);
const stateMethods=new Set(['eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getProof','eth_call']);
export async function createHistoricalFork({endpoint='https://bsc-dataseed.bnbchain.org',depth=64}={}){
 if(!endpoints.has(endpoint)||!Number.isSafeInteger(depth)||depth<32||depth>128)throw Error('FORK_ENDPOINT_POLICY');
 const stats={remoteRequests:0,remoteBytes:0,forwardedMethods:{},blockedMethods:{},remoteWritesForwarded:0},cache=new Map();let requestId=0,closed=false,native,provider;
 async function remote(method,params=[]){
  if(!allowed.has(method))throw Error('REMOTE_METHOD_DENIED');
  if(++stats.remoteRequests>1500)throw Error('FORK_RPC_BUDGET');stats.forwardedMethods[method]=(stats.forwardedMethods[method]??0)+1;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok)throw Error('UPSTREAM_HTTP_'+response.status);const text=await response.text();stats.remoteBytes+=Buffer.byteLength(text);if(text.length>8*1024*1024||stats.remoteBytes>64*1024*1024)throw Error('FORK_RESPONSE_BUDGET');
  const data=JSON.parse(text);if(data.error)throw Object.assign(Error(String(data.error.message).slice(0,240)),{code:data.error.code});if(!('result'in data))throw Error('FORK_RPC_RESULT');return data.result;
 }
 if(BigInt(await remote('eth_chainId'))!==56n)throw Error('WRONG_FORK_CHAIN');
 const latest=Number(BigInt(await remote('eth_blockNumber'))),number=latest-depth,tag=toBeHex(number).replace(/^0x0([1-9a-f])/,'0x$1');
 const header=await remote('eth_getBlockByNumber',[tag,false]);if(!header||Number(BigInt(header.number))!==number)throw Error('FORK_BLOCK_MISSING');
 const anchor={chainId:56,number,hash:header.hash,stateRoot:header.stateRoot,timestamp:Number(BigInt(header.timestamp)),endpoint};
 async function relayCall(request){
  const {method}=request;let params=request.params??[];
  if(!allowed.has(method)){stats.blockedMethods[method]=(stats.blockedMethods[method]??0)+1;return {jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Read-only fork relay: method denied'}};}
  try{
   if(method==='eth_blockNumber')return {jsonrpc:'2.0',id:request.id,result:tag};
   if(stateMethods.has(method)){
    params=[...params];const value=params.at(-1);
    if(value==='latest'||value==='safe'||value==='finalized')params[params.length-1]=tag;
    else if(typeof value==='object'&&value?.blockHash===anchor.hash){}
    else if(typeof value!=='string'||!/^0x[0-9a-fA-F]+$/.test(value)||BigInt(value)>BigInt(number))throw Error('UNPINNED_REMOTE_STATE');
   }
   if(method==='eth_getBlockByNumber'){
    params=[...params];if(['latest','safe','finalized'].includes(params[0]))params[0]=tag;
    if(!/^0x[0-9a-fA-F]+$/.test(params[0])||BigInt(params[0])>BigInt(number))throw Error('UNPINNED_REMOTE_BLOCK');
   }
   const key=JSON.stringify([method,params]);if(!cache.has(key))cache.set(key,await remote(method,params));
   return {jsonrpc:'2.0',id:request.id,result:cache.get(key)};
  }catch(error){return {jsonrpc:'2.0',id:request.id,error:{code:typeof error.code==='number'?error.code:-32000,message:String(error.message).slice(0,240)}};}
 }
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.method!=='POST'||req.url!=='/'){res.writeHead(404);res.end();return;}
   const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>1024*1024)throw Error('RELAY_REQUEST_BUDGET');chunks.push(part);}
   const body=JSON.parse(Buffer.concat(chunks).toString()),rows=Array.isArray(body)?body:[body];if(!rows.length||rows.length>50)throw Error('RELAY_BATCH_BUDGET');
   const output=[];for(const row of rows)output.push(await relayCall(row));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(body)?output:output[0]));
  }catch{res.writeHead(400);res.end('{"error":"READ_ONLY_RELAY_REQUEST"}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
 const close=async()=>{if(closed)return;closed=true;provider?.removeAllListeners();native=undefined;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
 try{
  const denied=await(await fetch(url,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:0,method:'eth_sendRawTransaction',params:['0x']}),headers:{'Content-Type':'application/json'}})).json();
  if(denied.error?.code!==-32601)throw Error('FORK_WRITE_FILTER_FAILED');
  const accounts=Array.from({length:6},(_,i)=>new Wallet(toBeHex(i+1,32))),context=new EdrContext();await context.registerProviderFactory(GENERIC_CHAIN_TYPE,genericChainProviderFactory());
  native=await context.createProvider(GENERIC_CHAIN_TYPE,{
   allowBlocksWithSameTimestamp:true,allowUnlimitedContractSize:false,bailOnCallFailure:true,bailOnTransactionFailure:true,chainId:31337n,networkId:31337n,coinbase:new Uint8Array(20),
   defaultTransactionGasLimit:30000000n,gasEstimationMode:GasEstimationMode.NoInternalOutOfGas,
   genesisState:[...l1GenesisState(l1HardforkFromString('shanghai')),...accounts.map(w=>({address:getBytes(w.address),balance:10000n*10n**18n,code:new Uint8Array()}))],
   hardfork:'shanghai',initialBaseFeePerGas:1000000000n,minGasPrice:0n,mining:{autoMine:true,blockGasLimit:30000000n,memPool:{order:MineOrdering.Fifo}},
   network:{url,blockNumber:BigInt(number),chainOverrides:[{chainId:56n,name:'BNB read-only historical state',hardforkActivationOverrides:[{condition:{blockNumber:0n},hardfork:'shanghai'}]}]},
   observability:{},ownedAccounts:accounts.map(w=>w.privateKey),precompileOverrides:[]
  },{enable:false,decodeConsoleLogInputsCallback:()=>[],printLineCallback:()=>{}},{subscriptionCallback:()=>{}},new ContractDecoder());
  provider=new EventEmitter();let localId=0;
  provider.request=async({method,params=[]})=>{if(closed)throw Error('FORK_CLOSED');const response=await native.handleRequest(JSON.stringify({jsonrpc:'2.0',id:++localId,method,params}));const data=typeof response.data==='string'?JSON.parse(response.data):response.data;if(data.error)throw Object.assign(Error(data.error.message),data.error);return data.result;};
  const recheck=await remote('eth_getBlockByNumber',[tag,false]);if(recheck.hash!==anchor.hash)throw Error('FORK_ANCHOR_CHANGED');
  return {provider,anchor,stats,relayUrl:url,close,readRemote:remote,assertAnchor:async()=>{if((await remote('eth_getBlockByNumber',[tag,false])).hash!==anchor.hash)throw Error('FORK_ANCHOR_CHANGED');}};
 }catch(error){await close();error.forkObservation={anchor,stats};throw error;}
}
