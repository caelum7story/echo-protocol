import {DatabaseSync}from'node:sqlite';import path from'node:path';import{createHash}from'node:crypto';import{spawn}from'node:child_process';
import {assertDeploymentConsent} from './deployment-consent.mjs';
const fail=code=>{throw Error(code);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
export const reviewDigest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const hash=v=>/^0x[0-9a-fA-F]{64}$/.test(v??''),integer=v=>Number.isSafeInteger(v)&&v>=0;
const expiryMs=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?(v<1e12?v*1000:v):typeof v==='string'?Date.parse(v):NaN;
const uint=v=>{if(!/^(0|[1-9][0-9]*)$/.test(String(v)))fail('WALLET_RECEIPT_INTEGER');return BigInt(v);};

// Public RPC reads only. A canonical transaction is not proof of delivery or deployment.
export async function readOfficialWalletReceipt({review,provider,transactionHash,clock=Date.now}){
 const txHash=transactionHash??review?.result?.txHash;
 if(!hash(txHash)||review?.transaction?.chainId!==56||!integer(review.submissionProof?.pendingNonce)||review.submissionProof.confirmedNonce!==review.submissionProof.pendingNonce||review.submissionProof.transactionDigest!==reviewDigest(review.transaction))fail('WALLET_RECEIPT_SUBMISSION_PROOF_REQUIRED');
 if(review.result?.txHash&&!same(txHash,review.result.txHash))fail('WALLET_RECEIPT_HASH_CHANGED');
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==56)fail('WALLET_RECEIPT_WRONG_CHAIN');
 const [receipt,transaction,head]=await Promise.all([provider.getTransactionReceipt(txHash),provider.getTransaction(txHash),provider.getBlock('latest')]);
 const now=Math.floor(clock()/1000);
 if(!head||!integer(head.number)||!integer(head.timestamp)||!hash(head.hash)||now-head.timestamp>120||head.timestamp>now+30)fail('WALLET_RECEIPT_STALE_HEAD');
 if(transaction){
  const expected=review.transaction;
  if(!same(transaction.hash,txHash)||Number(transaction.chainId)!==56||!same(transaction.from,expected.from)||!same(transaction.to,expected.to)||!same(transaction.data,expected.data)||uint(transaction.value)!==uint(expected.value)||transaction.nonce!==review.submissionProof.pendingNonce||expected.gasLimit!==undefined&&uint(transaction.gasLimit)!==uint(expected.gasLimit))fail('WALLET_RECEIPT_TRANSACTION_MISMATCH');
 }
 if(!receipt)return {status:transaction?'pending':'not-found',transactionHash:txHash,confirmed:false,retryAllowed:false,broadcast:false};
 if(!transaction||!same(receipt.hash,txHash)||!integer(receipt.blockNumber)||receipt.blockNumber>head.number||!hash(receipt.blockHash)||!same(transaction.blockHash,receipt.blockHash)||transaction.blockNumber!==receipt.blockNumber||![0,1].includes(receipt.status))fail('WALLET_RECEIPT_INVALID');
 const block=await provider.getBlock(receipt.blockNumber);
 if(!block||block.number!==receipt.blockNumber||!same(block.hash,receipt.blockHash)||!integer(block.timestamp)||block.timestamp>head.timestamp)fail('WALLET_RECEIPT_REORG');
 const confirmations=head.number-receipt.blockNumber+1;
 if(confirmations<12)return {status:'confirming',transactionHash:txHash,confirmations,requiredConfirmations:12,confirmed:false,retryAllowed:false,broadcast:false};
 const gasUsed=uint(receipt.gasUsed),gasPrice=uint(receipt.gasPrice),gasLimit=uint(transaction.gasLimit),actualFeeWei=gasUsed*gasPrice;
 const feeCap=uint(transaction.maxFeePerGas??transaction.gasPrice);
 if(gasUsed===0n||gasUsed>gasLimit||gasPrice>feeCap||receipt.fee!==undefined&&uint(receipt.fee)!==actualFeeWei)fail('WALLET_RECEIPT_FEE_MISMATCH');
 const [after,blockAfter,headAfter]=await Promise.all([provider.getTransactionReceipt(txHash),provider.getBlock(receipt.blockNumber),provider.getBlock(head.number)]);
 if(!after||!same(after.blockHash,receipt.blockHash)||after.status!==receipt.status||uint(after.gasUsed)!==gasUsed||uint(after.gasPrice)!==gasPrice||!same(blockAfter?.hash,block.hash)||!same(headAfter?.hash,head.hash))fail('WALLET_RECEIPT_REORG');
 return {schema:'echo-launch-official-wallet-receipt/v1',status:receipt.status===1?'receipt-confirmed':'transaction-failed',transactionHash:txHash,chainId:56,nonce:transaction.nonce,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,confirmations,requiredConfirmations:12,transactionSucceeded:receipt.status===1,canonicalAtObservation:true,observedAtMs:clock(),gasUsed:String(gasUsed),gasPriceWei:String(gasPrice),actualFeeWei:String(actualFeeWei),feeEnvelopePreviouslyBound:false,budgetReconciled:false,intentVerified:false,confirmed:false,retryAllowed:false,broadcast:false};
}
export function officialTransport(input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.resolve(import.meta.dirname,'../scripts/official-wallet-stdio.mjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,NODE_USE_ENV_PROXY:'1'}});let output='',size=0;const timer=setTimeout(()=>child.kill(),45000);child.stdout.on('data',b=>{size+=b.length;if(size>1048576)child.kill();else output+=b;});child.stderr.resume();child.on('error',reject);child.on('close',()=>{clearTimeout(timer);try{resolve(JSON.parse(output));}catch{reject(Error('OFFICIAL_WALLET_RESULT_UNKNOWN'));}});child.stdin.end(JSON.stringify(input)+'\n');});}
// A private manual-review bridge, not an unattended signing service.
export class OfficialWalletReviews{
 #db;#wallet;#transport;#clock;
 constructor({databasePath,wallet,transport=officialTransport,clock=Date.now}){if(!/^0x[0-9a-fA-F]{40}$/.test(wallet)||!path.isAbsolute(databasePath))fail('WALLET_REVIEW_SCOPE');this.#wallet=wallet;this.#transport=transport;this.#clock=clock;this.#db=new DatabaseSync(path.toNamespacedPath(databasePath));this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS wallet_reviews(id TEXT PRIMARY KEY,payload TEXT NOT NULL,phase TEXT NOT NULL,result TEXT);');}
 close(){this.#db.close();}
 get(id){const row=this.#db.prepare('SELECT * FROM wallet_reviews WHERE id=?').get(id);if(!row)return null;const payload=JSON.parse(row.payload);if(!same(payload.transaction?.from,this.#wallet))fail('WALLET_REVIEW_SCOPE');return {id:row.id,phase:row.phase,...payload,result:row.result?JSON.parse(row.result):null};}
 async #active(){const settings=await this.#transport({command:'settings'}),dev=settings.data?.devMode,expiresAt=expiryMs(dev?.expiresAt);if(!settings.success||dev?.enabled!==true||dev.balanceExceeded===true||!Number.isFinite(expiresAt)||expiresAt<=this.#clock())fail('WALLET_DEVELOPER_MODE_REQUIRED');const address=await this.#transport({command:'address'});if(!address.success||!address.data?.addresses?.some(a=>String(a.binanceChainId)==='56'&&same(a.address,this.#wallet)))fail('WALLET_ACCOUNT_MISMATCH');}
 async preview({transaction,purpose,intentId,context={},gasLimitAuthorization}){
  if(!['deployment','distribution'].includes(purpose)||typeof intentId!=='string'||intentId.length<1||intentId.length>128||transaction?.chainId!==56||!same(transaction.from,this.#wallet)||!/^0x[0-9a-fA-F]{40}$/.test(transaction.to??'')||String(transaction.value)!=='0'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.data??''))fail('WALLET_REVIEW_TRANSACTION');
  const tx={chainId:56,from:this.#wallet,to:transaction.to,value:'0',data:transaction.data};
  if(gasLimitAuthorization!==undefined){const g=gasLimitAuthorization;if(purpose!=='deployment'||!['explicit-user-selection','delegated-project-deployment'].includes(g?.kind)||typeof g.source!=='string'||g.source.length<1||g.source.length>1024||!Number.isSafeInteger(g.gasLimit)||g.gasLimit<21000||g.gasLimit>15000000)fail('WALLET_GAS_LIMIT_AUTHORIZATION');tx.gasLimit=String(g.gasLimit);context={...context,gasLimitAuthorization:g};}
  const id=reviewDigest({tx,purpose,intentId}),old=this.get(id);if(old&&!['awaiting-confirmation','preview-rejected'].includes(old.phase))fail('WALLET_SUBMISSION_ALREADY_ATTEMPTED');
  await this.#active();const preview=await this.#transport({command:'preview',transaction:tx});if(!preview.success)return {success:false,error:preview.error,broadcast:false};const p=preview.data;
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(p?.requestId??'')||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=this.#clock()||p.simulationResult?.simulationCode!=='000000000'||p.simulationResult?.simulationErrorDetail||!same(p.parsedTx?.contractAddress,tx.to)||!p.risks||!Array.isArray(p.simulationResult.authorityChanges))fail('WALLET_PREVIEW_NOT_VERIFIED');
  const payload={schema:'echo-launch-official-wallet-review/v1',purpose,intentId,transaction:tx,context,observedAtMs:this.#clock(),preview:{requestId:p.requestId,parsedTx:p.parsedTx,simulationResult:p.simulationResult,risks:p.risks,requireConfirmation:p.requireConfirmation,expiresAt:p.expiresAt},walletFeeEnvelopeBound:false,unattendedExecutionAllowed:false};payload.approvalDigest=reviewDigest(payload);
  this.#db.prepare('INSERT INTO wallet_reviews(id,payload,phase) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,phase=excluded.phase,result=NULL').run(id,JSON.stringify(payload),'awaiting-confirmation');return {...this.get(id),broadcast:false};
 }
 async submitConfirmed({id,confirmation,revalidate}){
  const review=this.get(id);if(!review||review.phase!=='awaiting-confirmation')fail('WALLET_REVIEW_NOT_AWAITING_CONFIRMATION');
  // The official CLI does not bind the SDK's explicit fee envelope. Never attach it
  // to the automatic distribution budget/lane until a verified envelope adapter exists.
  if(review.purpose==='distribution')fail('WALLET_DISTRIBUTION_FEE_ENVELOPE_UNBOUND');
  const now=this.#clock();if(review.preview.expiresAt<=now)fail('WALLET_PREVIEW_EXPIRED');
  const delegated=confirmation?.authorizationType==='bounded-project-delegation',delegatedScope=delegated?assertDeploymentConsent(confirmation,review,reviewDigest(review.transaction),now):null;
  if(typeof revalidate!=='function'||!delegated&&(confirmation?.humanConfirmed!==true||confirmation.approvalDigest!==review.approvalDigest||confirmation.acknowledgedWalletEstimatedGas!==true||!Number.isSafeInteger(confirmation.confirmedAtMs)||confirmation.confirmedAtMs>now||now-confirmation.confirmedAtMs>120000))fail('FRESH_WALLET_CONFIRMATION_REQUIRED');
  await this.#active();const proof=await revalidate(review);if(proof?.intentVerified!==true||proof.chainId!==56||proof.transactionDigest!==reviewDigest(review.transaction)||proof.pendingNonce!==proof.confirmedNonce||!Number.isSafeInteger(proof.observedAtMs)||this.#clock()-proof.observedAtMs>15000||proof.observedAtMs>this.#clock())fail('WALLET_REVALIDATION_REQUIRED');
  if(delegatedScope&&(!/^(0|[1-9][0-9]*)$/.test(proof.cumulativeEstimatedFeeWei??'')||BigInt(proof.cumulativeEstimatedFeeWei)>delegatedScope.estimatedGasBudgetWei))fail('BOUNDED_DEPLOYMENT_BUDGET_EXCEEDED');
  if(this.#clock()>=review.preview.expiresAt)fail('WALLET_PREVIEW_EXPIRED');
  // Durable boundary BEFORE network execution: a crash/timeout can never cause a second execute.
  const {id:storedId,phase:storedPhase,result:storedResult,...payload}=review;
  payload.submissionProof={pendingNonce:proof.pendingNonce,confirmedNonce:proof.confirmedNonce,observedAtMs:proof.observedAtMs,transactionDigest:proof.transactionDigest};
  if(delegated)payload.submissionProof.authorization={type:'bounded-project-delegation',source:delegatedScope.userDelegationSource,recordedAtMs:confirmation.authority.recordedAtMs,expiresAtMs:confirmation.authority.expiresAtMs,estimatedBudgetWei:confirmation.authority.estimatedGasBudgetWei,estimatedBudgetIsNotSignedFeeCap:true};
  if(!integer(payload.submissionProof.pendingNonce))fail('WALLET_REVALIDATION_REQUIRED');
  const lock=this.#db.prepare("UPDATE wallet_reviews SET phase='submission-unknown',payload=? WHERE id=? AND phase='awaiting-confirmation'").run(JSON.stringify(payload),id);if(lock.changes!==1)fail('WALLET_SUBMISSION_ALREADY_ATTEMPTED');let result;
  try{result=await this.#transport({command:'execute',requestId:review.preview.requestId});}catch{return {id,status:'submission-unknown',retryAllowed:false,confirmed:false};}
  const safe=result.success?{success:true,status:result.data?.status,orderId:result.data?.orderId,txHash:result.data?.txHash??null}:{success:false,error:result.error};
  const phase=result.success&&/^0x[0-9a-fA-F]{64}$/.test(safe.txHash??'')?'submitted':result.success&&safe.status==='PENDING_CONFIRMATION'?'app-confirmation-pending':'submission-unknown';this.#db.prepare('UPDATE wallet_reviews SET phase=?,result=? WHERE id=?').run(phase,JSON.stringify(safe),id);return {id,phase,result:safe,confirmed:false,retryAllowed:false};
 }
 async reconcileReceipt({id,provider,transactionHash,verifyIntent}){
  const review=this.get(id);
  if(!review||!['submitted','submission-unknown','app-confirmation-pending','receipt-confirmed','confirmed','transaction-failed','receipt-review-hold'].includes(review.phase))fail('WALLET_RECEIPT_REVIEW_REQUIRED');
  try{
   const receipt=await readOfficialWalletReceipt({review,provider,transactionHash,clock:this.#clock});
   if(!receipt.canonicalAtObservation){
    if(review.result?.receipt?.canonicalAtObservation)fail('WALLET_RECEIPT_PREVIOUS_PROOF_LOST');
    return {id,...receipt};
   }
   if(receipt.transactionSucceeded&&verifyIntent){
    const proof=await verifyIntent({review,receipt});
    if(proof?.intentVerified!==true||!same(proof.transactionHash,receipt.transactionHash)||!same(proof.blockHash,receipt.blockHash)||proof.transactionDigest!==reviewDigest(review.transaction))fail('WALLET_RECEIPT_INTENT_UNVERIFIED');
    // Verify canonical inclusion again after potentially slow domain-specific checks.
    const rechecked=await readOfficialWalletReceipt({review,provider,transactionHash:receipt.transactionHash,clock:this.#clock});
    if(!rechecked.canonicalAtObservation||!same(rechecked.blockHash,receipt.blockHash))fail('WALLET_RECEIPT_REORG');
    receipt.intentVerified=true;receipt.confirmed=true;receipt.status='confirmed';
   }
   const result={...review.result,txHash:receipt.transactionHash,receipt};
   this.#db.prepare('UPDATE wallet_reviews SET phase=?,result=? WHERE id=? AND phase=?').run(receipt.status,JSON.stringify(result),id,review.phase);
   return {id,...receipt};
  }catch(error){
   const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message??'')?error.message:'WALLET_RECEIPT_READ_FAILED';
   this.#db.prepare('UPDATE wallet_reviews SET phase=?,result=? WHERE id=? AND phase=?').run('receipt-review-hold',JSON.stringify({...review.result,receipt:null,receiptError:code}),id,review.phase);
   throw Error(code);
  }
 }
 recovery(id){const r=this.get(id);if(!r)fail('WALLET_REVIEW_NOT_FOUND');return {id,phase:r.phase,transaction:r.transaction,result:r.result,safeToResubmit:false,requiresCanonicalReceiptAndEnvelopeVerification:true,distributionBudgetNotDebited:true};}
}
