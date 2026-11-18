#!/usr/bin/env node
import fs from 'node:fs';
import {parseArgs} from 'node:util';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {LaunchProjectIndex} from '../lib/project-index.mjs';

let provider,index;
const number=(value,fallback)=>{if(value===undefined)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('INDEX_INTEGER');return Number(value);};
try{
 const options={...Object.fromEntries(['config','rpc','database','start-block','confirmations','max-blocks','max-reorg-depth','address','wallet','handle','offset','limit','cursor','max-pages','block','block-hash'].map(key=>[key,{type:'string'}])),'follow-history':{type:'boolean'}};
 const {values:v,positionals:p}=parseArgs({options,allowPositionals:true,strict:true}),command=p[0]??'status';
 if(p.length>1||!['sync','status','projects','events','state','history','nft-items'].includes(command))throw Error('INDEX_INVALID_COMMAND');
 if(v['follow-history']&&command!=='state'||v['max-pages']!==undefined&&!v['follow-history']||v.cursor!==undefined&&!['history','nft-items'].includes(command))throw Error('INDEX_INVALID_OPTION');
 if((v['follow-history']||['history','nft-items'].includes(command))&&!v.wallet)throw Error('PARTICIPANT_WALLET_REQUIRED');
 const maxPages=number(v['max-pages'],100);if(maxPages<1||maxPages>200)throw Error('HISTORY_PAGE_BUDGET');
 if(!v.database||v['start-block']===undefined)throw Error('INDEX_DATABASE_AND_START_REQUIRED');
 const configFile=v.config??new URL('../runtime-config.json',import.meta.url);
 if(fs.statSync(configFile).size>2*1024*1024)throw Error('INDEX_CONFIG_TOO_LARGE');
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 if(['sync','state','history','nft-items'].includes(command)){
  const endpoint=v.rpc??process.env.ECHO_LAUNCH_RPC_URL;if(!endpoint)throw Error('INDEX_RPC_REQUIRED');
  const url=new URL(endpoint),loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(config.mode==='local-test'&&loopback&&url.protocol==='http:'))throw Error('HTTPS_RPC_REQUIRED');
  const request=new FetchRequest(endpoint);request.timeout=15000;
  provider=new JsonRpcProvider(request,{chainId:config.chainId,name:config.mode},{staticNetwork:true,cacheTimeout:-1});
 }
 index=new LaunchProjectIndex({provider,config,databasePath:v.database,startBlock:number(v['start-block']),
  confirmations:number(v.confirmations,config.minConfirmations??12),maxBlocksPerSync:number(v['max-blocks'],32),maxReorgDepth:number(v['max-reorg-depth'],64)});
 let result=command==='sync'?await index.sync():command==='nft-items'?await index.nftItems({project:v.address,wallet:v.wallet,blockNumber:number(v.block),blockHash:v['block-hash'],cursor:v.cursor,limit:number(v.limit,20)}):command==='history'?await index.history({project:v.address,wallet:v.wallet,cursor:v.cursor,limit:number(v.limit,25)}):command==='state'?await index.state(v.address,{wallet:v.wallet,handle:v.handle}):command==='status'?index.status():command==='projects'?index.projects({offset:number(v.offset,0),limit:number(v.limit,50)}):index.events({address:v.address,offset:number(v.offset,0),limit:number(v.limit,50)});
 if(v['follow-history']){
  let progress=result.participantHistory,pages=0;
  while(progress&&!progress.complete&&pages<maxPages){
   const next=await index.history({project:v.address,wallet:v.wallet,cursor:progress.cursor,limit:number(v.limit,25)});pages++;progress=next.progress;
   result=next.observation??{...result,participant:null,participantHistory:progress};
  }
  result={...result,historyFollow:{complete:!progress||progress.complete,pages,cursor:progress?.cursor??null,readOnly:true,financialExecutionAllowed:false}};
 }
 console.log(JSON.stringify(result,null,2));
}catch(error){
 const code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'INDEX_READ_FAILED';
 console.error(JSON.stringify({error:code,broadcast:false,financialExecutionAllowed:false}));process.exitCode=1;
}finally{index?.close();provider?.destroy();}
