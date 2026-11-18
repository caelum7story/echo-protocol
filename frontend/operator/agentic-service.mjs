import fs from 'node:fs/promises';
import {readFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {sign,randomBytes,createHash} from 'node:crypto';
import {OfficialCli,bscAddress} from './agentic-cli.mjs';
import {loadOperatorKey,privateRoot} from './agentic-key.mjs';
import {connectClient,DEPLOYMENT,launchInterface} from '../public/chain.mjs';
import {assertMintTransaction} from '../public/mint-wallet-flow.mjs';
import {officialQr,validatePrepared,reviewDigest} from '../worker/agentic-validation.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function activeDeveloper(settings,now=Date.now()){const x=settings?.devMode,t=/^\d{13}$/.test(String(x?.expiresAt))?Number(x.expiresAt):Date.parse(x?.expiresAt);if(x?.enabled!==true||!Number.isFinite(t)||t<=now)throw Error('DEVELOPER_MODE_REQUIRED');}
export async function prepareMint({cli,profile,getClient,wallet,shares,referrer,previewId,now=Date.now()}){
 activeDeveloper(await cli.run(profile,'settings').done,now);
 if((await cli.run(profile,'lock').done).status!=='UNLOCKED')throw Error('WALLET_HAS_PENDING_REQUEST');
 const c=await getClient();c.checked=false;const name=await c.nameOfWallet(wallet);if(!name)throw Error('NO_OFFICIAL_IDENTITY');
 const q=await c.quote(name,shares,referrer);if(!q.available)throw Error(q.reason);if(!same(q.identity.wallet,wallet))throw Error('WALLET_IDENTITY_MISMATCH');
 const balance=await c.provider.getBalance(wallet);if(balance<=q.cost)throw Error('INSUFFICIENT_BNB');
 const p=await c.prepareMint({name,shares,referrer,wallet,maxCost:q.cost,gasCap:balance-q.cost,expectedVersion:q.version});assertMintTransaction(p.transaction,wallet);
 const raw=await cli.run(profile,'preview',{wallet,transaction:p.transaction}).done;
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(raw.requestId??''))throw Error('OFFICIAL_PREVIEW_REJECTED');
 p.previewId=previewId;p.gasKind='estimate-not-cap';p.official={parsedTx:raw.parsedTx,simulationResult:raw.simulationResult,risks:raw.risks,requireConfirmation:raw.requireConfirmation,expiresAt:Math.min(Number(raw.expiresAt),now+90000)};
 validatePrepared(p,wallet,Date.now());p.reviewDigest=await reviewDigest(p);return {prepared:p,requestId:raw.requestId};
}
export class AgenticOperator{
 constructor({rpc,cli,getClient,directory,now=Date.now}){this.rpc=rpc;this.cli=cli;this.getClient=getClient;this.directory=directory;this.now=now;this.connections=new Map();this.ledgerLocks=new Map();this.outbox=[];}
 async serial(id,fn){const previous=this.ledgerLocks.get(id)??Promise.resolve();let unlock;const gate=new Promise(r=>unlock=r);this.ledgerLocks.set(id,gate);await previous;try{return await fn();}finally{unlock();if(this.ledgerLocks.get(id)===gate)this.ledgerLocks.delete(id);}}
 async write(name,value){await fs.mkdir(this.directory,{recursive:true});const f=path.join(this.directory,name+'.json');await fs.writeFile(f+'.tmp',JSON.stringify(value));await fs.rename(f+'.tmp',f);}
 async read(name){return JSON.parse(await fs.readFile(path.join(this.directory,name+'.json'),'utf8'));}
 async post(data){try{return await this.rpc(data);}catch{this.outbox.push(data);return null;}}
 error(e){return e.providerError??{code:e.message};}
 async handle(job){const p=job.payload??{},profile=await this.cli.profile(job.connection);let mayHaveSubmitted=false;
  try{
   if(job.kind==='login'){
    if(this.connections.size>=4)throw Error('AGENTIC_CONNECTION_CAPACITY');
    // A fresh profile must never inherit an operator/owner wallet connection.
    if((await this.cli.run(profile,'status').done).status==='CONNECTED')throw Error('PROFILE_ALREADY_CONNECTED');
    const raw=await this.cli.run(profile,'signin').done,q=officialQr({urlForWeb:raw.urlForWeb,pairingCode:raw.pairingCode,expiresAt:Number(raw.expireAt)},this.now());
    const delivered=await this.rpc({action:'complete',jobId:job.id,result:q});if(!delivered.accepted)throw Error('CONNECTION_CANCELLED');
    const verify=this.cli.run(profile,'verify',{qrCodeId:raw.qrCodeId}),connection={profile,verify,job,expiresAt:Math.min(job.created_at+1800000,job.expires_at+1500000),closed:false};this.connections.set(job.connection,connection);
    // This blocking CLI is kept alive by the long-lived service until it finishes.
    connection.completion=(async()=>{try{await verify.done;if(connection.closed)return;if((await this.cli.run(profile,'status').done).status!=='CONNECTED')throw Error('OFFICIAL_WALLET_NOT_CONNECTED');const address=bscAddress(await this.cli.run(profile,'address').done);connection.address=address;const accepted=await this.post({action:'connected',jobId:job.id,address});if(accepted&&accepted.accepted===false)await this.logout(connection);}catch(e){if(!connection.closed){await this.post({action:'connection-error',jobId:job.id,error:this.error(e)});await this.logout(connection);}}})();return;
   }
   if(job.kind==='logout'){const c=this.connections.get(job.connection)??{profile,job:{connection:job.connection},closed:true};const remoteRevoked=await this.logout(c);await this.post({action:'complete',jobId:job.id,result:{state:'DISCONNECTED',remoteRevoked}});return;}
   if(job.kind==='reconcile'){const result=await this.reconcile(p.previewId,p.hash);await this.post({action:'complete',jobId:job.id,result});return;}
   const c=this.connections.get(job.connection);if(!c?.address||c.closed||this.now()>=c.expiresAt)throw Error('AGENTIC_NOT_CONNECTED');
   if(job.kind==='preview'){
    const record=await prepareMint({cli:this.cli,profile,getClient:this.getClient,wallet:c.address,shares:p.shares,referrer:p.referrer,previewId:job.id,now:this.now()});await this.write('preview-'+job.id,{...record,connection:job.connection});await this.post({action:'complete',jobId:job.id,result:record.prepared});return;
   }
   if(job.kind==='execute'){
    return await this.serial(p.previewId,async()=>{
    const record=await this.read('preview-'+p.previewId);if(record.connection!==job.connection||p.confirmed!==true||p.reviewDigest!==record.prepared.reviewDigest)throw Error('REVIEW_CONFIRMATION_REQUIRED');
    validatePrepared(record.prepared,c.address,this.now());activeDeveloper(await this.cli.run(profile,'settings').done,this.now());if((await this.cli.run(profile,'lock').done).status!=='UNLOCKED')throw Error('WALLET_HAS_PENDING_REQUEST');
    if(!same(c.address,bscAddress(await this.cli.run(profile,'address').done)))throw Error('WALLET_CHANGED');
    const client=await this.getClient();client.checked=false;await client.verifyDeployment();await client.provider.call(record.prepared.transaction);
    const ledger='execute-'+p.previewId;try{await this.read(ledger);mayHaveSubmitted=true;throw Error('EXECUTION_ALREADY_STARTED');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(c.closed||this.now()>=c.expiresAt)throw Error('AGENTIC_NOT_CONNECTED');
    // Durable intent before execute. A claimed or uncertain job is never re-signed.
    const data={jobId:job.id,connection:job.connection,previewId:p.previewId,prepared:record.prepared,state:'SUBMITTING',startedAt:this.now()};await this.write(ledger,data);
    if(c.closed||this.now()>=c.expiresAt){data.state='NOT_SUBMITTED';await this.write(ledger,data);throw Error('AGENTIC_NOT_CONNECTED');}
    validatePrepared(record.prepared,c.address,this.now());
    mayHaveSubmitted=true;const result=await this.cli.run(profile,'execute',{requestId:record.requestId}).done;data.result=result;data.state=result.txHash?'BROADCASTED':result.status==='PENDING_CONFIRMATION'?'PENDING_CONFIRMATION':'UNKNOWN';await this.write(ledger,data);await this.post({action:'complete',jobId:job.id,result});return;
    });
   }
   throw Error('JOB_KIND_NOT_ALLOWED');
  }catch(e){await this.post({action:'complete',jobId:job.id,result:{error:this.error(e),...(job.kind==='execute'&&!mayHaveSubmitted?{notSubmitted:true}:{})}});}
 }
 async logout(c){c.closed=true;c.verify?.child.kill();try{await this.cli.run(c.profile,'signout').done;this.connections.delete(c.job.connection);return true;}catch{c.nextRevocationAt=this.now()+10000;this.connections.set(c.job.connection,c);return false;}}
 async reconcile(previewId,hint){return this.serial(previewId,()=>this.reconcileLocked(previewId,hint));}
 async reconcileLocked(previewId,hint){
  let ledger;try{ledger=await this.read('execute-'+previewId);}catch{return {status:'UNKNOWN'};}
  const p=ledger.prepared,tx=p.transaction,client=await this.getClient();let hash=ledger.result?.txHash??hint;
  if(hash&&!/^0x[\da-f]{64}$/i.test(hash))throw Error('INVALID_TRANSACTION_HASH');
  if(!hash){const state=await client.state(),from=p.quote.state.block,to=state.block;if(!Number.isSafeInteger(from)||to-from>15000)return {status:'UNKNOWN'};
   const topic=launchInterface.getEvent('Minted').topicHash;for(let first=from;first<=to;first+=2000){const logs=await client.provider.getLogs({address:DEPLOYMENT.launch,topics:[topic],fromBlock:first,toBlock:Math.min(first+1999,to)});for(const l of logs){const candidate=await client.provider.getTransaction(l.transactionHash);if(candidate&&same(candidate.from,tx.from)&&same(candidate.to,tx.to)&&same(candidate.data,tx.data)&&BigInt(candidate.value)===BigInt(tx.value)){hash=l.transactionHash;break;}}if(hash)break;}
  }
  if(!hash)return {status:ledger.state==='PENDING_CONFIRMATION'?'PENDING_CONFIRMATION':'UNKNOWN'};
  const candidate=await client.provider.getTransaction(hash);if(!candidate||!same(candidate.from,tx.from)||!same(candidate.to,tx.to)||!same(candidate.data,tx.data)||BigInt(candidate.value)!==BigInt(tx.value))throw Error('RECEIPT_MISMATCH');
  const receipt=await client.receipt(hash);let result={txHash:hash,status:'BROADCASTED'};
  if(receipt.status==='failed')result={txHash:hash,status:'FAILED',receiptVerified:true};
  if(receipt.status==='confirmed'&&receipt.confirmations>=2){const m=assertMintTransaction(tx,tx.from);if(!same(receipt.wallet,tx.from)||BigInt(receipt.identityId)!==m.identityId||BigInt(receipt.referrerId)!==m.referrerId||BigInt(receipt.shares)!==m.shares||BigInt(receipt.costWei)!==BigInt(tx.value)||!receipt.tokenDelivered)throw Error('RECEIPT_MISMATCH');result={txHash:hash,status:'CONFIRMED',receiptVerified:true};}
  ledger.result={...ledger.result,txHash:hash};ledger.state=result.status;await this.write('execute-'+previewId,ledger);return result;
 }
 async maintenance(){for(const c of this.connections.values())if(this.now()>=c.expiresAt||c.closed&&this.now()>=(c.nextRevocationAt??0))await this.logout(c);for(let i=0;i<Math.min(this.outbox.length,4);i++){const b=this.outbox.shift();try{await this.rpc(b);}catch{this.outbox.push(b);break;}}
  if(!this.scanning&&this.now()-(this.scannedAt??0)>20000){
   this.scannedAt=this.now();this.scanning=(async()=>{
    const files=(await fs.readdir(this.directory).catch(()=>[])).filter(f=>/^execute-[a-f\d-]+\.json$/i.test(f)).sort();
    const start=this.scanCursor??0,count=Math.min(30,files.length),batch=Array.from({length:count},(_,i)=>files[(start+i)%files.length]);this.scanCursor=files.length?(start+count)%files.length:0;
    for(const file of batch){
     const ledger=await this.read(file.slice(0,-5));if(ledger.state==='NOT_SUBMITTED'||ledger.apiSettled===true)continue;
     try{const result=await this.reconcile(ledger.previewId);if(result.txHash){const ack=await this.rpc({action:result.receiptVerified?'settled':'progress',jobId:ledger.jobId,result});if(ack.accepted&&result.receiptVerified)await this.serial(ledger.previewId,async()=>{const latest=await this.read('execute-'+ledger.previewId);if(['CONFIRMED','FAILED'].includes(latest.state)){latest.apiSettled=true;await this.write('execute-'+ledger.previewId,latest);}});}}catch{}
    }
   })().catch(()=>{}).finally(()=>{this.scanning=null;});
  }
 }
}
async function main(){
 await fs.mkdir(privateRoot,{recursive:true});const lockFile=path.join(privateRoot,'service.lock');let owned=false;
 try{await fs.writeFile(lockFile,String(process.pid),{flag:'wx'});owned=true;}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await fs.readFile(lockFile,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw Error('OPERATOR_ALREADY_RUNNING');await fs.unlink(lockFile);await fs.writeFile(lockFile,String(process.pid),{flag:'wx'});owned=true;}
 process.on('exit',()=>{try{if(owned&&readFileSync(lockFile,'utf8')===String(process.pid))unlinkSync(lockFile);}catch{}});
 const key=await loadOperatorKey(),cli=new OfficialCli({privateRoot:path.join(privateRoot,'visitors')}),cache={};
 const rpc=async b=>{const text=JSON.stringify(b),stamp=String(Date.now()),nonce=randomBytes(16).toString('hex'),hash=createHash('sha256').update(text).digest('hex'),message=`${stamp}\n${nonce}\n/agentic-api/operator\n${hash}`,signature=sign(null,Buffer.from(message),key).toString('hex');const r=await fetch('https://echobsc.fun/agentic-api/operator',{method:'POST',headers:{'Content-Type':'application/json','x-echo-time':stamp,'x-echo-nonce':nonce,'x-echo-signature':signature},body:text,signal:AbortSignal.timeout(20000),redirect:'error'});const result=await r.json();if(!r.ok)throw Error(result.error??'QUEUE_REQUEST_FAILED');return result;};
 const op=new AgenticOperator({rpc,cli,getClient:async()=>cache.client??=await connectClient(),directory:path.join(privateRoot,'intents')});
 await rpc({action:'restart'});
 // Revoke only our isolated visitor profiles left by a prior service process.
 const profiles=await fs.readdir(path.join(privateRoot,'visitors')).catch(()=>[]);for(const id of profiles.filter(x=>/^[a-f0-9-]{36}$/i.test(x)))await op.logout({profile:await cli.profile(id),job:{connection:id},closed:true});
 const active=new Set();console.log('ECHO_AGENTIC_OPERATOR_READY');let quitting=false;
 const stop=()=>{quitting=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 while(!quitting){try{await op.maintenance();if(active.size<4){const {job}=await rpc({action:'claim'});if(job){const task=op.handle(job).finally(()=>active.delete(task));active.add(task);}}}catch(e){console.log('AGENTIC_SERVICE_RETRY '+String(e.message).replace(/[^A-Z_]/g,'').slice(0,90));}await sleep(1800);}
 await Promise.allSettled(active);await Promise.allSettled([...op.connections.values()].map(c=>op.logout(c)));cache.client?.destroy();
}
if(process.argv.includes('--run'))main().catch(e=>{console.error('ECHO_AGENTIC_SERVICE_STOPPED '+String(e.cause?.code??e.code??e.message).replace(/[^A-Za-z0-9_:-]/g,'_').slice(0,100));process.exitCode=1;});
