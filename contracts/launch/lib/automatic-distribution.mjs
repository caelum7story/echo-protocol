// Separate, explicitly delegated EOA path. The official-wallet fee-envelope gate
// remains unchanged. This signer can only prepare zero-value distribute calls.
import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {Interface,Transaction,keccak256} from 'ethers';
import {budgetDigest,prepareDistributionBudget} from '../scripts/distribution-budget.mjs';
const fail=c=>{throw Error(c);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),iface=new Interface(['function distribute(bytes32[] keys)']);
export const distributionRuntimeDigest=c=>budgetDigest({chainId:c.chainId,mode:c.mode,registry:c.registry,approvedTemplates:c.approvedTemplates.filter(t=>Number(t.kind)===2)});
export const distributionProjectSupported=(record,config)=>Number(record?.kind)===2&&config.approvedTemplates.some(t=>Number(t.kind)===2&&same(t.versionId,record.versionId));
export function validateDistributionAuthority(a,c,now=Date.now()){
 if(a?.schema!=='echo-launch-automatic-distribution-authority/v1'||a.confirmedByUser!==true||a.enabled!==true||a.chainId!==c.chainId||!['production:56','local-test:31337'].includes(c.mode+':'+c.chainId)||!/^0x[\da-fA-F]{40}$/.test(a.wallet??'')||/^0x0{40}$/i.test(a.wallet)||a.runtimeDigest!==distributionRuntimeDigest(c)||!a.source?.trim()||!a.confirmationId?.trim()||a.method!=='distribute(bytes32[])'||a.valueWei!=='0'||a.destinationPolicy!=='original-onchain-wallet-only')fail('AUTO_AUTHORITY_REQUIRED');
 if(!Number.isSafeInteger(a.confirmedAtMs)||!Number.isSafeInteger(a.expiresAtMs)||a.confirmedAtMs>now||a.expiresAtMs<=now||a.expiresAtMs-a.confirmedAtMs>30*86400000||!Number.isSafeInteger(a.maxBatchSize)||a.maxBatchSize<1||a.maxBatchSize>10)fail('AUTO_AUTHORITY_EXPIRED_OR_INVALID');
 for(const k of ['maxTotalGasWei','maxPerTxWei','maxDailyWei','minimumBalanceWei','maxFeePerGasWei','maxGasUnits'])if(!/^(0|[1-9]\d*)$/.test(a[k]??'')||BigInt(a[k])===0n||BigInt(a[k])>=1n<<256n)fail('AUTO_BUDGET_REQUIRED');
 if(BigInt(a.maxPerTxWei)>BigInt(a.maxDailyWei)||BigInt(a.maxDailyWei)>BigInt(a.maxTotalGasWei))fail('AUTO_BUDGET_INVALID');
 return {...a,authorityHash:budgetDigest(a)};
}
export function validateDistributionCall({authority,config,quote,transaction,now=Date.now()}){
 const a=validateDistributionAuthority(authority,config,now);
 const pin=config.approvedTemplates.find(t=>Number(t.kind)===2&&same(t.versionId,quote?.versionId));
 if(!pin||quote.action!=='distribute'||quote.kind!==2||quote.destinationPolicy!==a.destinationPolicy||quote.paymentWei!=='0'||quote.chainId!==a.chainId||!same(quote.wallet,a.wallet)||!same(transaction.from,a.wallet)||!same(transaction.to,quote.project)||Number(transaction.chainId)!==a.chainId||String(transaction.value)!=='0'||!Array.isArray(quote.keys)||!quote.keys.length||quote.keys.length>a.maxBatchSize||quote.keys.length!==quote.deliveries?.length||quote.deadline<now/1000||quote.checkedAt>now/1000+30||now/1000-quote.checkedAt>120)fail('AUTO_CALL_SCOPE');
 if(transaction.data!==iface.encodeFunctionData('distribute',[quote.keys]))fail('AUTO_METHOD_OR_ARGUMENTS_CHANGED');
 const gas=BigInt(transaction.gasLimit),fee=BigInt(transaction.maxFeePerGas??transaction.gasPrice??0);
 if(gas<=0n||fee<=0n||gas>BigInt(a.maxGasUnits)||fee>BigInt(a.maxFeePerGasWei)||gas*fee>BigInt(a.maxPerTxWei))fail('AUTO_FEE_CAP');
 return {authorityHash:a.authorityHash,maximumFeeWei:gas*fee};
}
export function assertAutomaticDistributionBudget({authority,queue,journal,requestedCapWei,balanceWei}){
 const cap=BigInt(requestedCapWei),daily=queue.budgetSnapshot();
 if(cap<=0n||cap>BigInt(authority.maxPerTxWei))fail('AUTO_FEE_CAP');
 if(BigInt(daily.spentWei)+BigInt(daily.reservedAcrossAllDaysWei)+cap>BigInt(authority.maxDailyWei))fail('QUEUE_BUDGET_DAILY_CAP');
 if(journal.usedGasWei(queue)+cap>BigInt(authority.maxTotalGasWei))fail('AUTO_LIFETIME_BUDGET');
 if(balanceWei!==undefined&&BigInt(balanceWei)<BigInt(authority.minimumBalanceWei)+BigInt(daily.reservedAcrossAllDaysWei)+cap)fail('DISTRIBUTOR_GAS_RESERVE_LOW');
}
export class DistributionSignJournal{
 #db;#scope;
 constructor(file,{chainId,wallet}){if(!path.isAbsolute(file))fail('AUTO_JOURNAL_PATH');this.#scope={chainId,wallet:wallet.toLowerCase()};this.#db=new DatabaseSync(path.toNamespacedPath(file));this.#db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS auto_scope(id INTEGER PRIMARY KEY CHECK(id=1),chain INTEGER,wallet TEXT);CREATE TABLE IF NOT EXISTS auto_attempts(job TEXT PRIMARY KEY,nonce INTEGER UNIQUE,cap TEXT,authority TEXT,phase TEXT,txhash TEXT,raw TEXT);');const old=this.#db.prepare('SELECT * FROM auto_scope WHERE id=1').get();if(old&&(old.chain!==chainId||old.wallet!==wallet.toLowerCase()))fail('AUTO_JOURNAL_SCOPE');if(!old)this.#db.prepare('INSERT INTO auto_scope VALUES(1,?,?)').run(chainId,wallet.toLowerCase());}
 close(){this.#db.close();}
 get(job){return this.#db.prepare('SELECT * FROM auto_attempts WHERE job=?').get(job);}
 rows(){return this.#db.prepare('SELECT job,nonce,cap,authority,phase,txhash FROM auto_attempts').all();}
 usedGasWei(queue){return this.rows().reduce((sum,row)=>{const r=queue.budgetReservation(row.job);return sum+BigInt(r?.status==='settled'?r.feeProof.actualFeeWei:row.cap);},0n);}
 reserve({job,nonce,cap,authority,queue,maxTotalGasWei}){this.#db.exec('BEGIN IMMEDIATE');try{if(this.get(job))fail('AUTO_SIGN_ALREADY_ATTEMPTED');const total=this.rows().reduce((sum,row)=>{const r=queue.budgetReservation(row.job);return sum+BigInt(r?.status==='settled'?r.feeProof.actualFeeWei:row.cap);},0n);if(total+BigInt(cap)>BigInt(maxTotalGasWei))fail('AUTO_LIFETIME_BUDGET');this.#db.prepare('INSERT INTO auto_attempts VALUES(?,?,?,?,?,NULL,NULL)').run(job,nonce,String(cap),authority,'reserved-before-signing');this.#db.exec('COMMIT');}catch(e){this.#db.exec('ROLLBACK');throw e;}}
 signed(job,raw){const tx=Transaction.from(raw),r=this.get(job);if(!r||r.phase!=='reserved-before-signing'||tx.nonce!==r.nonce||!same(tx.from,this.#scope.wallet)||Number(tx.chainId)!==this.#scope.chainId)fail('AUTO_SIGNED_SCOPE');this.#db.prepare("UPDATE auto_attempts SET phase='signed-not-broadcast',txhash=?,raw=? WHERE job=? AND phase='reserved-before-signing'").run(tx.hash,raw,job);return tx.hash;}
 boundary(job){const r=this.get(job);if(r?.phase!=='signed-not-broadcast')fail('AUTO_BROADCAST_ALREADY_ATTEMPTED');this.#db.prepare("UPDATE auto_attempts SET phase='broadcast-unknown' WHERE job=? AND phase='signed-not-broadcast'").run(job);return r.raw;}
 broadcast(job){this.#db.prepare("UPDATE auto_attempts SET phase='broadcast' WHERE job=? AND phase='broadcast-unknown'").run(job);}
}
export async function submitAutomaticDistribution({authority,config,queue,client,provider,signer,journal,staged,clock=Date.now}){
 const a=validateDistributionAuthority(authority,config,clock()),job=staged.job,quote=job?.quote;if(!job||!same(await signer.getAddress(),a.wallet)||queue.scope.chainId!==a.chainId||!same(queue.scope.wallet,a.wallet))fail('AUTO_SIGNER_SCOPE');
 // This is a materialized standing-scope consent, not a claim of fresh per-quote
 // human review. The original confirmed authority is separately validated/logged.
 const consent={userConfirmed:true,confirmationType:'standing-distribution-delegation',userPersonallyReviewedThisQuote:false,authorityId:a.confirmationId,chainId:a.chainId,wallet:a.wallet,project:quote.project,action:'distribute',quoteHash:quote.quoteHash,configHash:quote.configHash,maxPaymentWei:'0',gasCapWei:a.maxPerTxWei,expiresAt:String(quote.deadline)};
 const check=await prepareDistributionBudget({queue,client,provider,id:job.id,consent,clock});
 const tx={...check.prepared.transaction,nonce:check.pendingNonce};validateDistributionCall({authority,config,quote,transaction:tx,now:clock()});
 for(const k of ['maxPerTxWei','maxDailyWei','minimumBalanceWei','maxFeePerGasWei','maxGasUnits'])if(queue.budgetPolicy[k]!==a[k])fail('AUTO_POLICY_CHANGED');
 const cap=String(BigInt(tx.gasLimit)*BigInt(tx.maxFeePerGas??tx.gasPrice));
 // Check normal daily stops before journalling a signing attempt. The queue
 // reserves the full approved per-call ceiling, not just the fee estimate.
 assertAutomaticDistributionBudget({authority:a,queue,journal,requestedCapWei:check.gasCapWei,balanceWei:check.balanceWei});
 journal.reserve({job:job.id,nonce:check.pendingNonce,cap,authority:a.authorityHash,queue,maxTotalGasWei:a.maxTotalGasWei});
 const attempt=queue.beginSubmissionBoundary(staged.lease,{quoteHash:quote.quoteHash,nonce:check.pendingNonce,gasCapWei:check.gasCapWei,budgetCheck:check});
 const raw=await signer.signTransaction(tx),decoded=Transaction.from(raw);
 const feeMatches=tx.maxFeePerGas!==undefined?decoded.maxFeePerGas===BigInt(tx.maxFeePerGas)&&decoded.maxPriorityFeePerGas===BigInt(tx.maxPriorityFeePerGas):decoded.gasPrice===BigInt(tx.gasPrice);
 if(!same(decoded.from,a.wallet)||!same(decoded.to,tx.to)||decoded.data!==tx.data||decoded.value!==0n||decoded.gasLimit!==BigInt(tx.gasLimit)||!feeMatches||Number(decoded.chainId)!==a.chainId||decoded.nonce!==check.pendingNonce)fail('AUTO_SIGNER_ENVELOPE_CHANGED');
 const hash=journal.signed(job.id,raw);queue.recordSubmission({...attempt,hash,nonce:check.pendingNonce});
 const once=journal.boundary(job.id);if(keccak256(once)!==hash)fail('AUTO_RAW_HASH_CHANGED');
 try{const sent=await provider.broadcastTransaction(once);if(!same(sent.hash,hash))fail('AUTO_BROADCAST_HASH_CHANGED');journal.broadcast(job.id);return {status:'broadcast',transactionHash:hash,confirmed:false,authorityHash:a.authorityHash,retryAllowed:false};}
 catch{return {status:'broadcast-unknown',transactionHash:hash,confirmed:false,authorityHash:a.authorityHash,retryAllowed:false};}
}
