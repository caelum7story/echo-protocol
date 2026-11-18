import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {LaunchProjectIndex} from '../lib/project-index.mjs';

const root=path.resolve(import.meta.dirname,'..'),APP_ID=0x45434c49,MAX_BYTES=64*1024*1024;
const fail=code=>{throw Error(code);},digest=data=>createHash('sha256').update(data).digest('hex');
export function hashBackupFile(file){const h=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())fail('BACKUP_REGULAR_FILE_REQUIRED');return stat;}
function readonly(file){regular(file);const db=new DatabaseSync(path.toNamespacedPath(file),{readOnly:true,allowExtension:false});db.exec('PRAGMA query_only=ON;PRAGMA trusted_schema=OFF;PRAGMA busy_timeout=5000;');return db;}
function schema(db){return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();}
function scopeFor(settings){
 // Reuse the real constructor's canonical identity/schema,not a second copy of its rules.
 const directory=fs.mkdtempSync(path.join(root,'evidence/backup-scope-')),file=path.join(directory,'scope.sqlite');let index,db;
 try{index=new LaunchProjectIndex({...settings,provider:null,databasePath:file});index.close();index=null;db=readonly(file);return {identity:db.prepare("SELECT value FROM meta WHERE key='identity'").get().value,schemaHash:digest(JSON.stringify(schema(db)))};}
 finally{db?.close();index?.close();for(const name of ['scope.sqlite','scope.sqlite-wal','scope.sqlite-shm']){const target=path.resolve(directory,name);if(!target.startsWith(path.resolve(directory)+path.sep))fail('BACKUP_CLEANUP_SCOPE');if(fs.existsSync(target))fs.unlinkSync(target);}fs.rmdirSync(directory);}
}
function inspect(db,expected){
 if(db.prepare('PRAGMA application_id').get().application_id!==APP_ID)fail('BACKUP_NOT_INDEX_DATABASE');
 const identity=db.prepare("SELECT value FROM meta WHERE key='identity'").get()?.value;
 if(identity!==expected.identity)fail('BACKUP_SCOPE_MISMATCH');
 const schemaHash=digest(JSON.stringify(schema(db)));if(schemaHash!==expected.schemaHash)fail('BACKUP_SCHEMA_MISMATCH');
 if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_INTEGRITY');
 const tables=schema(db).filter(x=>x.type==='table').map(x=>x.name),counts={};
 for(const name of tables){const statement=db.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"');statement.setReadBigInts(true);counts[name]=String(statement.get().n);}
 const head=db.prepare('SELECT number,hash,parent_hash AS parentHash,timestamp FROM blocks ORDER BY number DESC LIMIT 1').get()??null;
 return {identityHash:digest(identity),schemaHash,counts,head,health:db.prepare("SELECT value FROM meta WHERE key='health'").get()?.value??'not-synced'};
}
function newDirectory(value){const absolute=path.resolve(value),parent=fs.realpathSync(path.dirname(absolute)),target=path.join(parent,path.basename(absolute));if(fs.existsSync(target))fail('BACKUP_DESTINATION_EXISTS');fs.mkdirSync(target);return fs.realpathSync(target);}
function seal(file,data){const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function syncFile(file){const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export async function backupIndex({source,bundle,settings,rate=100,onProgress,maxBytes=MAX_BYTES,timeoutMs=30000}){
 if(!Number.isSafeInteger(rate)||rate<1||rate>1000||!Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>512*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)fail('BACKUP_POLICY');
 const expected=scopeFor(settings),db=readonly(source);let directory;
 try{
  const pageSize=db.prepare('PRAGMA page_size').get().page_size,pageCount=db.prepare('PRAGMA page_count').get().page_count;
  if(pageSize*pageCount>maxBytes)fail('BACKUP_SIZE_LIMIT');
  inspect(db,expected);
  directory=newDirectory(bundle);const target=path.join(directory,'snapshot.sqlite'),started=Date.now();let steps=0;
  const pages=await backup(db,path.toNamespacedPath(target),{rate,progress:progress=>{steps++;if(Date.now()-started>timeoutMs)fail('BACKUP_TIMEOUT');if(progress.totalPages*pageSize>maxBytes)fail('BACKUP_SIZE_LIMIT');onProgress?.(progress);}});
  const copy=new DatabaseSync(path.toNamespacedPath(target));let observation;
  try{copy.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;');observation=inspect(copy,expected);}finally{copy.close();}
  const bytes=regular(target).size;if(bytes>maxBytes)fail('BACKUP_SIZE_LIMIT');syncFile(target);
  const manifest={schema:'echo-launch-index-backup/v1',createdAt:new Date().toISOString(),snapshotFile:'snapshot.sqlite',snapshotSha256:hashBackupFile(target),snapshotBytes:bytes,pages,steps,observation,
   complete:true,readOnlySource:true,canonicalAtBackupNotVerified:true,liveStateVerified:false,financialExecutionAllowed:false};
  seal(path.join(directory,'manifest.json'),manifest);return {bundle:directory,manifest};
 }finally{db.close();}
}
export function verifyIndexBackup({bundle,settings}){
 const directory=fs.realpathSync(bundle),manifestFile=path.join(directory,'manifest.json'),target=path.join(directory,'snapshot.sqlite');
 if(!fs.existsSync(manifestFile))fail('BACKUP_INCOMPLETE');
 if(regular(manifestFile).size>131072)fail('BACKUP_MANIFEST_LIMIT');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(manifest.schema!=='echo-launch-index-backup/v1'||manifest.complete!==true||manifest.financialExecutionAllowed!==false||manifest.liveStateVerified!==false||manifest.canonicalAtBackupNotVerified!==true||manifest.readOnlySource!==true||manifest.snapshotFile!=='snapshot.sqlite'||!Number.isSafeInteger(manifest.snapshotBytes)||manifest.snapshotBytes<4096||manifest.snapshotBytes>512*1024*1024||!/^[0-9a-f]{64}$/.test(manifest.snapshotSha256))fail('BACKUP_MANIFEST');
 if(regular(target).size!==manifest.snapshotBytes||hashBackupFile(target)!==manifest.snapshotSha256)fail('BACKUP_CHECKSUM');
 const db=readonly(target);let observation;try{observation=inspect(db,scopeFor(settings));}finally{db.close();}
 if(JSON.stringify(observation)!==JSON.stringify(manifest.observation))fail('BACKUP_OBSERVATION_MISMATCH');
 return {bundle:directory,manifest,verified:true,financialExecutionAllowed:false,liveStateVerified:false};
}
export function restoreIndexBackup({bundle,destination,settings}){
 const verified=verifyIndexBackup({bundle,settings}),directory=newDirectory(destination),target=path.join(directory,'index.sqlite');
 fs.copyFileSync(path.join(verified.bundle,'snapshot.sqlite'),target,fs.constants.COPYFILE_EXCL);
 if(hashBackupFile(target)!==verified.manifest.snapshotSha256)fail('BACKUP_CHECKSUM');
 const index=new LaunchProjectIndex({...settings,provider:null,databasePath:target});let status;try{status=index.status();}finally{index.close();}
 const db=readonly(target);try{if(JSON.stringify(inspect(db,scopeFor(settings)))!==JSON.stringify(verified.manifest.observation))fail('RESTORE_OBSERVATION_MISMATCH');}finally{db.close();}
 syncFile(target);const result={schema:'echo-launch-index-restore/v1',restoredAt:new Date().toISOString(),database:target,sourceSnapshotSha256:verified.manifest.snapshotSha256,status,
  freshSyncRequired:true,liveStateVerified:false,financialExecutionAllowed:false};
 seal(path.join(directory,'restore.json'),result);return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const {values:v,positionals:p}=parseArgs({allowPositionals:true,options:Object.fromEntries(['source','bundle','destination','config','start-block','confirmations'].map(k=>[k,{type:'string'}]))});
  if(p.length!==1||!['backup','verify','restore'].includes(p[0])||!v.bundle||!v.config||!/^\d+$/.test(v['start-block']??''))fail('BACKUP_ARGUMENTS');
  if(regular(v.config).size>2*1024*1024)fail('BACKUP_CONFIG_LIMIT');
  const settings={config:JSON.parse(fs.readFileSync(v.config,'utf8')),startBlock:Number(v['start-block']),...(v.confirmations===undefined?{}:{confirmations:Number(v.confirmations)})};
  const result=p[0]==='backup'?await backupIndex({source:v.source,bundle:v.bundle,settings}):p[0]==='verify'?verifyIndexBackup({bundle:v.bundle,settings}):restoreIndexBackup({bundle:v.bundle,destination:v.destination,settings});
  console.log(JSON.stringify(result,null,2));
 }catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'INDEX_BACKUP_FAILED',financialExecutionAllowed:false}));process.exitCode=1;}
}
