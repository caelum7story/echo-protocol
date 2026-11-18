import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Contract,decodeBytes32String,getAddress} from 'ethers';
import {LaunchAgentClient,jsonSafe} from './agent-client.mjs';
import {verifyParticipantEvents,participantOutcome} from './participant-proof.mjs';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),E18=10n**18n,fail=code=>{throw Error(code);};
const artifacts=Object.fromEntries(['NftLaunch','TokenLaunch','LaunchToken'].map(name=>[name,JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),'utf8'))]));
export const participantWhere=`lower(address)=lower(?) AND block_number<=? AND
 (lower(json_extract(args_json,'$.wallet'))=lower(?) OR lower(json_extract(args_json,'$.recipient'))=lower(?) OR json_extract(args_json,'$.key') IN
 (SELECT json_extract(args_json,'$.key') FROM events WHERE lower(address)=lower(?) AND block_number<=? AND name='Subscribed' AND lower(json_extract(args_json,'$.wallet'))=lower(?)))`;
export const participantParams=(project,wallet,block)=>[project,block,wallet,wallet,project,block,wallet];
export function ensureHistorySchema(db){
 db.exec(`CREATE INDEX IF NOT EXISTS events_lower_address_block ON events(lower(address),block_number,log_index);
 CREATE INDEX IF NOT EXISTS events_lower_wallet_key ON events(lower(address),name,lower(json_extract(args_json,'$.wallet')));
 CREATE TABLE IF NOT EXISTS participant_scans(id TEXT PRIMARY KEY,project TEXT NOT NULL,wallet TEXT NOT NULL,block_number INTEGER NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,
  block_hash TEXT NOT NULL,state_json TEXT NOT NULL,phase TEXT NOT NULL,revision INTEGER NOT NULL,last_block INTEGER NOT NULL,last_log INTEGER NOT NULL,last_key TEXT NOT NULL,
  processed INTEGER NOT NULL,total INTEGER NOT NULL,acc_json TEXT NOT NULL,last_result TEXT,UNIQUE(project,wallet,block_hash));
 CREATE TABLE IF NOT EXISTS participant_scan_positions(scan_id TEXT NOT NULL REFERENCES participant_scans(id) ON DELETE CASCADE,key TEXT NOT NULL,identity_id TEXT NOT NULL,
  units TEXT NOT NULL,principal TEXT NOT NULL,delivered INTEGER NOT NULL,PRIMARY KEY(scan_id,key));
 CREATE TABLE IF NOT EXISTS participant_scan_nfts(scan_id TEXT NOT NULL REFERENCES participant_scans(id) ON DELETE CASCADE,token_id TEXT NOT NULL,PRIMARY KEY(scan_id,token_id));
 CREATE TABLE IF NOT EXISTS participant_receipts(tx_hash TEXT PRIMARY KEY,block_number INTEGER NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,block_hash TEXT NOT NULL,receipt_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS participant_scan_receipts(scan_id TEXT NOT NULL REFERENCES participant_scans(id) ON DELETE CASCADE,tx_hash TEXT NOT NULL REFERENCES participant_receipts(tx_hash) ON DELETE CASCADE,PRIMARY KEY(scan_id,tx_hash));`);
}
const scalarKeys=['subscribedUnits','subscribePrincipal','activeUnits','principal','deliveredUnits','refundCredited','exitCredited','totalCredit','withdrawn','refundedPrincipal','refundedCount','exitRefunded','deliveredPositions'];
const initial=()=>({...Object.fromEntries(scalarKeys.map(k=>[k,'0'])),creditReasons:[]});
const inflate=value=>({...value,...Object.fromEntries(scalarKeys.map(k=>[k,BigInt(value[k])]))});
const deflate=value=>jsonSafe({...value,creditReasons:[...value.creditReasons]});
export function historyProgress(job){return {schema:'echo-launch-history-progress/v1',scanId:job.id,project:job.project,wallet:job.wallet,blockNumber:job.block_number,blockHash:job.block_hash,
 phase:job.phase,processedEvents:job.processed,totalEvents:job.total,cursor:job.phase==='complete'?null:job.id+'.'+job.revision,complete:job.phase==='complete',historical:true,financialExecutionAllowed:false};}
