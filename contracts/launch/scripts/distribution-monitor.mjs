import {createHash} from 'node:crypto';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const anchors=proof=>proof.positions.map(p=>({key:p.key.toLowerCase(),wallet:p.wallet.toLowerCase(),units:String(p.units),delivered:p.delivered})).sort((a,b)=>a.key.localeCompare(b.key));
const fail=code=>{throw Error(code);};
function classified(error){const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message??'')?error.message:'RPC_UNAVAILABLE';return {code,status:['REORGED_RECEIPT','REORG_DURING_READ','MONITOR_CANONICAL_PROOF_LOST'].includes(code)?'canonical-proof-lost':['WRONG_CHAIN','MONITOR_CONFIGURATION_MISMATCH','LAUNCH_NOT_DEPLOYED','UNAPPROVED_TEMPLATE','REGISTRY_CODE_MISMATCH','PROJECT_BINDING_MISMATCH','FACTORY_CODE_MISMATCH'].includes(code)?'configuration-mismatch':code==='RPC_UNAVAILABLE'||['TIMEOUT','NETWORK_ERROR','SERVER_ERROR','UNKNOWN_ERROR','BLOCK_UNAVAILABLE','STALE_BLOCK'].includes(code)?'rpc-unavailable':'proof-rejected'};}

async function inspectCompleted({candidate,client,provider,chainId}){
 const {job,previousVerifiedObservation:previous}=candidate,outcome=JSON.parse(job.outcome_json??'null'),base={schema:'echo-launch-distribution-monitor-observation/v1',chainId,broadcast:false,safeToResubmit:false};
 try{
  if(Number(BigInt(await provider.send('eth_chainId',[])))!==chainId||client.configStatus().chainId!==chainId)fail('MONITOR_CONFIGURATION_MISMATCH');
  if(!outcome?.positionAnchors||outcome.positionAnchors.length!==job.keys.length)return {...base,status:'legacy-proof-needs-review',code:'COMPLETION_ANCHORS_MISSING'};
  const initialBlock=await provider.getBlock('latest');if(!initialBlock?.hash)fail('BLOCK_UNAVAILABLE');let receipt=null,receiptProof=null;
  if(job.tx_hash){
   const raw=await provider.getTransactionReceipt(job.tx_hash);if(!raw)return {...base,status:'receipt-unavailable',code:'COMPLETED_RECEIPT_NOT_FOUND'};
   receipt={transactionHash:job.tx_hash,blockNumber:raw.blockNumber,blockHash:raw.blockHash.toLowerCase()};
   if(outcome.receiptBlock!==raw.blockNumber||previous?.receipt&&(previous.receipt.blockNumber!==raw.blockNumber||!same(previous.receipt.blockHash,raw.blockHash)))return {...base,status:'receipt-relocated',code:'COMPLETED_RECEIPT_ANCHOR_CHANGED',receipt};
   receiptProof=await client.verifyReceipt({project:job.project,transactionHash:job.tx_hash,quote:job.quote});
   if(receiptProof.confirmed!==true||receiptProof.action!=='distribute'||receiptProof.broadcast!==false||!same(receiptProof.transactionHash,job.tx_hash)||receiptProof.blockNumber!==raw.blockNumber)return {...base,status:'receipt-unavailable',code:'COMPLETED_RECEIPT_NO_LONGER_CONFIRMED',receipt};
   if(!Array.isArray(receiptProof.deliveryItems)||receiptProof.deliveryItems.length!==job.quote.deliveries.length)fail('MONITOR_DELIVERY_PROOF');
   for(const expected of job.quote.deliveries){const matches=receiptProof.deliveryItems.filter(p=>same(p.key,expected.key));if(matches.length!==1||!same(matches[0].wallet,expected.wallet)||String(matches[0].tokenAmount)!==String(expected.tokenAmount)||matches[0].ledgerDelivered!==true||typeof matches[0].receiptConfirmed!=='boolean')fail('MONITOR_DELIVERY_PROOF');}
   if(receiptProof.deliveryItems.filter(p=>p.receiptConfirmed).length!==outcome.receiptProvenCount)fail('MONITOR_RECEIPT_ATTRIBUTION_CHANGED');
  }
  const reconciliation=await client.recoverDistribution({project:job.project,keys:job.keys});
  if(reconciliation.broadcast!==false||reconciliation.safeToResubmit!==false||!Array.isArray(reconciliation.positions)||reconciliation.positions.length!==job.keys.length)fail('MONITOR_LEDGER_PROOF');
  const current=anchors(reconciliation),original=[...outcome.positionAnchors].sort((a,b)=>a.key.localeCompare(b.key));
  if(JSON.stringify(current)!==JSON.stringify(original)||current.some(p=>BigInt(p.units)>0n&&p.delivered!==true))return {...base,status:'positions-changed',code:'COMPLETED_ENTITLEMENTS_CHANGED',blockNumber:reconciliation.blockNumber,checkedPositions:current.length};
  if((await provider.getBlock(initialBlock.number))?.hash!==initialBlock.hash)fail('MONITOR_CANONICAL_PROOF_LOST');
  if(receipt){const again=await provider.getTransactionReceipt(job.tx_hash),block=await provider.getBlock(receipt.blockNumber);if(!again||!same(again.blockHash,receipt.blockHash)||block?.hash!==receipt.blockHash)fail('MONITOR_CANONICAL_PROOF_LOST');}
  return {...base,status:'verified',blockNumber:reconciliation.blockNumber,checkedPositions:current.length,positionsDigest:digest(current),receipt,receiptProvenCount:receiptProof?.deliveryItems.filter(p=>p.receiptConfirmed).length??0,receiptAttribution:receipt?'original-batch-reverified':'no-operator-receipt-attributed',referenceBlock:{number:initialBlock.number,hash:initialBlock.hash}};
 }catch(error){return {...base,...classified(error)};}
}

// One bounded pass. No scheduler,signer,alert delivery service or automatic hold-clear path is installed.
export async function monitorDistributionBatch({queue,client,provider,limit=20,cursorNamespace='operator',serviceLease}){
 const batch=queue.claimMonitorBatch({limit,cursorNamespace,serviceLease}),results=[];
 for(const candidate of batch.candidates){const observation=await inspectCompleted({candidate,client,provider,chainId:queue.scope.chainId});try{results.push(queue.recordMonitorObservation({id:candidate.job.id,ticket:candidate.ticket,fingerprint:candidate.fingerprint,observation}));}catch(error){if(error.message!=='QUEUE_STALE_MONITOR_OBSERVATION')throw error;results.push({id:candidate.job.id,status:'stale-observation-discarded',broadcast:false});}}
 return {checked:results.length,wrapped:batch.wrapped,atEnd:batch.atEnd,totalCompleted:batch.totalCompleted,results,monitorHold:queue.monitorHold,readOnlyChain:true,automaticResumeAllowed:false,scheduledServiceRunning:false,broadcast:false};
}
