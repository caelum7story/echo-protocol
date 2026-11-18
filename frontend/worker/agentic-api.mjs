import policy from './agentic-policy.json' with {type:'json'};
import {fail,digest,random,officialQr,validAddress,validatePrepared,reviewDigest} from './agentic-validation.mjs';
const parse=t=>{try{return JSON.parse(t??'null');}catch{return null;}};
const json=(status,data,cookie)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
const cookieName='__Host-echo_agentic',cookie=(token,max=1800)=>`${cookieName}=${token}; Path=/; Max-Age=${max}; Secure; HttpOnly; SameSite=Strict`;
async function body(request){const reader=request.body?.getReader();if(!reader)fail('BODY_REQUIRED');let text='',size=0;const decoder=new TextDecoder();for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>100000){await reader.cancel();fail('BODY_TOO_LARGE');}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();const value=parse(text);if(!value||Array.isArray(value)||typeof value!=='object')fail('INVALID_BODY');return {text,value};}
const view=s=>{const v=parse(s.view)??{};return {state:s.state,...v,expiresAt:v.urlForWeb?v.expiresAt:s.expires_at,sessionExpiresAt:s.expires_at,operation:parse(s.operation)};};
async function addJob(DB,s,kind,payload,now,{id=crypto.randomUUID(),ttl=120000}={}){await DB.prepare('INSERT INTO echo_agentic_jobs (id,session,connection,kind,status,payload,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,s.id,s.connection,kind,'READY',JSON.stringify(payload),now,now+ttl).run();return id;}
async function cancelUnclaimed(DB,s,now,force=false){
 const op=parse(s.operation);
 if(!op?.previewId||!op.prepared||['CONFIRMED','FAILED'].includes(op.status))return;
 const row=await DB.prepare("SELECT * FROM echo_agentic_jobs WHERE id=? AND ((status='READY' AND (expires_at<=? OR ?=1)) OR (status='CANCELLED' AND json_extract(result,'$.notSubmitted')=1))").bind('execute:'+op.previewId,now,force?1:0).first();
 if(!row)return;
 const next={...op,status:'NOT_SUBMITTED',error:{code:'REQUEST_EXPIRED_BEFORE_SUBMISSION'}},nextText=JSON.stringify(next);
 const result=await DB.batch([
  DB.prepare("UPDATE echo_agentic_jobs SET status='CANCELLED',result=? WHERE id=? AND status='READY' AND (expires_at<=? OR ?=1)").bind(JSON.stringify({status:'NOT_SUBMITTED',notSubmitted:true}),row.id,now,force?1:0),
  DB.prepare("UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND operation=? AND EXISTS (SELECT 1 FROM echo_agentic_jobs WHERE id=? AND status='CANCELLED' AND json_extract(result,'$.notSubmitted')=1)").bind(nextText,now,s.id,s.operation,row.id),
  DB.prepare('DELETE FROM echo_agentic_meta WHERE key=? AND payload=? AND EXISTS (SELECT 1 FROM echo_agentic_sessions WHERE id=? AND operation=?)').bind('pending:'+op.prepared.transaction.from.toLowerCase(),op.previewId,s.id,nextText)
 ]);
 if(result[1].meta.changes===1)s.operation=nextText;
}
async function clearConnection(DB,s,now){await DB.batch([DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=?').bind('DISCONNECTED',JSON.stringify(validAddress(parse(s.view)?.address)?{address:parse(s.view).address,chainId:56}:{}),now,s.id),DB.prepare("UPDATE echo_agentic_jobs SET status='CANCELLED' WHERE connection=? AND status='READY' AND kind NOT IN ('logout','reconcile','execute')").bind(s.connection)]);await addJob(DB,s,'logout',{},now,{ttl:600000});}
async function authenticateOperator(request,DB,text,now,p){
 const stamp=request.headers.get('x-echo-time'),nonce=request.headers.get('x-echo-nonce'),signature=request.headers.get('x-echo-signature');
 if(!/^\d{13}$/.test(stamp??'')||Math.abs(now-Number(stamp))>30000||!/^[\da-f]{32}$/.test(nonce??'')||!/^[\da-f]{128}$/.test(signature??'')||!/^[\da-f]{64}$/.test(p.operatorPublicKey??''))fail('OPERATOR_UNAUTHORIZED');
 const bytes=h=>Uint8Array.from(h.match(/../g),x=>parseInt(x,16)),key=await crypto.subtle.importKey('raw',bytes(p.operatorPublicKey),{name:'Ed25519'},false,['verify']);
 const message=`${stamp}\n${nonce}\n${new URL(request.url).pathname}\n${await digest(text)}`;
 if(!await crypto.subtle.verify('Ed25519',key,bytes(signature),new TextEncoder().encode(message)))fail('OPERATOR_UNAUTHORIZED');
 try{await DB.prepare('INSERT INTO echo_agentic_meta (key,payload,updated_at,expires_at) VALUES (?,?,?,?)').bind('nonce:'+nonce,'1',now,now+60000).run();}catch{fail('OPERATOR_REPLAY');}
}
async function operator(request,env,now,p){
 const {text,value:b}=await body(request),DB=env.DB;await authenticateOperator(request,DB,text,now,p);
 await DB.prepare('INSERT INTO echo_agentic_meta (key,payload,updated_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,expires_at=excluded.expires_at').bind('service','ready',now,now+90000).run();
 if(b.action==='restart'){
  const sessions=(await DB.prepare("SELECT * FROM echo_agentic_sessions WHERE state IN ('QUEUED','PENDING','CONNECTED') LIMIT 20").all()).results??[];
  for(const s of sessions){await cancelUnclaimed(DB,s,now,true);const old=parse(s.view),next={...(validAddress(old?.address)?{address:old.address,chainId:56}:{}),error:{code:'SESSION_RESTARTED'}};await DB.batch([DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=? AND connection=?').bind('ERROR',JSON.stringify(next),now,s.id,s.connection),DB.prepare("UPDATE echo_agentic_jobs SET status='CANCELLED' WHERE connection=? AND kind IN ('login','preview') AND status IN ('READY','CLAIMED')").bind(s.connection)]);}
  return json(200,{accepted:true,reset:sessions.length});
 }
 if(b.action==='claim'){
  const expired=(await DB.prepare("SELECT session FROM echo_agentic_jobs WHERE status='READY' AND kind='execute' AND expires_at<=? LIMIT 10").bind(now).all()).results??[];for(const item of expired){const s=await DB.prepare('SELECT * FROM echo_agentic_sessions WHERE id=?').bind(item.session).first();if(s)await cancelUnclaimed(DB,s,now);}
  await DB.prepare("UPDATE echo_agentic_jobs SET status='CANCELLED' WHERE id IN (SELECT id FROM echo_agentic_jobs WHERE status='READY' AND kind IN ('login','preview','reconcile') AND expires_at<=? LIMIT 10)").bind(now).run();
  await DB.prepare("DELETE FROM echo_agentic_jobs WHERE id IN (SELECT id FROM echo_agentic_jobs WHERE kind='login' AND created_at<? LIMIT 20)").bind(now-86400000).run();
  await DB.prepare('DELETE FROM echo_agentic_meta WHERE key IN (SELECT key FROM echo_agentic_meta WHERE expires_at<? AND key NOT LIKE ? LIMIT 50)').bind(now,'pending:%').run();
  const job=await DB.prepare("UPDATE echo_agentic_jobs SET status='CLAIMED',claimed_at=? WHERE id=(SELECT id FROM echo_agentic_jobs WHERE status='READY' AND expires_at>? ORDER BY CASE kind WHEN 'logout' THEN 0 ELSE 1 END,created_at LIMIT 1) AND status='READY' RETURNING *").bind(now,now).first();
  return json(200,{job:job?{...job,payload:parse(job.payload),result:undefined}:null});
 }
 const job=await DB.prepare('SELECT * FROM echo_agentic_jobs WHERE id=?').bind(b.jobId??'').first();if(!job)fail('JOB_NOT_FOUND');
 const s=await DB.prepare('SELECT * FROM echo_agentic_sessions WHERE id=?').bind(job.session).first();
 if(!s||s.connection!==job.connection)return json(200,{accepted:false,reason:'STALE_CONNECTION'});
 if(b.action==='connected'){
  if(job.kind!=='login'||job.status!=='DONE'||!validAddress(b.address)||s.expires_at<=now||!['QUEUED','PENDING'].includes(s.state))return json(200,{accepted:false,reason:'INACTIVE_CONNECTION'});
  await DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=? AND connection=? AND state IN (?,?)').bind('CONNECTED',JSON.stringify({address:b.address,chainId:56}),now,s.id,s.connection,'QUEUED','PENDING').run();return json(200,{accepted:true});
 }
 if(b.action==='connection-error'){
  if(job.kind==='login'&&['QUEUED','PENDING','CONNECTED'].includes(s.state))await DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=? AND connection=?').bind('ERROR',JSON.stringify({error:cleanError(b.error)}),now,s.id,s.connection).run();return json(200,{accepted:true});
 }
 if(!['complete','settled','progress'].includes(b.action))fail('OPERATOR_ACTION_NOT_ALLOWED');
 if(job.status==='DONE'&&b.action==='complete')return json(200,{accepted:true,duplicate:true});if(!['CLAIMED','DONE'].includes(job.status))fail('JOB_STATE');
 if(b.action==='settled'&&(!['execute','reconcile'].includes(job.kind)||b.result?.receiptVerified!==true||!['CONFIRMED','FAILED'].includes(b.result?.status)))fail('INVALID_SETTLEMENT');
 if(b.action==='progress'&&(!['execute','reconcile'].includes(job.kind)||!/^0x[\da-f]{64}$/i.test(b.result?.txHash??'')))fail('INVALID_SETTLEMENT');
 let result=b.result??{};
 if(job.kind==='login'&&!result.error){result={state:'PENDING',...officialQr(result,now)};if(['QUEUED','PENDING'].includes(s.state)&&s.expires_at>now)await DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=? AND connection=? AND state IN (?,?)').bind('PENDING',JSON.stringify(result),now,s.id,s.connection,'QUEUED','PENDING').run();}
 if(job.kind==='preview'&&!result.error){
  const current=parse(s.operation);if(current?.status!=='PREPARING'||current.previewId!==job.id)return json(200,{accepted:false,reason:'STALE_PREVIEW'});
  const p=validatePrepared(result,parse(s.view)?.address,now),input=parse(job.payload);if(p.previewId!==job.id||p.quote.shares!==input.shares||!['CONNECTED'].includes(s.state)||s.expires_at<=now)fail('PREVIEW_SESSION_CHANGED');p.reviewDigest=await reviewDigest(p);result=p;
  const updated=await DB.prepare("UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND connection=? AND state='CONNECTED' AND operation=?").bind(JSON.stringify({status:'REVIEW',previewId:job.id,prepared:p}),now,s.id,s.connection,s.operation).run();if(updated.meta.changes!==1)return json(200,{accepted:false,reason:'STALE_PREVIEW'});
 }
 if(job.kind==='execute'||job.kind==='reconcile'){
  const op=parse(s.operation),input=parse(job.payload);if(!op||op.previewId!==input.previewId)fail('PREVIEW_SESSION_CHANGED');
  if(['CONFIRMED','FAILED','NOT_SUBMITTED'].includes(op.status)){await DB.prepare("UPDATE echo_agentic_jobs SET status='DONE',result=? WHERE id=?").bind(JSON.stringify({status:op.status,txHash:op.txHash??null,receiptVerified:['CONFIRMED','FAILED'].includes(op.status)}),job.id).run();return json(200,{accepted:true,terminalPreserved:true});}
  if(result.txHash&&!/^0x[\da-f]{64}$/i.test(result.txHash))fail('INVALID_TRANSACTION_HASH');
  const settled=result.receiptVerified===true&&result.txHash&&['CONFIRMED','FAILED'].includes(result.status);
  const status=settled?result.status:result.notSubmitted===true&&job.kind==='execute'?'NOT_SUBMITTED':result.txHash?'BROADCASTED':result.error?'UNKNOWN':result.status==='PENDING_CONFIRMATION'?'PENDING_CONFIRMATION':'UNKNOWN';
  const next={...op,status,...(result.txHash?{txHash:result.txHash}:{}),...(result.error?{error:cleanError(result.error)}:{})};
  result={...result,status};
  const nextText=JSON.stringify(next),statements=[DB.prepare('UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND connection=? AND operation=?').bind(nextText,now,s.id,s.connection,s.operation)];
  if(settled||status==='NOT_SUBMITTED')statements.push(DB.prepare('DELETE FROM echo_agentic_meta WHERE key=? AND payload=? AND EXISTS (SELECT 1 FROM echo_agentic_sessions WHERE id=? AND operation=?)').bind('pending:'+op.prepared.transaction.from.toLowerCase(),op.previewId,s.id,nextText));
  const changed=await DB.batch(statements);if(changed[0].meta.changes!==1)fail('OPERATION_CHANGED_RETRY');
 }
 if(result.error){result={...(['execute','reconcile'].includes(job.kind)?{status:result.status,notSubmitted:result.notSubmitted}:{}),error:cleanError(result.error)};if(job.kind==='login')await DB.prepare('UPDATE echo_agentic_sessions SET state=?,view=?,updated_at=? WHERE id=? AND connection=? AND state IN (?,?)').bind('ERROR',JSON.stringify(result),now,s.id,s.connection,'QUEUED','PENDING').run();if(job.kind==='preview')await DB.prepare('UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND connection=? AND operation=?').bind(JSON.stringify({status:'ERROR',error:result.error}),now,s.id,s.connection,s.operation).run();}
 await DB.prepare("UPDATE echo_agentic_jobs SET status='DONE',result=? WHERE id=? AND status IN ('CLAIMED','DONE')").bind(JSON.stringify(result),job.id).run();return json(200,{accepted:true});
}
function cleanError(e){const code=typeof e==='string'?e:e?.code??e?.name??'PROVIDER_REQUEST_FAILED';return {code:String(code).slice(0,90).replace(/[^A-Za-z0-9_.-]/g,'_'),...(typeof e?.message==='string'?{message:e.message.slice(0,500).replace(/(?:sessionToken|accessToken|clientId|apiKey)\s*[:=]\s*\S+/gi,'[redacted]')}: {})};}
async function storedMintStatus(DB,s,b,now){
 if(!/^[a-f\d-]{36}$/i.test(b.previewId)||b.hash&&!/^0x[\da-f]{64}$/i.test(b.hash))return json(400,{error:'INVALID_PREVIEW_ID'});
 const original=await DB.prepare('SELECT * FROM echo_agentic_jobs WHERE id=?').bind('execute:'+b.previewId).first(),preview=await DB.prepare('SELECT result FROM echo_agentic_jobs WHERE id=?').bind(b.previewId).first(),prepared=parse(preview?.result);
 if(!original||!prepared?.transaction||prepared.transaction.from.toLowerCase()!==parse(s.view).address.toLowerCase())return json(404,{error:'MINT_RECORD_NOT_FOUND'});
 const source=await DB.prepare('SELECT * FROM echo_agentic_sessions WHERE id=?').bind(original.session).first();
 if(source){
  await cancelUnclaimed(DB,source,now);const saved=parse(source.operation);
  if(saved?.previewId===b.previewId){
   if(['QUEUED','UNKNOWN','PENDING_CONFIRMATION','BROADCASTED'].includes(saved.status)){
    const payload={previewId:b.previewId,...(b.hash?{hash:b.hash}:{})};
    const prior=await DB.prepare("SELECT id FROM echo_agentic_jobs WHERE connection=? AND kind='reconcile' AND status IN ('READY','CLAIMED') AND expires_at>? AND payload=? LIMIT 1").bind(source.connection,now,JSON.stringify(payload)).first();
    if(!prior)await addJob(DB,source,'reconcile',payload,now,{ttl:60000});
   }
   return json(200,{operation:saved});
  }
 }
 const result=parse(original.result)??{};return json(200,{operation:{...result,status:result.status??'UNKNOWN',previewId:b.previewId,prepared}});
}
export async function agenticApi(request,env,{now=Date.now(),config=policy}={}){
 try{
  const u=new URL(request.url),route=u.pathname.slice('/agentic-api/'.length),DB=env.DB;
  if(!config.enabled||!DB)return json(503,{error:'AGENTIC_SERVICE_UNAVAILABLE'});
  if(route==='operator'){if(request.method!=='POST'||u.search)return json(405,{error:'POST_ONLY'});return await operator(request,env,now,config);}
  if(u.search||!['status','login','disconnect','mint-preview','mint-confirm','mint-status'].includes(route))return json(404,{error:'UNKNOWN_AGENTIC_ROUTE'});
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==u.origin)return json(403,{error:'SAME_ORIGIN_REQUIRED'});
  if(request.method!==(route==='status'?'GET':'POST'))return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.method==='POST'&&(request.headers.get('Origin')!==u.origin||request.headers.get('x-echo-agentic')!=='1'))return json(403,{error:'SAME_ORIGIN_REQUIRED'});
  const token=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1),id=/^[\da-f]{64}$/.test(token??'')?await digest(token):null;
  let s=id?await DB.prepare('SELECT * FROM echo_agentic_sessions WHERE id=?').bind(id).first():null;
  if(s)await cancelUnclaimed(DB,s,now);
  if(s&&s.expires_at<=now){if(s.state!=='DISCONNECTED')await clearConnection(DB,s,now);s=null;}
  const ready=await DB.prepare('SELECT expires_at FROM echo_agentic_meta WHERE key=?').bind('service').first();
  if(route==='status')return json(200,{serviceReady:!!ready&&ready.expires_at>now,...(s?view(s):{state:'DISCONNECTED'})});
  const {value:b}=await body(request);
  if(route==='disconnect'){if(s){await cancelUnclaimed(DB,s,now,true);await clearConnection(DB,s,now);}return json(200,{state:'DISCONNECTED',revocationPending:true},cookie('',0));}
  if(!ready||ready.expires_at<=now)return json(503,{error:'AGENTIC_OPERATOR_OFFLINE'});
  if(route==='login'){
   if(b.acceptDelegation!==true||b.consentVersion!=='echo-agentic-mint-v1')return json(400,{error:'SESSION_CONSENT_REQUIRED'});
   if(s&&['QUEUED','PENDING','CONNECTED'].includes(s.state))return json(200,view(s));
   const capacity=await DB.prepare("SELECT count(*) AS count FROM echo_agentic_sessions WHERE expires_at>? AND state IN ('QUEUED','PENDING','CONNECTED')").bind(now).first();if(capacity.count>=config.maxSessions)return json(429,{error:'AGENTIC_CONNECTION_CAPACITY'});
   const bucket='login-rate:'+await digest((request.headers.get('CF-Connecting-IP')??'global')+':'+Math.floor(now/600000));
   const rate=await DB.prepare('INSERT INTO echo_agentic_meta (key,payload,updated_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=CAST(payload AS INTEGER)+1 RETURNING payload').bind(bucket,'1',now,now+660000).first();if(Number(rate.payload)>6)return json(429,{error:'AGENTIC_RATE_LIMIT'});
   const next=random(),sid=await digest(next),connection=crypto.randomUUID();s={id:sid,connection,state:'QUEUED',view:'{}',operation:null,expires_at:now+config.sessionMs};
   await DB.prepare('INSERT INTO echo_agentic_sessions (id,connection,state,view,created_at,expires_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(sid,connection,'QUEUED','{}',now,s.expires_at,now).run();await addJob(DB,s,'login',{},now,{ttl:300000});return json(200,view(s),cookie(next));
  }
  if(!s||s.state!=='CONNECTED')return json(401,{error:'AGENTIC_NOT_CONNECTED'});
  const op=parse(s.operation);
  if(route==='mint-preview'){
   if(Object.keys(b).some(k=>!['shares','referrer'].includes(k))||!Number.isInteger(b.shares)||b.shares<1||b.shares>10||b.referrer!==null&&b.referrer!==undefined&&(typeof b.referrer!=='string'||!/^([a-z0-9]{1,64})(\.ai)?$/.test(b.referrer)))return json(400,{error:'INVALID_MINT_INTENT'});
   if(op&&!['REVIEW','ERROR','CONFIRMED','FAILED','NOT_SUBMITTED'].includes(op.status))return json(409,{error:'MINT_PENDING'});
   const jobId=crypto.randomUUID(),next=JSON.stringify({status:'PREPARING',previewId:jobId});const result=await DB.batch([DB.prepare("UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND connection=? AND state='CONNECTED' AND operation IS ?").bind(next,now,s.id,s.connection,s.operation),DB.prepare("INSERT INTO echo_agentic_jobs (id,session,connection,kind,status,payload,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM echo_agentic_sessions WHERE id=? AND operation=?)").bind(jobId,s.id,s.connection,'preview','READY',JSON.stringify({shares:b.shares,referrer:b.referrer??null}),now,now+120000,s.id,next)]);if(result[0].meta.changes!==1)return json(409,{error:'SESSION_CHANGED'});return json(200,{status:'PREPARING',previewId:jobId});
  }
  if(route==='mint-confirm'){
   if(b.confirmed!==true||!op||b.previewId!==op.previewId||b.reviewDigest!==op.prepared?.reviewDigest)return json(400,{error:'REVIEW_CONFIRMATION_REQUIRED'});
   if(op.status!=='REVIEW')return json(200,{operation:op});
   validatePrepared(op.prepared,parse(s.view).address,now);
   if(now>Math.min(op.prepared.official.expiresAt,op.prepared.quote.state.timestamp*1000+120000))return json(409,{error:'REVIEW_EXPIRED'});
   const walletKey='pending:'+parse(s.view).address.toLowerCase();
   const pending={...op,status:'QUEUED'};
   try{
    const nextText=JSON.stringify(pending);
    const changed=await DB.batch([
     DB.prepare("INSERT INTO echo_agentic_meta (key,payload,updated_at,expires_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM echo_agentic_sessions WHERE id=? AND connection=? AND state='CONNECTED' AND operation=?)").bind(walletKey,op.previewId,now,now+86400000,s.id,s.connection,s.operation),
     DB.prepare("UPDATE echo_agentic_sessions SET operation=?,updated_at=? WHERE id=? AND connection=? AND state='CONNECTED' AND operation=? AND EXISTS (SELECT 1 FROM echo_agentic_meta WHERE key=? AND payload=?)").bind(nextText,now,s.id,s.connection,s.operation,walletKey,op.previewId),
     DB.prepare('INSERT INTO echo_agentic_jobs (id,session,connection,kind,status,payload,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM echo_agentic_sessions WHERE id=? AND operation=?)').bind('execute:'+op.previewId,s.id,s.connection,'execute','READY',JSON.stringify({previewId:op.previewId,reviewDigest:b.reviewDigest,confirmed:true}),now,now+90000,s.id,nextText)
    ]);
    if(changed[1].meta.changes!==1)return json(409,{error:'REVIEW_CHANGED'});
   }catch{return json(409,{error:'MINT_PENDING'});}
   return json(200,{operation:pending});
  }
  if(route==='mint-status'){
   if(b.previewId)return storedMintStatus(DB,s,b,now);
   if(!op)return json(200,{operation:null});if(['QUEUED','UNKNOWN','PENDING_CONFIRMATION','BROADCASTED'].includes(op.status)){
    const pending=await DB.prepare("SELECT id FROM echo_agentic_jobs WHERE connection=? AND kind='reconcile' AND status IN ('READY','CLAIMED') AND expires_at>? LIMIT 1").bind(s.connection,now).first();if(!pending)await addJob(DB,s,'reconcile',{previewId:op.previewId},now,{ttl:60000});
   }return json(200,{operation:op});
  }
  return json(404,{error:'UNKNOWN_AGENTIC_ROUTE'});
 }catch(e){const code=/^[A-Z][A-Z0-9_:-]{0,90}$/.test(e.message)?e.message:'AGENTIC_REQUEST_FAILED';return json(/UNAUTHORIZED|REPLAY/.test(code)?403:409,{error:code});}
}
