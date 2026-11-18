import {normalizeDraft,validateDraft} from './core.mjs';
import {sealCheckCurrent} from './integrity.mjs';
const stamp=value=>typeof value==='string'&&value.length<=60&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const stepOf=value=>Math.max(0,Math.min(3,Math.floor(Number(value)||0)));
export function organizationFields(record={}){
 return {archivedAt:stamp(record.archivedAt),organizationUpdatedAt:stamp(record.organizationUpdatedAt),
  preservedFromWorking:record.preservedFromWorking===true,resumeStep:stepOf(record.resumeStep)};
}
export function draftProgress(raw,{now=Date.now()}={}){
 const errors=validateDraft(raw,{now,creating:true,demo:true}),groups=[
  ['name','symbol','tagline','description','category','cover','website','x','type'],
  ['price','startsAt','creatorRecipient',raw?.type==='nft'?'nftSupply':'minimumRaise'],
  ...(raw?.type==='nft'?[['metadataText']]:[])
 ];
 const complete=groups.map(fields=>fields.every(key=>!errors[key]));
 const first=complete.indexOf(false);
 return {errors,completeSections:complete.filter(Boolean).length,totalSections:groups.length,
  nextStep:first<0?3:first,readyForLocalReview:Object.keys(errors).length===0,
  needsFutureStart:errors.startsAt==='FUTURE_START',executionReady:false};
}
export function workspaceState(record,check){
 if(stamp(record.archivedAt))return 'archived';
 if(record.sealed)return sealCheckCurrent(record,check)?'sealed':'review';
 return 'draft';
}
export function workspaceEntries(records,{search='',type='all',status='current',sort='updated',checks=()=>null,lang='zh',now=Date.now()}={}){
 const query=String(search).normalize('NFKC').trim().toLocaleLowerCase().slice(0,200);
 const counts={current:0,draft:0,sealed:0,review:0,archived:0},entries=records.map(record=>{
  const check=checks(record),state=workspaceState(record,check);counts[state]++;if(state!=='archived')counts.current++;
  return {record,state,check,progress:record.sealed?null:draftProgress(record.raw,{now})};
 });
 const selected=entries.filter(({record,state})=>(status==='current'?state!=='archived':state===status)&&
  (type==='all'||record.raw.type===type)&&(!query||[record.raw.name,record.raw.symbol,record.raw.tagline,record.raw.description,record.id].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)));
 const collator=new Intl.Collator(lang==='en'?'en':'zh-CN',{numeric:true,sensitivity:'base'});
 const time=record=>Date.parse(record.updatedAt??record.createdAt)||0;
 selected.sort((a,b)=>sort==='name'?collator.compare(a.record.raw.name,b.record.raw.name)||collator.compare(a.record.id,b.record.id)
  :sort==='start'?(Date.parse(a.record.raw.startsAt)||Infinity)-(Date.parse(b.record.raw.startsAt)||Infinity)||collator.compare(a.record.id,b.record.id)
   :time(b.record)-time(a.record)||collator.compare(a.record.id,b.record.id));
 return {entries:selected,counts,total:records.length};
}
export function setArchived(data,id,archived,{now=Date.now()}={}){
 if(typeof archived!=='boolean')throw Error('ARCHIVE_STATE');
 if(!data.drafts.some(d=>d.id===id))throw Error('PROJECT_NOT_FOUND');
 const at=new Date(now).toISOString();
 return {...data,drafts:data.drafts.map(d=>d.id===id?{...d,archivedAt:archived?stamp(d.archivedAt)??at:null,organizationUpdatedAt:at}:d)};
}
export function preserveWorkingDraft(data,type,{nextRaw=null,idFactory=()=>`local:${crypto.randomUUID()}`,now=Date.now()}={}){
 const w=data.workings?.[type]??(data.working?.raw?.type===type?data.working:null);
 if(!w?.raw||w.raw.type!==type||w.edited===false)return {data,preservedId:null,created:false};
 const raw=normalizeDraft(w.raw),key=JSON.stringify(raw);
 if(nextRaw&&JSON.stringify(normalizeDraft(nextRaw))===key)return {data,preservedId:null,created:false};
 const existing=data.drafts.find(d=>JSON.stringify(normalizeDraft(d.raw))===key);
 if(existing)return {data,preservedId:existing.id,created:false};
 const at=new Date(now).toISOString(),id=idFactory(),record={id,raw,sealed:false,digest:null,sealRulesVersion:null,
  createdAt:at,updatedAt:at,...organizationFields({preservedFromWorking:true,resumeStep:w.step})};
 return {data:{...data,drafts:[...data.drafts,record]},preservedId:id,created:true};
}
export function closeWorkingForm(data,type,options={}){
 if(!['nft','token'].includes(type))throw Error('FORM_TYPE');
 const kept=preserveWorkingDraft(data,type,options),workings={...kept.data.workings};delete workings[type];
 return {...kept,data:{...kept.data,workings,working:kept.data.working?.raw?.type===type?null:kept.data.working}};
}
