import {normalizeDraft,SCHEMA} from './core.mjs';
import {operatingRecord} from './operating.mjs';
import {exampleProject} from './catalog.mjs';
import {organizationFields} from './workspace-list.mjs';
export const STORE_KEY='echo.launch.local.v2';
export const EMPTY_STORE=()=>({schema:SCHEMA,language:'zh',drafts:[],events:[],sessions:{},sessionArchives:[],working:null,workings:{},operatingPlans:{}});
export function sanitizeStore(value){
 const out=EMPTY_STORE();if(value?.schema!==SCHEMA)return out;
 out.language=value.language==='en'?'en':'zh';
 out.drafts=Array.isArray(value.drafts)?value.drafts.filter(x=>x&&typeof x.id==='string'&&x.raw&&['nft','token'].includes(x.raw.type)).map(x=>({
  id:x.id,raw:normalizeDraft(x.raw),sealed:x.sealed===true,exampleSource:x.exampleSource===true,
  digest:typeof x.digest==='string'?x.digest:null,sealRulesVersion:typeof x.sealRulesVersion==='string'?x.sealRulesVersion:null,createdAt:x.createdAt,updatedAt:x.updatedAt,...organizationFields(x)
 })):[];
 out.events=Array.isArray(value.events)?value.events.filter(x=>x&&typeof x.id==='string'&&x.id.startsWith('demo:')):[];
 out.sessions=value.sessions&&typeof value.sessions==='object'&&!Array.isArray(value.sessions)?value.sessions:{};
 out.sessionArchives=Array.isArray(value.sessionArchives)?value.sessionArchives:[];
 out.working=value.working?.raw?{...value.working,raw:normalizeDraft(value.working.raw),step:Math.max(0,Math.min(3,Math.floor(Number(value.working.step)||0))),edited:value.working.edited!==false}:null;
 for(const type of ['nft','token']){const w=value.workings?.[type];if(w?.raw&&w.raw.type===type)out.workings[type]={id:typeof w.id==='string'?w.id:null,raw:normalizeDraft(w.raw),step:Math.max(0,Math.min(3,Math.floor(Number(w.step)||0))),edited:w.edited!==false};}
 if(value.operatingPlans&&typeof value.operatingPlans==='object'&&!Array.isArray(value.operatingPlans))for(const [id,record]of Object.entries(value.operatingPlans)){
  const type=out.drafts.find(d=>d.id===id)?.raw.type??exampleProject(id)?.raw.type;
  if(type&&record&&typeof record==='object'&&!Array.isArray(record))Object.defineProperty(out.operatingPlans,id,{value:operatingRecord(record,type),enumerable:true,writable:true,configurable:true});
 }
 return out;
}
export function readStore(storage){
 let raw;
 try{raw=storage.getItem(STORE_KEY);}catch{return {data:EMPTY_STORE(),error:'storage-unavailable',sourceRaw:undefined,writeBlocked:true};}
 if(raw===null)return {data:EMPTY_STORE(),error:null,sourceRaw:null,writeBlocked:false};
 let parsed;
 try{parsed=JSON.parse(raw);}catch{return {data:EMPTY_STORE(),error:'storage-corrupt',sourceRaw:raw,writeBlocked:true};}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.schema!==SCHEMA)
  return {data:EMPTY_STORE(),error:'storage-incompatible',sourceRaw:raw,writeBlocked:true};
 const validShape=Array.isArray(parsed.drafts)&&Array.isArray(parsed.events)&&parsed.sessions&&typeof parsed.sessions==='object'&&!Array.isArray(parsed.sessions);
 const data=sanitizeStore(parsed);
 const partial=!validShape||data.drafts.length!==parsed.drafts.length||data.events.length!==parsed.events.length;
 return {data,error:partial?'storage-partial':null,sourceRaw:raw,writeBlocked:partial};
}
export function writeStore(storage,data,options={}){
 try{
  if(Object.hasOwn(options,'expectedRaw')&&storage.getItem(STORE_KEY)!==options.expectedRaw)return 'storage-conflict';
  storage.setItem(STORE_KEY,JSON.stringify(data));return null;
 }catch(e){return e?.name==='QuotaExceededError'?'storage-quota':'storage-unavailable';}
}
export function makeId(prefix='local'){return `${prefix}:${crypto.randomUUID()}`;}
