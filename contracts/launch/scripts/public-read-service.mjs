import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {LaunchProjectIndex} from '../lib/project-index.mjs';
import {createPublicReadServer} from '../lib/public-read-server.mjs';

const {values:v}=parseArgs({options:{config:{type:'string'},policy:{type:'string'},db:{type:'string'},'start-block':{type:'string'},port:{type:'string',default:'4220'}}});
if(!v.config||!v.policy||!v.db||!/^\d+$/.test(v['start-block']??''))throw Error('Usage: public-read-service.mjs --config <verified-runtime.json> --policy <read-policy.json> --db <private-index.sqlite> --start-block <registry-deployment-block> [--port 4220]');
const config=JSON.parse(await fs.readFile(v.config,'utf8')),policy=JSON.parse(await fs.readFile(v.policy,'utf8'));
if(![56,97].includes(config.chainId)||policy.chainId!==config.chainId||!config.registry?.address||!config.registry.runtimeHash||config.registry.address.toLowerCase()!==policy.registry?.toLowerCase())throw Error('VERIFIED_PUBLIC_LAUNCH_BINDINGS_REQUIRED');
if(!Number.isSafeInteger(Number(v['start-block']))||!Number.isSafeInteger(Number(v.port))||Number(v.port)<1||Number(v.port)>65535)throw Error('PUBLIC_READ_ARGUMENTS');
let rpc;
try{rpc=new URL(process.env.ECHO_LAUNCH_RPC_URL??'');}catch{throw Error('PUBLIC_HTTPS_RPC_REQUIRED');}
if(rpc.protocol!=='https:'||rpc.username||rpc.password||rpc.hash)throw Error('PUBLIC_HTTPS_RPC_REQUIRED');
const request=new FetchRequest(rpc.href);request.timeout=12000;
const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});let index,service,stopping=false;
async function close(){if(stopping)return;stopping=true;await service?.close();index?.close();provider.destroy();}
try{
  index=new LaunchProjectIndex({provider,config,databasePath:path.resolve(v.db),startBlock:Number(v['start-block']),maxBlocksPerSync:32});
  await index.sync(); // Verify chain/runtime/canonical freshness before opening a socket.
  service=await createPublicReadServer({index,policy,port:Number(v.port)});
  console.log(JSON.stringify({schema:'echo-launch-public-read-process/v1',pid:process.pid,chainId:config.chainId,listen:service.url,readOnly:true,executionReady:false,requiresExternalTlsProxy:true,signerConfigured:false}));
  process.on('SIGINT',close);process.on('SIGTERM',close);
}catch(error){await close();console.error(/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'PUBLIC_READ_START_FAILED');process.exitCode=1;}
