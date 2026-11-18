#!/usr/bin/env node
import fs from 'node:fs';
import {parseArgs} from 'node:util';
import {FetchRequest,JsonRpcProvider,parseEther} from 'ethers';
import {LaunchAgentClient} from '../lib/agent-client.mjs';

const jsonFile=file=>{
 if(!file)throw Error('JSON_FILE_REQUIRED');
 if(fs.statSync(file).size>2*1024*1024)throw Error('JSON_FILE_TOO_LARGE');
 return JSON.parse(fs.readFileSync(file,'utf8'));
};
const options=Object.fromEntries(['config','rpc','project','wallet','handle','units','budget-wei','budget-bnb','request-id','deadline','action','ids','keys','version-id','terms-file','content-car','quote-file','consent-file','hash','offset','limit'].map(k=>[k,{type:'string'}]));
let provider;
try{
 const {values:v,positionals}=parseArgs({options,allowPositionals:true,strict:true}),command=positionals[0]||'status';
 if(positionals.length>1)throw Error('INVALID_COMMAND');
 const config=jsonFile(v.config||new URL('../runtime-config.json',import.meta.url));
 if(command==='status'){
  const client=new LaunchAgentClient({provider:null,config});console.log(JSON.stringify(client.configStatus(),null,2));
 }else{
  if(!config.registry?.address)throw Error('LAUNCH_NOT_DEPLOYED');
  const endpoint=v.rpc||process.env.ECHO_LAUNCH_RPC_URL;if(!endpoint)throw Error('RPC_REQUIRED');
  const url=new URL(endpoint),loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(config.mode==='local-test'&&loopback&&url.protocol==='http:'))throw Error('HTTPS_RPC_REQUIRED');
  const request=new FetchRequest(endpoint);request.timeout=15000;
  provider=new JsonRpcProvider(request,{chainId:config.chainId,name:config.mode},{staticNetwork:true,cacheTimeout:-1});
  const client=new LaunchAgentClient({provider,config}),input={project:v.project,wallet:v.wallet,handle:v.handle};
  let result;
  if(command==='list')result=await client.list({offset:Number(v.offset||0),limit:Number(v.limit||50)});
  else if(command==='snapshot')result=await client.snapshot(v.project,{wallet:v.wallet,handle:v.handle});
  else if(command==='quote-create')result=await client.quoteCreate({...input,versionId:v['version-id'],terms:jsonFile(v['terms-file']),requestId:v['request-id'],deadline:v.deadline,contentCarPath:v['content-car']});
  else if(command==='recover-create')result=await client.recoverCreation({...input,versionId:v['version-id'],requestId:v['request-id']});
  else if(command==='recover-distribution')result=await client.recoverDistribution({project:v.project,keys:v.keys?.split(',').map(s=>s.trim())});
  else if(command==='quote'){
   const action=v.action||'subscribe';
   if(v['budget-wei']!==undefined&&v['budget-bnb']!==undefined)throw Error('AMBIGUOUS_BUDGET');
   const budgetWei=v['budget-bnb']===undefined?v['budget-wei']:parseEther(v['budget-bnb']).toString();
   result=action==='distribute'?await client.quoteDistribution({...input,keys:v.keys?.split(',').map(s=>s.trim()),offset:Number(v.offset||0),limit:Number(v.limit||50),deadline:v.deadline}):
    action==='subscribe'?await client.quoteSubscription({...input,units:v.units,budgetWei,requestId:v['request-id'],deadline:v.deadline,contentCarPath:v['content-car']}):
    await client.quoteAction({...input,action,ids:v.ids?.split(',').map(s=>s.trim()),deadline:v.deadline});
  }else if(command==='prepare')result=await client.prepare(jsonFile(v['quote-file']),jsonFile(v['consent-file']),{contentCarPath:v['content-car']});
  else if(command==='receipt')result=await client.verifyReceipt({project:v.project,transactionHash:v.hash,quote:jsonFile(v['quote-file'])});
  else if(command==='recover')result=await client.recover({...input,requestId:v['request-id'],transactionHash:v.hash,quote:v['quote-file']?jsonFile(v['quote-file']):undefined});
  else throw Error('INVALID_COMMAND');
  console.log(JSON.stringify(result,null,2));
 }
}catch(error){
 // Never echo RPC URLs, request headers, arbitrary JSON, wallet secrets or raw provider diagnostics.
 const code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'READ_OR_SIMULATION_FAILED';
 console.error(JSON.stringify({error:code,broadcast:false}));process.exitCode=1;
}finally{provider?.destroy();}
