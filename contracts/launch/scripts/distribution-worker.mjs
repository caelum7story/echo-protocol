import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {LaunchAgentClient,jsonSafe} from '../lib/agent-client.mjs';
import {DistributionQueue,stageDistributionJob,reconcileDistributionJob} from './distribution-queue.mjs';
import {monitorDistributionBatch} from './distribution-monitor.mjs';
import {prepareDistributionBudget,settleDistributionBudget} from './distribution-budget.mjs';
import {OfficialWalletReviews} from '../lib/official-wallet-review.mjs';
let provider,queue;
const jsonFile=file=>{if(!file||fs.statSync(file).size>2*1024*1024)throw Error('OPERATOR_JSON_FILE_REQUIRED');return JSON.parse(fs.readFileSync(file,'utf8'));};
try{
 const {positionals,values:v}=parseArgs({allowPositionals:true,options:Object.fromEntries(['db','config','wallet','project','keys','job','owner','limit','offset','policy-file','consent-file','wallet-db'].map(name=>[name,{type:'string'}]))}),[command,...extra]=positionals;
 if(extra.length||!['status','alerts','enqueue','quote-next','reconcile','monitor-next','budget-status','budget-configure','budget-check','fee-reconcile','wallet-preview'].includes(command))throw Error('OPERATOR_READONLY_COMMAND');
 if(!v.db||!v.config||!v.wallet)throw Error('OPERATOR_EXPLICIT_CONFIG_REQUIRED');const config=jsonFile(v.config);
 if(['quote-next','reconcile','monitor-next','budget-check','fee-reconcile','wallet-preview'].includes(command)){
  if(!process.env.ECHO_LAUNCH_RPC_URL)throw Error('OPERATOR_EXPLICIT_RPC_REQUIRED');const request=new FetchRequest(process.env.ECHO_LAUNCH_RPC_URL);request.timeout=15000;provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});
 }
 const client=provider?new LaunchAgentClient({provider,config}):null;if(client&&!client.configStatus().configured)throw Error('LAUNCH_NOT_DEPLOYED');
 queue=new DistributionQueue({databasePath:path.resolve(v.db),chainId:config.chainId,wallet:v.wallet});let result;
 if(command==='status')result=queue.snapshot({limit:v.limit===undefined?100:Number(v.limit),offset:v.offset===undefined?0:Number(v.offset)});
 else if(command==='alerts')result=queue.monitorAlerts({limit:v.limit===undefined?100:Number(v.limit),offset:v.offset===undefined?0:Number(v.offset)});
 else if(command==='budget-status')result=queue.budgetSnapshot();
 else if(command==='budget-configure')result={policy:queue.configureBudget(jsonFile(v['policy-file'])),financialAuthorization:false,broadcast:false};
 else if(command==='budget-check')result=await prepareDistributionBudget({queue,client,provider,id:v.job,consent:jsonFile(v['consent-file'])});
 else if(command==='fee-reconcile')result=await settleDistributionBudget({queue,client,provider,id:v.job});
 else if(command==='enqueue')result={job:queue.enqueue({project:v.project,keys:v.keys?.split(',')}),broadcast:false,executionReady:false};
 else if(command==='quote-next')result=await stageDistributionJob({queue,client,owner:v.owner??'operator-cli'});
 else if(command==='wallet-preview'){
  if(!v['wallet-db']||!path.isAbsolute(v['wallet-db'])||path.resolve(v['wallet-db'])===path.resolve(v.db))throw Error('OPERATOR_SEPARATE_WALLET_JOURNAL_REQUIRED');
  const staged=await stageDistributionJob({queue,client,owner:v.owner??'operator-wallet-review',leaseMs:300000});result=staged;
  if(staged.job?.quote){const bridge=new OfficialWalletReviews({databasePath:v['wallet-db'],wallet:v.wallet});try{result={...staged,walletReview:await bridge.preview({transaction:staged.job.quote.transaction,purpose:'distribution',intentId:staged.job.id,context:{jobId:staged.job.id,quoteHash:staged.job.quote.quoteHash}}),automaticExecutionAllowed:false,executionBlocker:'OFFICIAL_WALLET_FEE_ENVELOPE_NOT_BOUND'};}finally{bridge.close();}}
 }
 else if(command==='monitor-next')result=await monitorDistributionBatch({queue,client,provider,limit:v.limit===undefined?20:Number(v.limit)});
 else result=await reconcileDistributionJob({queue,client,id:v.job});
 console.log(JSON.stringify(jsonSafe({command,result,scope:'Private operator journal, read-only SDK and optional official wallet preview;no signing or broadcast',automaticSignerConfigured:false,productionReady:false}),null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message??'')?error.message:'OPERATOR_READ_FAILED',broadcast:false,automaticSignerConfigured:false}));process.exitCode=1;}
finally{queue?.close();provider?.destroy();}
