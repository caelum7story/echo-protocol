import {RULES,SCHEMA,makeManifest,stringify,digest,normalizeDraft} from './core.mjs';
import {MAX_MANIFEST_BYTES,MAX_SEAL_SNAPSHOT_BYTES,utf8Bytes,checkTextBudget} from './file-budget.mjs';

// A local content check is not authentication, an audit or chain verification.
export function sealSnapshot(record){
 return stringify({id:record?.id,raw:record?.raw,sealed:record?.sealed===true,digest:record?.digest??null,sealRulesVersion:record?.sealRulesVersion??null},0);
}
export async function verifySealedRecord(record,{now=Date.now()}={}){
 const base={schema:'echo-launch-seal-check/v1',snapshot:sealSnapshot(record),executionReady:false,
  checkedAt:new Date(now).toISOString(),recordedDigest:record?.digest??null,computedDigest:null,
  rulesVersion:RULES.version,signatureVerified:false,chainVerified:false};
 if(record?.sealed!==true)return {...base,status:'not-sealed'};
 if(typeof record.id!=='string'||record.id.length>180||!record.raw||!['nft','token'].includes(record.raw.type))return {...base,status:'invalid-project'};
 if(record.sealRulesVersion&&record.sealRulesVersion!==RULES.version)return {...base,status:'unsupported-version'};
 if(typeof record.digest!=='string'||!/^[a-f0-9]{64}$/.test(record.digest))return {...base,status:'missing-digest'};
 if(utf8Bytes(base.snapshot)>MAX_SEAL_SNAPSHOT_BYTES)return {...base,status:'invalid-project',reason:'REVIEW_SIZE'};
 try{
  const manifest=await makeManifest(record.raw,{id:record.id,now,demo:true});
  return {...base,computedDigest:manifest.configDigest,status:manifest.configDigest===record.digest?'consistent':'digest-mismatch'};
 }catch(error){
  const reason=String(error?.message??'CHECK_FAILED');
  return {...base,status:reason.startsWith('INVALID_DRAFT:')?'invalid-project':'unavailable',reason:reason.slice(0,200)};
 }
}
export function sealCheckCurrent(record,check){
 return check?.status==='consistent'&&check.snapshot===sealSnapshot(record);
}
export async function inspectManifestFile(text,{now=Date.now()}={}){
 checkTextBudget(text,MAX_MANIFEST_BYTES,'IMPORT_SIZE');
 let input;try{input=JSON.parse(text);}catch{throw Error('IMPORT_JSON');}
 if(input?.schema!==SCHEMA||!['nft','token'].includes(input.project?.type))throw Error('IMPORT_SCHEMA');
 const result={schema:'echo-launch-file-check/v1',executionReady:false,signatureVerified:false,chainVerified:false,
  checkedAt:new Date(now).toISOString(),id:typeof input.id==='string'?input.id.slice(0,180):null,
  projectName:String(input.project.name??'').slice(0,48),rulesVersion:String(input.rulesVersion??'').slice(0,100),
  recordedDigest:typeof input.configDigest==='string'?input.configDigest:null,computedDigest:null,currentRulesDigest:null,
  sourceHashMatches:false,metadataHashMatches:null,projectImportable:false,status:'missing-digest'};
 const payload={...input};delete payload.configDigest;
 result.computedDigest=await digest(payload);
 result.sourceHashMatches=result.computedDigest===result.recordedDigest;
 if(input.project.type==='nft')result.metadataHashMatches=Array.isArray(input.metadata)&&await digest(input.metadata)===input.metadataDigest;
 try{
  const raw=normalizeDraft({...input.project,metadataText:JSON.stringify(input.metadata??[])});
  const rebuilt=await makeManifest(raw,{id:input.id,now,demo:true});
  result.currentRulesDigest=rebuilt.configDigest;result.projectImportable=true;
 }catch(error){result.reason=String(error?.message??'INVALID_DRAFT').slice(0,200);}
 if(!/^[a-f0-9]{64}$/.test(result.recordedDigest??''))result.status='missing-digest';
 else if(!result.sourceHashMatches)result.status='digest-mismatch';
 else if(result.metadataHashMatches===false)result.status='metadata-mismatch';
 else if(input.rulesVersion!==RULES.version)result.status='unsupported-version';
 else if(typeof input.id!=='string'||input.id.length<1||input.id.length>180)result.status='invalid-project';
 else if(!result.projectImportable)result.status='invalid-project';
 else if(result.recordedDigest!==result.currentRulesDigest)result.status='unsupported-content';
 else result.status='consistent';
 return result;
}