export function beginParticipantHistory({db,state}){
 const project=state.project.toLowerCase(),wallet=state.who.wallet.toLowerCase();
 let job=db.prepare('SELECT * FROM participant_scans WHERE project=? AND wallet=? AND block_hash=?').get(project,wallet,state.blockHash);
 if(!job){
  const total=db.prepare('SELECT count(*) n FROM events WHERE '+participantWhere).get(...participantParams(project,wallet,state.blockNumber)).n;
  if(!Number.isSafeInteger(total))fail('HISTORY_COUNT_RANGE');const id=randomBytes(24).toString('hex');
  db.prepare('INSERT OR IGNORE INTO participant_scans(id,project,wallet,block_number,block_hash,state_json,phase,revision,last_block,last_log,last_key,processed,total,acc_json) VALUES(?,?,?,?,?,?,?,0,-1,-1,?,0,?,?)')
   .run(id,project,wallet,state.blockNumber,state.blockHash,JSON.stringify(state),'events','',total,JSON.stringify(initial()));
  job=db.prepare('SELECT * FROM participant_scans WHERE project=? AND wallet=? AND block_hash=?').get(project,wallet,state.blockHash);
 }
 return {progress:historyProgress(job),observation:job.phase==='complete'?JSON.parse(job.last_result).observation:null};
}
function receiptData(receipt){return {hash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,status:receipt.status,logs:receipt.logs.map(l=>({index:l.index,address:l.address,data:l.data,topics:Array.from(l.topics)}))};}
export async function readPinnedState({db,provider,config,project,wallet,blockNumber,blockHash}){
 const header=db.prepare('SELECT hash FROM blocks WHERE number=?').get(blockNumber);
 if(!header||!same(header.hash,blockHash)||!same((await provider.getBlock(blockNumber))?.hash,blockHash))fail('HISTORY_CURSOR_REORG');
 const state=await new LaunchAgentClient({provider,config}).historicalSnapshot(getAddress(project),{wallet:getAddress(wallet),blockNumber});
 if(!same(state.blockHash,blockHash))fail('HISTORY_CURSOR_REORG');return state;
}
function applyEvents(db,job,events,acc,state){
 const getPosition=key=>db.prepare('SELECT * FROM participant_scan_positions WHERE scan_id=? AND key=?').get(job.id,key);
 const putPosition=p=>db.prepare('INSERT INTO participant_scan_positions(scan_id,key,identity_id,units,principal,delivered) VALUES(?,?,?,?,?,?) ON CONFLICT(scan_id,key) DO UPDATE SET units=excluded.units,principal=excluded.principal,delivered=excluded.delivered')
  .run(job.id,p.key,p.identity_id,String(p.units),String(p.principal),Number(p.delivered));
 for(const event of events){const a=event.args;
  if(event.name==='Subscribed'){
   const units=BigInt(a.count??a.units),principal=BigInt(a.principal);if(principal!==units*BigInt(state.base.unitPrice))fail('PARTICIPANT_PROOF_MISMATCH');
   acc.subscribedUnits+=units;acc.subscribePrincipal+=principal;
   if(state.kind===2){const old=getPosition(a.key);if(old?.delivered)fail('PARTICIPANT_PROOF_MISMATCH');putPosition({key:a.key,identity_id:String(a.identityId),units:BigInt(old?.units??0)+units,principal:BigInt(old?.principal??0)+principal,delivered:false});}
  }
  if(event.name==='CreditAdded'){
   const amount=BigInt(a.amount);acc.totalCredit+=amount;let reason;try{reason=decodeBytes32String(a.reason);}catch{reason='UNKNOWN';}
   if(!acc.creditReasons.includes(reason))acc.creditReasons.push(reason);
   if(reason==='NFT_REFUND'||reason==='TOKEN_REFUND')acc.refundCredited+=amount;if(reason==='EARLY_EXIT_REFUND')acc.exitCredited+=amount;
  }
  if(event.name==='CreditWithdrawn'){acc.withdrawn+=BigInt(a.amount);if(acc.withdrawn>acc.totalCredit)fail('PARTICIPANT_PROOF_MISMATCH');}
  if(event.name==='Refunded'){acc.refundedPrincipal+=BigInt(a.principal);acc.refundedCount++;}
  if(event.name==='Exited')acc.exitRefunded+=BigInt(a.refund);
  if(state.kind===2&&['Exited','Refunded'].includes(event.name)){
   const p=getPosition(a.key);if(!p||p.delivered||BigInt(p.units)!==BigInt(a.units)||BigInt(p.principal)!==BigInt(a.principal))fail('PARTICIPANT_PROOF_MISMATCH');putPosition({...p,units:0n,principal:0n});
  }
  if(event.name==='Delivered'){
   if(state.kind===1){const result=db.prepare('INSERT OR IGNORE INTO participant_scan_nfts(scan_id,token_id) VALUES(?,?)').run(job.id,String(a.tokenId));if(result.changes!==1)fail('PARTICIPANT_PROOF_MISMATCH');acc.deliveredUnits++;}
   else{const p=getPosition(a.key);if(!p||p.delivered||BigInt(a.amount)!==BigInt(p.units)*E18)fail('PARTICIPANT_PROOF_MISMATCH');putPosition({...p,delivered:true});acc.deliveredUnits+=BigInt(p.units);}
  }
 }
}
function observationFor(state,participant,confirmations){return {schema:'echo-launch-indexed-state/v1',observedAt:new Date().toISOString(),state,participant,
 index:{head:{number:state.blockNumber,hash:state.blockHash,timestamp:state.blockTimestamp},confirmationsRequired:confirmations},executionReady:false,quoteAuthority:false,financialExecutionAllowed:false,source:'canonical-confirmed-history-scan',audited:false,contentVerified:false};}
