import {SCHEMA,normalizeDraft,normalizeIdentity,digest} from './core.mjs';
import {makeId} from './local-store.mjs';
import {OPERATING_SCHEMA,operatingRecord} from './operating.mjs';
import {exampleProject} from './catalog.mjs';
import {nftRanges} from './delivery.mjs';
import {organizationFields} from './workspace-list.mjs';
import {MAX_BACKUP_BYTES,SINGLE_RECOVERY_LIMITS,MULTIPART_RECOVERY_LIMITS} from './file-budget.mjs';
export {MAX_BACKUP_BYTES} from './file-budget.mjs';
export const BACKUP_SCHEMA='echo-launch-browser-backup/v2';
const kinds=new Set(['subscribe','exit','refund','claim','batch','seed']);
const money=/^(0|[1-9]\d{0,77})$/;
const text=(value,max=200)=>String(value??'').slice(0,max);
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9:._-]{1,180}$/.test(value);
function recoverDraft(raw){
 if(!raw||!['nft','token'].includes(raw.type))return null;
 // Missing dates stay missing. Importing twice must not generate different starts.
 return normalizeDraft({...raw,startsAt:typeof raw.startsAt==='string'?raw.startsAt:''});
}
export function buildBackup(data,{legacy={},sourceRaw=null,storageError=null,now=Date.now()}={}){
 const kept={};for(const [key,value]of Object.entries(legacy))if(/^echo[.-]launch[.-]/i.test(key)&&typeof value==='string')kept[key]=value;
 return {schema:BACKUP_SCHEMA,createdAt:new Date(now).toISOString(),scope:'browser-local-only',
  executionReady:false,data,legacy:kept,recovery:{storageError,originalRaw:storageError?sourceRaw:null},
  restorePolicy:'Merge plans as new unsealed drafts and optional local demo history. Never overwrite existing plans, restore execution authority, mutate legacy storage or treat records as chain receipts.'};
}
export async function prepareBackupImport(raw,current,{now=Date.now(),profile='single',isCurrent=()=>true}={}){
 const active=()=>{if(!isCurrent())throw Error('BACKUP_CANCELLED');};active();
 if(!['single','multipart'].includes(profile))throw Error('BACKUP_SCHEMA');
 const bounds=profile==='multipart'?MULTIPART_RECOVERY_LIMITS:SINGLE_RECOVERY_LIMITS;
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>bounds.bytes)throw Error('BACKUP_SIZE');
 let input;try{input=JSON.parse(raw);}catch{throw Error('BACKUP_JSON');}
 if(input?.schema!==BACKUP_SCHEMA||input.data?.schema!==SCHEMA||!Array.isArray(input.data.drafts))throw Error('BACKUP_SCHEMA');
 if(input.data.drafts.length>bounds.drafts||!Array.isArray(input.data.events)||input.data.events.length>bounds.events)throw Error('BACKUP_LIMIT');
 if(input.data.operatingPlans!==undefined&&(!input.data.operatingPlans||typeof input.data.operatingPlans!=='object'||Array.isArray(input.data.operatingPlans)))throw Error('BACKUP_SCHEMA');
 if(Object.keys(input.data.operatingPlans??{}).length>bounds.costs)throw Error('BACKUP_LIMIT');
 const existing=new Map();for(const d of current.drafts??[]){active();const f=recoverDraft(d.raw);if(f)existing.set(await digest(f),d.id);}
 for(const w of [current.working,current.workings?.nft,current.workings?.token]){
  const f=recoverDraft(w?.raw);if(f){const key=await digest(f);if(!existing.has(key))existing.set(key,null);}
 }
 const candidates=[...input.data.drafts];
 for(const w of [input.data.working,input.data.workings?.nft,input.data.workings?.token])if(w?.raw&&w.edited!==false)candidates.push(w);
 const ids=new Map(),drafts=[],events=[],operatingPlans={},stamp=new Date(now).toISOString();
 const counts={newDrafts:0,newArchivedDrafts:0,duplicateDrafts:0,invalidDrafts:0,newEvents:0,duplicateEvents:0,invalidEvents:0,
  newOperatingPlans:0,duplicateOperatingPlans:0,invalidOperatingPlans:0,
  ignoredSessions:Object.keys(input.data.sessions??{}).length,ignoredLegacyKeys:Object.keys(input.legacy??{}).length};
 for(const item of candidates){
  active();
  const f=recoverDraft(item?.raw);if(!f){counts.invalidDrafts++;continue;}
  const fingerprint=await digest(f);let id=existing.get(fingerprint);
  if(existing.has(fingerprint))counts.duplicateDrafts++;
  else{
   const org=organizationFields({...item,resumeStep:item.resumeStep??item.step});
   id=makeId();drafts.push({id,raw:f,sealed:false,digest:null,createdAt:stamp,updatedAt:stamp,restoredAt:stamp,...org});if(org.archivedAt)counts.newArchivedDrafts++;
   existing.set(fingerprint,id);counts.newDrafts++;
  }
  if(id&&safeId(item?.id)&&!ids.has(item.id))ids.set(item.id,id);
 }
 const seenEvents=new Set((current.events??[]).map(e=>e.id));
 for(const item of input.data.events){
  active();
  if(!safeId(item?.id)||!item.id.startsWith('demo:')||!safeId(item.projectId)||!kinds.has(item.kind)||!Number.isFinite(Date.parse(item.createdAt))){counts.invalidEvents++;continue;}
  if(seenEvents.has(item.id)){counts.duplicateEvents++;continue;}
  let identity;try{identity=normalizeIdentity(item.identity);}catch{counts.invalidEvents++;continue;}
  const values={};let valid=true;
  for(const key of ['units','paymentWei','refundWei','platformFeeWei'])if(item[key]!==undefined){if(!money.test(String(item[key])))valid=false;else values[key]=String(item[key]);}
  if(!valid){counts.invalidEvents++;continue;}
  const projectId=ids.get(item.projectId)??item.projectId;
  if(item.reservedTokenIds!==null&&item.reservedTokenIds!==undefined&&(!Array.isArray(item.reservedTokenIds)||item.reservedTokenIds.length)){
   const project=[...(current.drafts??[]),...drafts].find(d=>d.id===projectId)?.raw??exampleProject(projectId)?.raw;
   try{if(project?.type==='token')throw Error('WRONG_TYPE');values.reservedTokenIds=nftRanges(item.reservedTokenIds,{supply:project?.nftSupply??String(Number.MAX_SAFE_INTEGER),units:item.units??null}).ranges;}
   catch{counts.invalidEvents++;continue;}
  }
  events.push({id:item.id,projectId,projectName:text(item.projectName,48),identity,kind:item.kind,
   createdAt:new Date(item.createdAt).toISOString(),scenario:text(item.scenario,30),...values,
   chainId:56,transactionHash:null,verification:'restored-local-only',restored:true});
  seenEvents.add(item.id);counts.newEvents++;
 }
 if(input.data.operatingPlans&&typeof input.data.operatingPlans==='object'&&!Array.isArray(input.data.operatingPlans))for(const [sourceId,item]of Object.entries(input.data.operatingPlans)){
  const projectId=ids.get(sourceId)??(exampleProject(sourceId)?sourceId:null);
  const type=[...(current.drafts??[]),...drafts].find(d=>d.id===projectId)?.raw.type??exampleProject(projectId)?.raw.type;
  if(!projectId||!type||item?.schema!==OPERATING_SCHEMA||!item.inputs||typeof item.inputs!=='object'||Array.isArray(item.inputs)){counts.invalidOperatingPlans++;continue;}
  if(Object.hasOwn(current.operatingPlans??{},projectId)||Object.hasOwn(operatingPlans,projectId)){counts.duplicateOperatingPlans++;continue;}
  Object.defineProperty(operatingPlans,projectId,{value:operatingRecord(item,type),enumerable:true});counts.newOperatingPlans++;
 }
 active();return {schema:BACKUP_SCHEMA,drafts,events,operatingPlans,counts,preparedAt:stamp,
  executionReady:false,policy:'merge-only; restored drafts are unsealed; no session, legacy-key or transaction-authority restoration'};
}
export function mergeBackupImport(current,prepared,{includeEvents=true,includeOperatingPlans=true}={}){
 if(prepared?.schema!==BACKUP_SCHEMA||prepared.executionReady!==false)throw Error('BACKUP_SCHEMA');
 const ids=new Set(current.drafts.map(d=>d.id)),eventIds=new Set(current.events.map(e=>e.id));
 const drafts=prepared.drafts.filter(d=>!ids.has(d.id)).map(d=>({...d,raw:normalizeDraft(d.raw),sealed:false,digest:null}));
 const events=includeEvents?prepared.events.filter(e=>!eventIds.has(e.id)).map(e=>({...e,chainId:56,transactionHash:null,verification:'restored-local-only',restored:true})):[];
 const operatingPlans={...current.operatingPlans};
 if(includeOperatingPlans)for(const [id,record]of Object.entries(prepared.operatingPlans??{}))if(!Object.hasOwn(operatingPlans,id)){
  const type=[...current.drafts,...drafts].find(d=>d.id===id)?.raw.type??exampleProject(id)?.raw.type;
  if(type)Object.defineProperty(operatingPlans,id,{value:operatingRecord(record,type),enumerable:true,writable:true,configurable:true});
 }
 return {...current,drafts:[...current.drafts,...drafts],events:[...current.events,...events],operatingPlans};
}
