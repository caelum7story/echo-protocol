import {validateDraft} from './core.mjs';
import {createLocalCover} from './media.mjs';
import {MAX_METADATA_UPLOAD_BYTES} from './file-budget.mjs';

// Each operation belongs to one visible context. Newer selections win, including
// when an older operation rejects after its replacement has already completed.
export function createAsyncScope(){
 const active=new Map();let generation=0,serial=0;
 function current(task){
  if(!task||task.generation!==generation||active.get(task.channel)!==task)return false;
  const now=task.context();return Array.isArray(now)&&now.length===task.values.length&&now.every((v,i)=>Object.is(v,task.values[i]));
 }
 return {
  begin(channel,context,details={}){
   if(typeof channel!=='string'||typeof context!=='function')throw Error('ASYNC_CONTEXT');
   const values=context();if(!Array.isArray(values))throw Error('ASYNC_CONTEXT');
   const task=Object.freeze({channel,context,values:[...values],details:{...details},generation,serial:++serial});active.set(channel,task);return task;
  },current,
  finish(task){if(active.get(task?.channel)===task)active.delete(task.channel);},
  cancel(channel){active.delete(channel);},
  cancelAll(){generation++;active.clear();},
  pending(channel){return channel?current(active.get(channel)):Array.from(active.values()).some(current);},
  entries(){return Array.from(active.values()).filter(current).map(task=>({channel:task.channel,...task.details}));}
 };
}

export async function runScopedTask(scope,task,work,{commit,onError=()=>{}}){
 try{
  const value=await work();
  if(!scope.current(task))return {status:'discarded'};
  commit(value);return {status:'applied'};
 }catch(error){
  if(!scope.current(task))return {status:'discarded'};
  onError(error);return {status:'error',code:error?.message??'READ_FAILED'};
 }finally{scope.finish(task);}
}

export async function readDraftFile(file,{kind,raw,createCover=createLocalCover}={}){
 if(!raw||!['nft','token'].includes(raw.type)||!file)throw Error('ASYNC_CONTEXT');
 if(kind==='cover')return {cover:await createCover(file)};
 if(kind!=='metadata'||raw.type!=='nft')throw Error('ASYNC_CONTEXT');
 if(!Number.isFinite(file.size)||file.size>MAX_METADATA_UPLOAD_BYTES)throw Error('METADATA_UPLOAD_SIZE');
 const metadataText=await file.text(),error=validateDraft({...raw,metadataText},{creating:false,demo:true}).metadataText;
 if(error)throw Error(error);
 return {metadataText};
}
