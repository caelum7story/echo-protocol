import {createHash} from 'node:crypto';
import {getAddress,ZeroAddress} from 'ethers';
import {jsonSafe} from '../lib/agent-client.mjs';
const fail=code=>{throw Error(code);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export const budgetUint=(value,positive=false)=>{if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>=1n<<256n||positive&&BigInt(value)===0n)fail('QUEUE_BUDGET_INTEGER');return BigInt(value);};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail('QUEUE_BUDGET_NUMBER');return value;};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
export const budgetDigest=value=>createHash('sha256').update(JSON.stringify(canonical(jsonSafe(value)))).digest('hex');
export const budgetDay=millis=>new Date(integer(millis)).toISOString().slice(0,10);
export function normalizeBudgetPolicy(input,{chainId,wallet}){
 if(input?.schema!=='echo-launch-distribution-budget-policy/v1'||input.chainId!==chainId||!same(input.wallet,wallet)||typeof input.enabled!=='boolean')fail('QUEUE_BUDGET_POLICY');
 let normalizedWallet;try{normalizedWallet=getAddress(input.wallet);if(normalizedWallet===ZeroAddress)fail('QUEUE_BUDGET_POLICY');}catch{fail('QUEUE_BUDGET_POLICY');}
 const policy={schema:input.schema,chainId,wallet:normalizedWallet.toLowerCase(),enabled:input.enabled};
 for(const field of ['maxPerTxWei','maxDailyWei','minimumBalanceWei','maxFeePerGasWei','maxGasUnits']){budgetUint(input[field],field!=='minimumBalanceWei');policy[field]=input[field];}
 policy.maxObservationAgeMs=integer(input.maxObservationAgeMs,1000,60000);policy.confirmations=integer(input.confirmations,1,128);
 if(BigInt(policy.maxPerTxWei)>BigInt(policy.maxDailyWei))fail('QUEUE_BUDGET_POLICY');
 return {...policy,policyHash:budgetDigest(policy),financialAuthorization:false};
}
function feeEnvelope(transaction,observedTransaction=false){
 const gasLimit=budgetUint(String(transaction.gasLimit),true);let fee;
 if(transaction.maxFeePerGas!==undefined&&transaction.maxFeePerGas!==null){fee=budgetUint(String(transaction.maxFeePerGas),true);const priority=budgetUint(String(transaction.maxPriorityFeePerGas));if(priority>fee||!observedTransaction&&transaction.gasPrice!==undefined&&transaction.gasPrice!==null)fail('QUEUE_BUDGET_FEE_ENVELOPE');}
 else fee=budgetUint(String(transaction.gasPrice),true);
 return {gasLimit,fee,maximum:gasLimit*fee};
}
export function validateBudgetCheck({check,job,policy,nonce,gasCapWei,now}){
 if(check?.schema!=='echo-launch-distribution-budget-check/v1'||check.chainId!==policy.chainId||check.jobId!==job.id||!same(check.wallet,policy.wallet)||check.quoteHash!==job.quote?.quoteHash||check.policyHash!==policy.policyHash||check.gasCapWei!==gasCapWei||check.financialAuthorization!==false||check.broadcast!==false)fail('QUEUE_BUDGET_CHECK_SCOPE');
 const {checkHash,...payload}=check;if(checkHash!==budgetDigest(payload))fail('QUEUE_BUDGET_CHECK_INTEGRITY');
 const at=integer(check.observedAtMs);if(at>now||now-at>policy.maxObservationAgeMs||!Number.isSafeInteger(check.consentExpiresAt)||Math.floor(now/1000)>check.consentExpiresAt||check.consentExpiresAt>job.quote.deadline)fail('QUEUE_BUDGET_CHECK_EXPIRED');
 integer(check.blockNumber);if(!/^0x[0-9a-f]{64}$/.test(check.blockHash??'')||check.pendingNonce!==nonce||check.confirmedNonce!==nonce)fail('QUEUE_BUDGET_PENDING_NONCE');
 const prepared=check.prepared,transaction=prepared?.transaction;
 if(prepared?.schema!=='echo-launch-unsigned/v1'||prepared.action!=='distribute'||prepared.chainId!==policy.chainId||prepared.quoteHash!==job.quote.quoteHash||prepared.approvedGasCapWei!==gasCapWei||prepared.broadcast!==false||prepared.walletPreviewRequired!==true||prepared.walletConfirmationRequired!==true||!transaction||!same(transaction.from,policy.wallet)||!same(transaction.to,job.project)||transaction.chainId!==policy.chainId||String(transaction.value)!=='0'||transaction.data!==job.quote.transaction.data)fail('QUEUE_BUDGET_PREPARED_CALL');
 const fee=feeEnvelope(transaction),cap=budgetUint(gasCapWei,true),balance=budgetUint(check.balanceWei);
 if(fee.maximum!==budgetUint(prepared.maximumEstimatedGasWei,true)||fee.maximum>cap||cap>BigInt(policy.maxPerTxWei)||fee.fee>BigInt(policy.maxFeePerGasWei)||fee.gasLimit>BigInt(policy.maxGasUnits))fail('QUEUE_BUDGET_FEE_CAP');
 return {cap,balance,fee,transaction};
}
export async function prepareDistributionBudget({queue,client,provider,id,consent,clock=Date.now}){
 const job=queue.get(id),policy=queue.budgetPolicy;if(!policy?.enabled)fail('QUEUE_BUDGET_POLICY_REQUIRED');if(job?.phase!=='quoted')fail('QUEUE_BUDGET_QUOTE_REQUIRED');
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==policy.chainId||client.configStatus().chainId!==policy.chainId)fail('QUEUE_BUDGET_WRONG_CHAIN');
 const prepared=await client.prepare(job.quote,consent),block=await provider.getBlock('latest');if(!block?.hash)fail('QUEUE_BUDGET_BLOCK_UNAVAILABLE');
 const [balance,confirmedNonce,pendingNonce]=await Promise.all([provider.getBalance(policy.wallet,block.number),provider.getTransactionCount(policy.wallet,'latest'),provider.getTransactionCount(policy.wallet,'pending')]);
 if(confirmedNonce!==pendingNonce)fail('QUEUE_BUDGET_PENDING_NONCE');if((await provider.getBlock(block.number))?.hash!==block.hash)fail('QUEUE_BUDGET_REORG');
 const payload=jsonSafe({schema:'echo-launch-distribution-budget-check/v1',chainId:policy.chainId,wallet:policy.wallet,jobId:id,quoteHash:job.quote.quoteHash,policyHash:policy.policyHash,observedAtMs:integer(clock()),blockNumber:block.number,blockHash:block.hash.toLowerCase(),balanceWei:String(balance),confirmedNonce,pendingNonce,gasCapWei:String(consent.gasCapWei),consentExpiresAt:Number(prepared.consentExpiresAt),prepared,financialAuthorization:false,broadcast:false,walletPreviewAndConfirmationStillRequired:true,directEvmFeeEnvelopeOnly:true});
 const check={...payload,checkHash:budgetDigest(payload)};validateBudgetCheck({check,job,policy,nonce:confirmedNonce,gasCapWei:check.gasCapWei,now:payload.observedAtMs});return check;
}
function matchesEnvelope(actual,expected){
 for(const field of ['from','to','data'])if(!same(actual[field],expected[field]))return false;
 for(const field of ['chainId','value','gasLimit'])if(String(actual[field])!==String(expected[field]))return false;
 const a=feeEnvelope(actual,true),b=feeEnvelope(expected);return a.fee===b.fee&&String(actual.maxPriorityFeePerGas??null)===String(expected.maxPriorityFeePerGas??null);
}
export async function settleDistributionBudget({queue,client,provider,id}){
 const reservation=queue.budgetReservation(id),job=queue.get(id);if(!reservation||!job?.tx_hash)fail('QUEUE_BUDGET_KNOWN_HASH_REQUIRED');
 try{
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==queue.scope.chainId||client.configStatus().chainId!==queue.scope.chainId)fail('QUEUE_BUDGET_WRONG_CHAIN');
 const [receipt,transaction,head]=await Promise.all([provider.getTransactionReceipt(job.tx_hash),provider.getTransaction(job.tx_hash),provider.getBlock('latest')]);
 if(!receipt){if(['confirmed','reconciled'].includes(job.phase))queue.holdBudget(id,'QUEUE_BUDGET_COMPLETED_RECEIPT_MISSING');return {status:'awaiting-receipt',reservationRetained:true,broadcast:false};}
 if(!transaction||Number(transaction.nonce)!==reservation.nonce||!matchesEnvelope(transaction,reservation.transaction))fail('QUEUE_BUDGET_RECEIPT_ENVELOPE');
 const block=await provider.getBlock(receipt.blockNumber);if(!block?.hash||!same(block.hash,receipt.blockHash))fail('QUEUE_BUDGET_REORG');
 const confirmations=head.number-receipt.blockNumber+1;if(confirmations<reservation.confirmations)return {status:'awaiting-confirmations',confirmations,reservationRetained:true,broadcast:false};
 if(![0,1].includes(Number(receipt.status)))fail('QUEUE_BUDGET_RECEIPT_STATUS');
 const gasUsed=budgetUint(String(receipt.gasUsed),true),gasPrice=budgetUint(String(receipt.gasPrice)),fee=gasUsed*gasPrice;if(gasUsed>BigInt(transaction.gasLimit)||gasPrice>feeEnvelope(reservation.transaction).fee||fee>BigInt(reservation.capWei)||receipt.fee!==undefined&&BigInt(receipt.fee)!==fee)fail('QUEUE_BUDGET_RECEIPT_FEE');
 const after=await provider.getTransactionReceipt(job.tx_hash);if(!after||!same(after.blockHash,receipt.blockHash)||(await provider.getBlock(receipt.blockNumber))?.hash!==block.hash||(await provider.getBlock(head.number))?.hash!==head.hash)fail('QUEUE_BUDGET_REORG');
 const proof={schema:'echo-launch-distribution-fee-proof/v1',chainId:queue.scope.chainId,id,attempt:reservation.attempt,nonce:reservation.nonce,transactionHash:job.tx_hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash.toLowerCase(),receiptDay:budgetDay(Number(block.timestamp)*1000),status:Number(receipt.status),gasUsed:String(gasUsed),gasPriceWei:String(gasPrice),actualFeeWei:String(fee),confirmations,canonicalAtObservation:true,broadcast:false};
 return {status:'fee-accounted',reservation:queue.settleBudgetReservation(id,proof),deliverySuccessNotInferred:true,retryAuthorized:false,broadcast:false};
 }catch(error){queue.holdBudget(id,/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message??'')?error.message:'RPC_UNAVAILABLE');throw error;}
}
