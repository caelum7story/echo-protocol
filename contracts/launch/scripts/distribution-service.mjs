import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {LaunchAgentClient} from '../lib/agent-client.mjs';
import {DistributionQueue,reconcileDistributionJob} from './distribution-queue.mjs';
import {monitorDistributionBatch} from './distribution-monitor.mjs';
import {settleDistributionBudget} from './distribution-budget.mjs';
const fail=code=>{throw Error(code);},safeCode=error=>/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message??'')?error.message:'SERVICE_READ_FAILED';
const pause=(ms,signal)=>new Promise(resolve=>{if(signal?.aborted)return resolve();const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();},timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});});

export async function runDistributionServiceCycle({queue,client,provider,lease,clock=Date.now}){
 const startedAtMs=clock(),policy=queue.servicePolicy;let monitor={ok:false,wrapped:false,atEnd:false},receipts={ok:false,wrapped:false,atEnd:false},networkOk=false,code=null;
 try{
  if(Number(BigInt(await provider.send('eth_chainId',[])))!==queue.scope.chainId||client.configStatus().chainId!==queue.scope.chainId||!client.configStatus().configured)fail('SERVICE_NETWORK_CONFIGURATION');
  const block=await provider.getBlock('latest'),age=startedAtMs/1000-Number(block?.timestamp);if(!block?.hash||age>policy.maxBlockAgeSeconds||age < -30)fail('SERVICE_BLOCK_STALE');networkOk=true;
  const checked=await monitorDistributionBatch({queue,client,provider,limit:policy.monitorBatchSize,cursorNamespace:'service',serviceLease:lease});monitor={ok:checked.results.every(result=>result.observation?.status==='verified'),wrapped:checked.wrapped||checked.totalCompleted===0,atEnd:checked.atEnd};
  const batch=queue.serviceReceiptBatch(lease);receipts={ok:true,wrapped:batch.wrapped||batch.ids.length===0,atEnd:batch.atEnd};
  for(const id of batch.ids){try{const job=queue.get(id);if(['submitted','needs-review'].includes(job.phase))await reconcileDistributionJob({queue,client,id});if(!queue.budgetReservation(id))fail('SERVICE_LEGACY_FEE_RESERVATION_MISSING');await settleDistributionBudget({queue,client,provider,id});}catch(error){receipts.ok=false;code=safeCode(error);}}
  if((await provider.getBlock(block.number))?.hash!==block.hash)fail('SERVICE_REORG_DURING_CYCLE');
  if(queue.monitorHold||queue.budgetHold||queue.recoveryHold){monitor.ok=false;code=code??'SERVICE_JOURNAL_HELD';}
 }catch(error){code=safeCode(error);networkOk=false;}
 const health=queue.finishServiceCycle(lease,{monitor,receipts,networkOk,startedAtMs,code});return {schema:'echo-launch-readonly-service-cycle/v1',health,monitor,receipts,networkOk,code,readOnlyChain:true,financialAuthorization:false,broadcast:false};
}

export async function runDistributionService({queue,client,provider,owner,signal,maxCycles=Infinity,onCycle=()=>{},clock=Date.now}){
 if(maxCycles!==Infinity&&(!Number.isSafeInteger(maxCycles)||maxCycles<1||maxCycles>1000))fail('SERVICE_CYCLE_LIMIT');
 const policy=queue.servicePolicy;if(!policy?.enabled)fail('QUEUE_SERVICE_POLICY_REQUIRED');const lease=queue.acquireService({owner}),wake=new AbortController();let cycles=0,leaseLost=false,stopping=false;
 const heartbeat=setInterval(()=>{try{queue.renewService(lease);}catch{leaseLost=true;stopping=true;wake.abort();}},Math.max(100,Math.floor(policy.leaseMs/3)));
 const abort=()=>{stopping=true;try{queue.requestServiceStop(lease);}catch{leaseLost=true;}wake.abort();};signal?.addEventListener('abort',abort,{once:true});
 try{
  while(!stopping&&!signal?.aborted&&cycles<maxCycles){const cycle=await runDistributionServiceCycle({queue,client,provider,lease,clock});cycles++;await onCycle({...cycle,cycle:cycles});if(cycles>=maxCycles||stopping||signal?.aborted)break;await pause(policy.intervalMs,wake.signal);}
  return {status:leaseLost?'lease-lost':'stopped',cycles,financialAuthorization:false,broadcast:false,signerConfigured:false};
 }finally{stopping=true;clearInterval(heartbeat);signal?.removeEventListener('abort',abort);try{queue.releaseService(lease);}catch(error){if(error.message!=='QUEUE_SERVICE_LEASE_LOST')throw error;}}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 let provider,queue;const controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const {positionals:p,values:v}=parseArgs({allowPositionals:true,options:Object.fromEntries(['db','config','wallet','policy-file','owner','cycles'].map(key=>[key,{type:'string'}]))});if(p.length!==1||!['run','status'].includes(p[0])||!v.db||!v.config||!v.wallet)fail('SERVICE_ARGUMENTS');
  const read=file=>{if(!file||fs.statSync(file).size>2*1024*1024)fail('SERVICE_JSON_REQUIRED');return JSON.parse(fs.readFileSync(file,'utf8'));},config=read(v.config);queue=new DistributionQueue({databasePath:path.resolve(v.db),chainId:config.chainId,wallet:v.wallet});
  if(p[0]==='status')console.log(JSON.stringify(queue.serviceStatus()));
  else{
   if(!v.owner||!v['policy-file']||!process.env.ECHO_LAUNCH_RPC_URL)fail('SERVICE_EXPLICIT_CONFIGURATION');if(v.cycles!==undefined&&config.mode!=='local-test')fail('SERVICE_LOCAL_CYCLE_LIMIT_ONLY');
   const url=new URL(process.env.ECHO_LAUNCH_RPC_URL),loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);if(url.protocol!=='https:'&&!(config.mode==='local-test'&&loopback&&url.protocol==='http:'))fail('SERVICE_HTTPS_RPC_REQUIRED');
   const request=new FetchRequest(url.href);request.timeout=15000;provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});const client=new LaunchAgentClient({provider,config});if(!client.configStatus().configured)fail('LAUNCH_NOT_DEPLOYED');queue.configureService(read(v['policy-file']));
   const result=await runDistributionService({queue,client,provider,owner:v.owner,signal:controller.signal,maxCycles:v.cycles===undefined?Infinity:Number(v.cycles),onCycle:cycle=>console.log(JSON.stringify(cycle))});console.log(JSON.stringify(result));if(result.status==='lease-lost')process.exitCode=1;
  }
 }catch(error){console.error(JSON.stringify({error:safeCode(error),financialAuthorization:false,broadcast:false}));process.exitCode=1;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);queue?.close();provider?.destroy();}
}
