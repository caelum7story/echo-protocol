import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Interface,keccak256,toQuantity} from 'ethers';
const root=path.resolve(import.meta.dirname,'..'),capture=JSON.parse(fs.readFileSync(path.join(root,'references/pancake-v2/deployed-runtime.json'),'utf8'));
const endpoints=['https://bsc-dataseed.bnbchain.org','https://bsc.publicnode.com'];
const abi=new Interface(['function allPairsLength() view returns(uint256)','function feeTo() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const readMethods=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getStorageAt']);
let sequence=0;
async function rpc(endpoint,method,params=[]){
 if(!readMethods.has(method)||!endpoints.includes(endpoint))throw Error('READ_ONLY_ENDPOINT_POLICY');
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!response.ok)throw Error('HTTP_'+response.status);const data=await response.json();if(data.error)throw Object.assign(Error(String(data.error.message).slice(0,240)),{rpcCode:data.error.code});if(!('result'in data))throw Error('RPC_RESULT_MISSING');return data.result;
}
const attempt=async action=>{try{return {ok:true,value:await action()};}catch(e){return {ok:false,error:String(e.message).slice(0,240),rpcCode:e.rpcCode??null};}};
async function checkpoint(endpoint,number,expectedHash=null){
 const tag=toQuantity(number),block=await rpc(endpoint,'eth_getBlockByNumber',[tag,false]);if(!block||Number(BigInt(block.number))!==number||expectedHash&&block.hash!==expectedHash)throw Error('CHECKPOINT_HEADER_MISMATCH');
 const code=Object.fromEntries(await Promise.all(['factory','router','wbnb','pair'].map(async role=>[role,await attempt(async()=>{const bytes=await rpc(endpoint,'eth_getCode',[capture.codes[role].address,tag]);if(keccak256(bytes)!==capture.codes[role].runtimeHash)throw Error('RUNTIME_HASH_MISMATCH');return {runtimeHash:keccak256(bytes),runtimeBytes:(bytes.length-2)/2};})])));
 const call=async(role,method)=>{const raw=await rpc(endpoint,'eth_call',[{to:capture.codes[role].address,data:abi.encodeFunctionData(method,[])},tag]);return [...abi.decodeFunctionResult(method,raw)].map(String);};
 const [pairs,feeTo,reserves,storage]=await Promise.all([attempt(()=>call('factory','allPairsLength')),attempt(()=>call('factory','feeTo')),attempt(()=>call('pair','getReserves')),attempt(async()=>{const value=await rpc(endpoint,'eth_getStorageAt',[capture.codes.factory.address,'0x0',tag]);if(!/^0x[0-9a-fA-F]{64}$/.test(value))throw Error('INVALID_STORAGE_WORD');return value;})]);
 const recheck=await rpc(endpoint,'eth_getBlockByNumber',[tag,false]);if(recheck.hash!==block.hash)throw Error('CHECKPOINT_CHANGED');
 return {number,hash:block.hash,parentHash:block.parentHash,stateRoot:block.stateRoot,timestamp:Number(BigInt(block.timestamp)),code,pairs,feeTo,reserves,storage,
  basicHistoricalStateReadable:Object.values(code).every(x=>x.ok)&&[pairs,feeTo,reserves,storage].every(x=>x.ok),archiveCoverageProven:false};
}
const results=await Promise.all(endpoints.map(async endpoint=>{
 const base={endpoint,source:endpoint.includes('publicnode')?'https://www.publicnode.com/':'https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/'};
 return {...base,...await attempt(async()=>{if(BigInt(await rpc(endpoint,'eth_chainId'))!==56n)throw Error('WRONG_CHAIN');const latest=Number(BigInt(await rpc(endpoint,'eth_blockNumber')));return {chainId:56,latest,previousCapture:await attempt(()=>checkpoint(endpoint,capture.blockNumber,capture.blockHash)),recentConfirmed:await attempt(()=>checkpoint(endpoint,latest-64))};})};
}));
const inputFiles=['scripts/probe-historical-rpc.mjs','references/pancake-v2/deployed-runtime.json','package-lock.json'];
const result={at:new Date().toISOString(),readOnly:true,remoteWrites:false,realWalletUsed:false,historicalForkExecuted:false,results,inputHashes:Object.fromEntries(inputFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))};
fs.writeFileSync(path.join(root,'evidence/historical-rpc-probe.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(results.map(x=>({endpoint:x.endpoint,ok:x.ok,error:x.error,latest:x.value?.latest,previousCapture:x.value?.previousCapture.ok&&x.value.previousCapture.value.basicHistoricalStateReadable,recent:x.value?.recentConfirmed.ok&&x.value.recentConfirmed.value.basicHistoricalStateReadable,feeTo:x.value?.recentConfirmed.value?.feeTo})),null,2));
