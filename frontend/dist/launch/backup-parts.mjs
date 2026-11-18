import {utf8Bytes,MAX_BACKUP_BYTES,MIB,MULTIPART_RECOVERY_LIMITS} from './file-budget.mjs';
import {BACKUP_SCHEMA,prepareBackupImport} from './recovery.mjs';
export const PART_SCHEMA='echo-launch-backup-part/v1';
export const PART_CHUNK_BYTES=8*MIB;
export const MAX_PACK_BYTES=MULTIPART_RECOVERY_LIMITS.bytes;
export const MAX_PART_FILES=128;
export const MAX_PACK_INPUT_BYTES=96*MIB;
const hex=/^[a-f0-9]{64}$/;
const fail=(code,extra={})=>{throw Object.assign(Error(code),extra);};
const active=check=>{if(!check())fail('BACKUP_CANCELLED');};
async function hash(bytes){const result=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');}
function encode(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function decode(text){
 if(typeof text!=='string'||text.length%4||text.length>Math.ceil(PART_CHUNK_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('BACKUP_PART_SCHEMA');
 let binary;try{binary=atob(text);}catch{fail('BACKUP_PART_SCHEMA');}const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
export async function makeBackupParts(text,{chunkBytes=PART_CHUNK_BYTES,isCurrent=()=>true,onProgress=()=>{}}={}){
 if(typeof text!=='string'||!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>PART_CHUNK_BYTES)fail('BACKUP_PART_SCHEMA');
 const bytes=new TextEncoder().encode(text);if(bytes.length>MAX_PACK_BYTES)fail('BACKUP_PACK_SIZE');
 let backup;try{backup=JSON.parse(text);}catch{fail('BACKUP_JSON');}
 if(backup?.schema!==BACKUP_SCHEMA||backup.data?.schema!=='echo-launch-local/v2')fail('BACKUP_SCHEMA');
 if(!Array.isArray(backup.data.drafts)||backup.data.drafts.length>MULTIPART_RECOVERY_LIMITS.drafts||!Array.isArray(backup.data.events)||backup.data.events.length>MULTIPART_RECOVERY_LIMITS.events||Object.keys(backup.data.operatingPlans??{}).length>MULTIPART_RECOVERY_LIMITS.costs)fail('BACKUP_PACK_LIMIT');
 const total=Math.ceil(bytes.length/chunkBytes);if(total<1||total>MAX_PART_FILES)fail('BACKUP_PART_COUNT');active(isCurrent);
 const payloadDigest=await hash(bytes);active(isCurrent);const backupId='pack:'+payloadDigest,parts=[];
 for(let index=1;index<=total;index++){
  active(isCurrent);const chunk=bytes.subarray((index-1)*chunkBytes,Math.min(index*chunkBytes,bytes.length)),chunkDigest=await hash(chunk);active(isCurrent);
  const part={schema:PART_SCHEMA,scope:'browser-local-only',executionReady:false,backupId,index,total,
   payloadBytes:bytes.length,payloadDigest,chunkBytes:chunk.length,chunkDigest,encoding:'base64',data:encode(chunk)};
  const body=JSON.stringify(part);if(utf8Bytes(body)>MAX_BACKUP_BYTES)fail('BACKUP_PART_SIZE');
  parts.push({index,filename:`echo-launch-backup-${payloadDigest.slice(0,12)}-${String(index).padStart(3,'0')}-of-${String(total).padStart(3,'0')}.json`,bytes:utf8Bytes(body),text:body});
  onProgress({stage:'export',completed:index,total});
 }
 return {schema:PART_SCHEMA,backupId,payloadDigest,payloadBytes:bytes.length,total,parts,executionReady:false};
}
function header(part){
 if(part?.schema!==PART_SCHEMA||part.scope!=='browser-local-only'||part.executionReady!==false||part.encoding!=='base64'||!hex.test(part.payloadDigest??'')||!hex.test(part.chunkDigest??'')||part.backupId!=='pack:'+part.payloadDigest||!Number.isSafeInteger(part.index)||!Number.isSafeInteger(part.total)||part.index<1||part.index>part.total||part.total<1||part.total>MAX_PART_FILES||!Number.isSafeInteger(part.payloadBytes)||part.payloadBytes<1||part.payloadBytes>MAX_PACK_BYTES||!Number.isSafeInteger(part.chunkBytes)||part.chunkBytes<1||part.chunkBytes>PART_CHUNK_BYTES)fail('BACKUP_PART_SCHEMA');
 return [part.backupId,part.total,part.payloadBytes,part.payloadDigest].join('|');
}
export async function readBackupParts(parts,{isCurrent=()=>true,onProgress=()=>{}}={}){
 if(!Array.isArray(parts)||!parts.length||parts.length>MAX_PART_FILES)fail('BACKUP_PART_COUNT');
 let group=null,duplicates=0,checked=0;const chunks=new Map();
 for(const part of parts){
  active(isCurrent);const key=header(part);if(group!==null&&group!==key)fail('BACKUP_PART_MIXED');group=key;
  const bytes=decode(part.data);if(bytes.length!==part.chunkBytes||await hash(bytes)!==part.chunkDigest)fail('BACKUP_PART_DIGEST');active(isCurrent);
  const existing=chunks.get(part.index);if(existing){if(existing.digest!==part.chunkDigest||existing.bytes.length!==bytes.length)fail('BACKUP_PART_CONFLICT');duplicates++;}
  else chunks.set(part.index,{bytes,digest:part.chunkDigest});
  onProgress({stage:'verify',completed:++checked,total:parts.length});
 }
 const first=parts[0],missing=Array.from({length:first.total},(_,i)=>i+1).filter(i=>!chunks.has(i));if(missing.length)fail('BACKUP_PART_MISSING',{missing});
 const totalBytes=Array.from(chunks.values()).reduce((n,c)=>n+c.bytes.length,0);if(totalBytes!==first.payloadBytes)fail('BACKUP_PART_DIGEST');
 const payload=new Uint8Array(totalBytes);let offset=0;for(let index=1;index<=first.total;index++){payload.set(chunks.get(index).bytes,offset);offset+=chunks.get(index).bytes.length;}
 active(isCurrent);if(await hash(payload)!==first.payloadDigest)fail('BACKUP_PART_DIGEST');active(isCurrent);
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(payload);}catch{fail('BACKUP_PART_SCHEMA');}
 return {text,transport:{kind:'parts',backupId:first.backupId,parts:first.total,duplicates,payloadBytes:totalBytes,payloadDigest:first.payloadDigest,integrityVerified:true,signatureVerified:false,executionReady:false}};
}
export async function prepareRecoveryFiles(files,current,{now=Date.now(),isCurrent=()=>true,onProgress=()=>{}}={}){
 if(!Array.isArray(files)||!files.length||files.length>MAX_PART_FILES)fail('BACKUP_PART_COUNT');
 if(files.some(f=>!Number.isFinite(f?.size)||f.size<1||f.size>MAX_BACKUP_BYTES)||files.reduce((n,f)=>n+f.size,0)>MAX_PACK_INPUT_BYTES)fail('BACKUP_PART_SIZE');
 const parts=[];let single=null;
 for(let i=0;i<files.length;i++){
  active(isCurrent);const text=await files[i].text();active(isCurrent);if(utf8Bytes(text)>MAX_BACKUP_BYTES)fail('BACKUP_PART_SIZE');
  let data;try{data=JSON.parse(text);}catch{fail('BACKUP_JSON');}
  if(data?.schema===PART_SCHEMA)parts.push(data);else if(data?.schema===BACKUP_SCHEMA){if(files.length!==1)fail('BACKUP_PART_MIXED');single=text;}else fail('BACKUP_SCHEMA');
  onProgress({stage:'read',completed:i+1,total:files.length});
 }
 const decoded=single?{text:single,transport:{kind:'single',parts:1,duplicates:0,payloadBytes:utf8Bytes(single),integrityVerified:false,signatureVerified:false,executionReady:false}}:await readBackupParts(parts,{isCurrent,onProgress});
 active(isCurrent);const prepared=await prepareBackupImport(decoded.text,current,{now,profile:single?'single':'multipart',isCurrent});active(isCurrent);
 return {...prepared,transport:decoded.transport};
}