export async function advanceParticipantHistory({db,provider,config,cursor,project,wallet,limit=25,confirmations=config.minConfirmations??12}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('HISTORY_PAGE_LIMIT');
 const match=/^([a-f0-9]{48})\.(0|[1-9][0-9]{0,9})$/.exec(String(cursor));if(!match)fail('HISTORY_CURSOR');
 const job=db.prepare('SELECT * FROM participant_scans WHERE id=?').get(match[1]);
 if(!job)fail('HISTORY_SCAN_UNAVAILABLE');if(!same(project,job.project)||!same(wallet,job.wallet))fail('HISTORY_SCOPE');
 const requested=Number(match[2]),state=await readPinnedState({db,provider,config,project,wallet,blockNumber:job.block_number,blockHash:job.block_hash});
 if(requested===job.revision-1&&job.last_result)return JSON.parse(job.last_result);
 if(requested!==job.revision)fail('HISTORY_CURSOR_STALE');if(job.phase==='complete')return JSON.parse(job.last_result);
 const acc=inflate(JSON.parse(job.acc_json)),pendingReceipts=new Map();let rows=[],events=[],positions=[],hasMore=false,holding=null;
 const sale=new Contract(state.project,artifacts[state.kind===1?'NftLaunch':'TokenLaunch'].abi,provider);
 if(job.phase==='events'){
  rows=db.prepare('SELECT * FROM events WHERE '+participantWhere+' AND (block_number>? OR (block_number=? AND log_index>?)) ORDER BY block_number,log_index LIMIT ?')
   .all(...participantParams(project,wallet,job.block_number),job.last_block,job.last_block,job.last_log,limit+1);hasMore=rows.length>limit;rows=rows.slice(0,limit);
  const verified=await verifyParticipantEvents({provider,state,rows,loadReceipt:async txHash=>{
   const cached=db.prepare('SELECT receipt_json FROM participant_receipts WHERE tx_hash=?').get(txHash);if(cached)return JSON.parse(cached.receipt_json);
   const receipt=await provider.getTransactionReceipt(txHash);if(!receipt)fail('HISTORY_RECEIPT_UNAVAILABLE');pendingReceipts.set(txHash,receipt);return receipt;
  }});events=verified.events;
  for(const [hash,receipt] of pendingReceipts)pendingReceipts.set(hash,receiptData(receipt));
 }else if(job.phase==='positions'){
  const pending=db.prepare('SELECT * FROM participant_scan_positions WHERE scan_id=? AND key>? ORDER BY key LIMIT ?').all(job.id,job.last_key,limit+1);hasMore=pending.length>limit;
  positions=await Promise.all(pending.slice(0,limit).map(async p=>{const live=await sale.positions(p.key,{blockTag:state.blockNumber});
   if(!same(live.wallet,wallet)||String(live.identityId)!==p.identity_id||String(live.units)!==p.units||String(live.principal)!==p.principal||Boolean(live.delivered)!==Boolean(p.delivered))fail('PARTICIPANT_PROOF_MISMATCH');return p;}));
 }else if(job.phase==='finish')holding=state.kind===1?await sale.balanceOf(wallet,{blockTag:state.blockNumber}):await new Contract(state.extra.token,artifacts.LaunchToken.abi,provider).balanceOf(wallet,{blockTag:state.blockNumber});
 else fail('HISTORY_PHASE');
 if(!same((await provider.getBlock(state.blockNumber))?.hash,state.blockHash))fail('HISTORY_CURSOR_REORG');
 db.exec('BEGIN IMMEDIATE');
 try{
  const current=db.prepare('SELECT * FROM participant_scans WHERE id=?').get(job.id);if(!current)fail('HISTORY_SCAN_UNAVAILABLE');
  if(current.revision!==job.revision){if(current.revision===requested+1&&current.last_result){db.exec('ROLLBACK');return JSON.parse(current.last_result);}fail('HISTORY_CURSOR_STALE');}
  let phase=job.phase,lastBlock=job.last_block,lastLog=job.last_log,lastKey=job.last_key,processed=job.processed,participant=null;
  for(const [txHash,r] of pendingReceipts)db.prepare('INSERT OR IGNORE INTO participant_receipts(tx_hash,block_number,block_hash,receipt_json) VALUES(?,?,?,?)').run(txHash,r.blockNumber,r.blockHash,JSON.stringify(r));
  for(const e of events)db.prepare('INSERT OR IGNORE INTO participant_scan_receipts(scan_id,tx_hash) VALUES(?,?)').run(job.id,e.tx_hash);
  if(phase==='events'){
   applyEvents(db,job,events,acc,state);processed+=events.length;if(rows.length){lastBlock=rows.at(-1).block_number;lastLog=rows.at(-1).log_index;}
   if(!hasMore){if(processed!==job.total)fail('HISTORY_EVENT_COUNT');phase=state.kind===2?'positions':'finish';}
  }else if(phase==='positions'){
   for(const p of positions){acc.activeUnits+=BigInt(p.units);acc.principal+=BigInt(p.principal);if(p.delivered)acc.deliveredPositions+=BigInt(p.units);lastKey=p.key;}
   if(!hasMore)phase='finish';
  }else{
   if(acc.totalCredit-acc.withdrawn!==BigInt(state.who.creditWei)||acc.refundedPrincipal!==acc.refundCredited||acc.exitRefunded!==acc.exitCredited)fail('PARTICIPANT_PROOF_MISMATCH');
   if(state.kind===1){if(acc.subscribePrincipal!==BigInt(state.who.principalWei)||acc.subscribedUnits*BigInt(state.base.unitPrice)!==acc.subscribePrincipal||Boolean(acc.refundedCount)!==state.who.refunded)fail('PARTICIPANT_PROOF_MISMATCH');acc.principal=acc.subscribePrincipal;acc.activeUnits=state.who.refunded?0n:acc.subscribedUnits;}
   else if(acc.deliveredPositions!==acc.deliveredUnits)fail('PARTICIPANT_PROOF_MISMATCH');
   const receiptRows=db.prepare('SELECT r.tx_hash,r.block_number,r.block_hash FROM participant_scan_receipts s JOIN participant_receipts r ON r.tx_hash=s.tx_hash WHERE s.scan_id=? ORDER BY r.block_number,r.tx_hash LIMIT 50').all(job.id);
   const count=db.prepare('SELECT count(*) n FROM participant_scan_receipts WHERE scan_id=?').get(job.id).n;
   participant=participantOutcome({state,stats:acc,holdingBalance:holding,receiptProofs:receiptRows.map(r=>({transactionHash:r.tx_hash,blockNumber:r.block_number,blockHash:r.block_hash,status:1})),receiptProofsTotal:count,
    verifiedHistory:{scanId:job.id,complete:true,blockNumber:state.blockNumber,blockHash:state.blockHash,eventCount:processed,receiptCount:count}});phase='complete';
  }
  const next={...job,phase,revision:job.revision+1,last_block:lastBlock,last_log:lastLog,last_key:lastKey,processed};
  const result={schema:'echo-launch-history-page/v1',progress:historyProgress(next),observation:participant?observationFor(state,participant,confirmations):null};
  db.prepare('UPDATE participant_scans SET phase=?,revision=?,last_block=?,last_log=?,last_key=?,processed=?,acc_json=?,last_result=? WHERE id=?')
   .run(phase,next.revision,lastBlock,lastLog,lastKey,processed,JSON.stringify(deflate(acc)),JSON.stringify(result),job.id);db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
