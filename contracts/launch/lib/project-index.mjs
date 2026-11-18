import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Contract,Interface,ZeroHash,getAddress,keccak256} from 'ethers';
import {LaunchAgentClient,jsonSafe} from './agent-client.mjs';
import {readParticipantProof} from './participant-proof.mjs';
import {ensureHistorySchema,participantWhere,participantParams,beginParticipantHistory,advanceParticipantHistory} from './participant-history.mjs';
import {readNftItems} from './nft-items.mjs';
const artifacts=Object.fromEntries(['LaunchRegistry','NftLaunch','TokenLaunch','LaunchToken'].map(name=>[name,JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),'utf8'))]));
const interfaces=Object.fromEntries(Object.entries(artifacts).map(([name,a])=>[name,new Interface(a.abi)]));
const APP_ID=0x45434c49,VERSION='1',fail=code=>{throw Error(code);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const integer=(n,minimum=0)=>{if(!Number.isSafeInteger(n)||n<minimum)fail('INDEX_INTEGER');return n;};
const hash=value=>{if(!/^0x[0-9a-fA-F]{64}$/.test(String(value)))fail('INDEX_HASH');return value.toLowerCase();};

// A durable read cache. It never signs,executes,proxies arbitrary RPC or declares a project audited.
export class LaunchProjectIndex{
 #provider;#config;#db;#start;#confirmations;#maxBlocks;#reorg;#busy=false;
 constructor({provider,config,databasePath,startBlock,confirmations=config.minConfirmations??12,maxBlocksPerSync=32,maxReorgDepth=64}){
  this.#provider=provider;this.#config=structuredClone(config);new LaunchAgentClient({provider,config});
  if(!config.registry?.address||!config.registry.runtimeHash)fail('LAUNCH_NOT_DEPLOYED');
  this.#start=integer(startBlock);this.#confirmations=integer(confirmations,1);this.#maxBlocks=integer(maxBlocksPerSync,1);this.#reorg=integer(maxReorgDepth,1);
  if(confirmations>128||maxBlocksPerSync>256||maxReorgDepth>2048||typeof databasePath!=='string'||!databasePath)fail('INDEX_POLICY');
  const templates=(config.approvedTemplates??[]).map(t=>({versionId:hash(t.versionId),kind:Number(t.kind),creationCodeHash:hash(t.creationCodeHash),factoryRuntimeHash:hash(t.factoryRuntimeHash)})).sort((a,b)=>a.versionId<b.versionId?-1:1);
  const identity=JSON.stringify({version:VERSION,chainId:config.chainId,registry:getAddress(config.registry.address),runtimeHash:hash(config.registry.runtimeHash),startBlock,confirmations,templates});
  const existed=databasePath!==':memory:'&&fs.existsSync(databasePath);
  if(databasePath!==':memory:')fs.mkdirSync(path.dirname(path.resolve(databasePath)),{recursive:true});
  const db=this.#db=new DatabaseSync(databasePath===':memory:'?databasePath:path.toNamespacedPath(databasePath));
  try{
   if(existed){
    if(db.prepare('PRAGMA application_id').get().application_id!==APP_ID)fail('INDEX_NOT_OWN_DATABASE');
    if(db.prepare("SELECT value FROM meta WHERE key='identity'").get()?.value!==identity)fail('INDEX_IDENTITY_MISMATCH');
   }
   db.exec(`PRAGMA application_id=${APP_ID}; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks(number INTEGER PRIMARY KEY,hash TEXT NOT NULL UNIQUE,parent_hash TEXT NOT NULL,timestamp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(address TEXT PRIMARY KEY,created_block INTEGER NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,created_tx TEXT NOT NULL,
      factory TEXT NOT NULL,creator TEXT NOT NULL,identity_id TEXT NOT NULL,version_id TEXT NOT NULL,config_hash TEXT NOT NULL,kind INTEGER NOT NULL,asset_address TEXT,interpreted INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(tx_hash TEXT NOT NULL,log_index INTEGER NOT NULL,block_number INTEGER NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,
      block_hash TEXT NOT NULL,address TEXT NOT NULL,name TEXT NOT NULL,args_json TEXT NOT NULL,PRIMARY KEY(tx_hash,log_index));
    CREATE INDEX IF NOT EXISTS events_address_block ON events(address,block_number,log_index);`);
   ensureHistorySchema(db);
   if(!existed)this.#put('identity',identity);
  }catch(error){db.close();throw error;}
 }
 #put(key,value){this.#db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
 #get(key){return this.#db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;}
 #head(){return this.#db.prepare('SELECT number,hash,parent_hash AS parentHash,timestamp FROM blocks ORDER BY number DESC LIMIT 1').get()??null;}
 status(){return {schema:'echo-launch-index-status/v1',chainId:this.#config.chainId,registry:this.#config.registry.address,startBlock:this.#start,
  confirmationsRequired:this.#confirmations,head:this.#head(),projects:this.#db.prepare('SELECT count(*) n FROM projects').get().n,events:this.#db.prepare('SELECT count(*) n FROM events').get().n,
  health:this.#get('health')??'not-synced',lastSuccessAt:this.#get('last_success_at'),lastError:this.#get('last_error'),cached:true,liveStateVerified:false,broadcast:false,financialExecutionAllowed:false};}
 async state(address,{wallet,handle}={}){
  if(this.#busy)fail('INDEX_SYNC_IN_PROGRESS');
  const p=getAddress(address),project=this.#db.prepare('SELECT * FROM projects WHERE lower(address)=lower(?)').get(p),head=this.#head();
  if(!project||!head)fail('INDEX_PROJECT_NOT_CONFIRMED');if(!project.interpreted)fail('INDEX_UNAPPROVED_TEMPLATE');
  if(!same((await this.#provider.getBlock(head.number))?.hash,head.hash))fail('INDEX_CURSOR_REORG');
  const state=await new LaunchAgentClient({provider:this.#provider,config:this.#config}).historicalSnapshot(p,{blockNumber:head.number,wallet,handle});
  if(!same(state.blockHash,head.hash)||!same(state.configHash,project.config_hash)||!same(state.versionId,project.version_id)||!same(state.factory,project.factory))fail('INDEX_STATE_PROVENANCE');
  const current=this.#head();if(!current||current.number!==head.number||!same(current.hash,head.hash))fail('INDEX_CURSOR_CHANGED');
  let participant=null,participantHistory=null;
  if(wallet){const rows=this.#db.prepare('SELECT * FROM events WHERE '+participantWhere+' ORDER BY block_number,log_index LIMIT 1001').all(...participantParams(p,wallet,head.number));
   try{participant=await readParticipantProof({provider:this.#provider,state,rows});}catch(error){
    if(error.message!=='PARTICIPANT_HISTORY_LIMIT')throw error;const scan=beginParticipantHistory({db:this.#db,state});participantHistory=scan.progress;participant=scan.observation?.participant??null;
   }
   const after=this.#head();if(!after||after.number!==head.number||!same(after.hash,head.hash))fail('INDEX_CURSOR_CHANGED');
  }
  return {schema:'echo-launch-indexed-state/v1',observedAt:new Date().toISOString(),index:this.status(),state,participant,participantHistory,executionReady:false,quoteAuthority:false,
   source:'canonical-confirmed-index-block',audited:false,contentVerified:false,financialExecutionAllowed:false};
 }
 async history({project,wallet,cursor,limit=25}){
  if(this.#busy)fail('INDEX_SYNC_IN_PROGRESS');return advanceParticipantHistory({db:this.#db,provider:this.#provider,config:this.#config,project:getAddress(project),wallet:getAddress(wallet),cursor,limit,confirmations:this.#confirmations});
 }
 async nftItems(options){if(this.#busy)fail('INDEX_SYNC_IN_PROGRESS');return readNftItems({...options,db:this.#db,provider:this.#provider,config:this.#config});}
 projects({offset=0,limit=50}={}){
  integer(offset);integer(limit,1);if(limit>100)fail('INDEX_PAGE');
  const rows=this.#db.prepare('SELECT * FROM projects ORDER BY created_block,address LIMIT ? OFFSET ?').all(limit,offset);
  return {status:this.status(),projects:rows.map(row=>({...row,templateReview:row.interpreted?'configured-template-requires-live-verification':'unreviewed-template',contentVerified:false,audited:false}))};
 }
 events({address,offset=0,limit=50}={}){
  integer(offset);integer(limit,1);if(limit>500)fail('INDEX_PAGE');
  const rows=address?this.#db.prepare('SELECT * FROM events WHERE lower(address)=lower(?) ORDER BY block_number,log_index LIMIT ? OFFSET ?').all(getAddress(address),limit,offset):
   this.#db.prepare('SELECT * FROM events ORDER BY block_number,log_index LIMIT ? OFFSET ?').all(limit,offset);
  return {status:this.status(),events:rows.map(row=>{const {args_json,...rest}=row;return {...rest,args:JSON.parse(args_json)};})};
 }
 async sync(){
  if(this.#busy)fail('INDEX_SYNC_IN_PROGRESS');this.#busy=true;
  try{return await this.#sync();}catch(error){const code=/^INDEX_[A-Z_]+$|^WRONG_CHAIN$|^REGISTRY_CODE_MISMATCH$|^LAUNCH_NOT_DEPLOYED$/.test(error.message)?error.message:'INDEX_RPC_READ_FAILED';
   this.#put('health','error');this.#put('last_error',code);throw Error(code);
  }finally{this.#busy=false;}
 }
 async #sync(){
  // Reuse the live chain/runtime/freshness checks before trusting even raw registry provenance.
  await new LaunchAgentClient({provider:this.#provider,config:this.#config}).list({offset:0,limit:1});
  const latest=await this.#provider.getBlock('latest');if(!latest)fail('INDEX_BLOCK_UNAVAILABLE');
  const oldHead=this.#head(),target=latest.number-this.#confirmations+1;
  if(oldHead&&latest.number<oldHead.number)fail('INDEX_RPC_BEHIND_CURSOR');
  let ancestor=oldHead?.number??this.#start-1,ancestorHash=oldHead?.hash??this.#get('anchor_hash');
  if(oldHead&&!same((await this.#provider.getBlock(oldHead.number))?.hash,oldHead.hash)){
   let common=null;
   for(let n=oldHead.number;n>=Math.max(this.#start,oldHead.number-this.#reorg+1);n--){const stored=this.#db.prepare('SELECT hash FROM blocks WHERE number=?').get(n);if(stored&&same((await this.#provider.getBlock(n))?.hash,stored.hash)){common={number:n,hash:stored.hash};break;}}
   if(!common&&oldHead.number-this.#start+1<=this.#reorg){const actual=this.#start===0?ZeroHash:(await this.#provider.getBlock(this.#start-1))?.hash;if(same(actual,this.#get('anchor_hash')))common={number:this.#start-1,hash:actual};}
   if(!common)fail('INDEX_REORG_BEYOND_HISTORY');ancestor=common.number;ancestorHash=common.hash;
  }
  if(!ancestorHash){const anchor=this.#start===0?ZeroHash:(await this.#provider.getBlock(this.#start-1))?.hash;if(!anchor)fail('INDEX_ANCHOR_UNAVAILABLE');ancestorHash=hash(anchor);}
  const from=ancestor+1,to=Math.min(target,from+this.#maxBlocks-1),headers=[],byNumber=new Map();let parent=ancestorHash;
  for(let n=from;n<=to;n++){const b=await this.#provider.getBlock(n);if(!b||b.number!==n||!same(b.parentHash,parent))fail('INDEX_INCONSISTENT_HEADERS');
   const row={number:n,hash:hash(b.hash),parentHash:hash(b.parentHash),timestamp:integer(b.timestamp)};headers.push(row);byNumber.set(n,row);parent=row.hash;}
  const registry=getAddress(this.#config.registry.address),registryContract=new Contract(registry,artifacts.LaunchRegistry.abi,this.#provider),allLogs=[],projects=[];
  const ingest=(log,iface)=>{
   if(log.removed||!byNumber.has(log.blockNumber)||!same(byNumber.get(log.blockNumber).hash,log.blockHash))fail('INDEX_NONCANONICAL_LOG');
   let parsed;try{parsed=iface.parseLog(log);}catch{return null;}if(!parsed)return null;
   integer(log.index);const event={blockNumber:log.blockNumber,blockHash:hash(log.blockHash),txHash:hash(log.transactionHash),index:log.index,address:getAddress(log.address),name:parsed.name,args:jsonSafe(parsed.args.toObject())};allLogs.push(event);return event;
  };
  if(headers.length){
   const logs=await this.#provider.getLogs({address:registry,fromBlock:from,toBlock:to});if(logs.length>100000)fail('INDEX_EVENT_LIMIT');
   for(const log of logs){if(!same(log.address,registry))fail('INDEX_LOG_ADDRESS');const event=ingest(log,interfaces.LaunchRegistry);if(event?.name==='ProjectRegistered'){
    const a=event.args,kind=Number(a.kind);if(![1,2].includes(kind))fail('INDEX_PROJECT_KIND');const address=getAddress(a.project),record=await registryContract.projects(address,{blockTag:event.blockNumber});
    if(!same(record.creator,a.creator)||!same(record.versionId,a.versionId)||!same(record.configHash,a.configHash)||String(record.identityId)!==String(a.identityId)||Number(record.kind)!==kind)fail('INDEX_PROJECT_RECORD');
    const approved=this.#config.approvedTemplates?.find(t=>same(t.versionId,a.versionId)&&Number(t.kind)===kind);let interpreted=0,asset=null;
    if(approved){const template=await registryContract.templates(a.versionId,{blockTag:event.blockNumber}),code=await this.#provider.getCode(record.factory,event.blockNumber);
     if(!same(template.factory,record.factory)||!same(template.creationCodeHash,approved.creationCodeHash)||!same(template.factoryRuntimeHash,approved.factoryRuntimeHash)||!same(keccak256(code),approved.factoryRuntimeHash))fail('INDEX_TEMPLATE_PIN_MISMATCH');
     interpreted=1;asset=kind===1?address:getAddress(await new Contract(address,artifacts.TokenLaunch.abi,this.#provider).token({blockTag:event.blockNumber}));}
    projects.push({address,created_block:event.blockNumber,created_tx:event.txHash,factory:getAddress(record.factory),
     creator:getAddress(a.creator),identity_id:String(a.identityId),version_id:hash(a.versionId),config_hash:hash(a.configHash),kind,asset_address:asset,interpreted});
   }}
   const known=this.#db.prepare('SELECT address,kind,asset_address,interpreted FROM projects WHERE created_block<=?').all(ancestor),bindings=new Map();
   for(const p of [...known,...projects])if(p.interpreted){bindings.set(p.address.toLowerCase(),p.kind===1?interfaces.NftLaunch:interfaces.TokenLaunch);if(p.kind===2)bindings.set(p.asset_address.toLowerCase(),interfaces.LaunchToken);}
   const addresses=[...bindings.keys()];for(let i=0;i<addresses.length;i+=50){const logs=await this.#provider.getLogs({address:addresses.slice(i,i+50),fromBlock:from,toBlock:to});
    if(logs.length+allLogs.length>100000)fail('INDEX_EVENT_LIMIT');for(const log of logs){const iface=bindings.get(log.address.toLowerCase());if(!iface)fail('INDEX_LOG_ADDRESS');ingest(log,iface);}}
   if(!same((await this.#provider.getBlock(to))?.hash,headers.at(-1).hash))fail('INDEX_REORG_DURING_READ');
  }
  const events=new Map();for(const event of allLogs){const id=event.txHash+':'+event.index,previous=events.get(id);if(previous&&JSON.stringify(previous)!==JSON.stringify(event))fail('INDEX_CONFLICTING_LOG');events.set(id,event);}
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const current=this.#head();if((current?.number??null)!==(oldHead?.number??null)||!same(current?.hash,oldHead?.hash))fail('INDEX_CONCURRENT_WRITER');
   if(oldHead&&ancestor<oldHead.number)this.#db.prepare('DELETE FROM blocks WHERE number>?').run(ancestor);
   this.#put('anchor_hash',this.#get('anchor_hash')??ancestorHash);
   const blockInsert=this.#db.prepare('INSERT INTO blocks(number,hash,parent_hash,timestamp) VALUES(?,?,?,?)');for(const b of headers)blockInsert.run(b.number,b.hash,b.parentHash,b.timestamp);
   const projectInsert=this.#db.prepare('INSERT INTO projects(address,created_block,created_tx,factory,creator,identity_id,version_id,config_hash,kind,asset_address,interpreted) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
   for(const p of projects)projectInsert.run(p.address,p.created_block,p.created_tx,p.factory,p.creator,p.identity_id,p.version_id,p.config_hash,p.kind,p.asset_address,p.interpreted);
   const eventInsert=this.#db.prepare('INSERT INTO events(tx_hash,log_index,block_number,block_hash,address,name,args_json) VALUES(?,?,?,?,?,?,?)');
   for(const e of [...events.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index))eventInsert.run(e.txHash,e.index,e.blockNumber,e.blockHash,e.address,e.name,JSON.stringify(e.args));
   this.#put('health',to<target?'syncing':target<(this.#head()?.number??this.#start)?'waiting-confirmations':'healthy');this.#put('last_error','');this.#put('last_success_at',new Date().toISOString());this.#db.exec('COMMIT');
  }catch(error){this.#db.exec('ROLLBACK');throw error;}
  return {indexedBlocks:headers.length,indexedEvents:events.size,newProjects:projects.length,rewoundBlocks:oldHead?oldHead.number-ancestor:0,caughtUp:to>=target,status:this.status()};
 }
 close(){this.#db.close();}
}
