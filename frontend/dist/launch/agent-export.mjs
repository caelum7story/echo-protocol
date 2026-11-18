import {manifestFileName} from './core.mjs';
import {normalizeDraft,normalizeIdentity,validateDraft,makeManifest,stringify,digest} from './core.mjs';
import {verifySealedRecord,sealCheckCurrent,inspectManifestFile} from './integrity.mjs';
import {reviewSession,positionEvidence} from './delivery.mjs';

function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export function captureAgentExport({projectId,raw,record=null,session=null,identity=null,now=Date.now()}){
 if(typeof projectId!=='string'||!projectId||projectId.length>180||!Number.isFinite(now)||!Number.isFinite(new Date(now).getTime()))throw Error('EXPORT_CONTEXT');
 const snapshot=structuredClone({projectId,raw:normalizeDraft(raw),record,session,identity:identity===null?null:normalizeIdentity(identity),now});
 if(session){if(snapshot.identity===null)throw Error('EXPORT_CONTEXT');reviewSession(snapshot.raw,snapshot.session,{now});}
 if(record&&(record.id!==projectId||stringify(normalizeDraft(record.raw))!==stringify(snapshot.raw)))throw Error('EXPORT_CONTEXT');
 return freeze(snapshot);
}
export async function buildAgentExport(snapshot,{allowIncomplete=false}={}){
 const {projectId,raw,record,session,identity,now}=snapshot;
 if(record?.sealed&&!sealCheckCurrent(record,await verifySealedRecord(record,{now})))throw Error('SEAL_UNVERIFIED');
 const fields=validateDraft(raw,{creating:false,demo:true,now});
 if(Object.keys(fields).length){
  if(!allowIncomplete){const error=Error('MANIFEST_INCOMPLETE');error.fields=fields;error.draftId=projectId;throw error;}
  return freeze({projectId,capturedAt:new Date(now).toISOString(),manifest:null,position:null,
   draft:{schema:'echo-launch-draft/v2',executionReady:false,project:structuredClone(raw)}});
 }
 const manifest=await makeManifest(raw,{id:projectId,demo:true,now});
 const position=session?positionEvidence(raw,session,identity,{projectId,configDigest:manifest.configDigest,now}):null;
 const capturedAt=new Date(now).toISOString(),context={schema:'echo-launch-read-snapshot/v1',capturedAt,
  scope:'browser-local-only',projectId,projectConfigDigest:manifest.configDigest,identity,
  scenario:session?.scenario??null,phase:position?.phase??null,chainVerified:false,executionReady:false};
 if(position)position.fullManifestFile=manifestFileName(raw.symbol);
 context.snapshotDigest=await digest({context,position});
 if(position)position.readSnapshot=context;
 return freeze({projectId,capturedAt,context,manifest,position,draft:null});
}
export async function checkPositionSnapshot(evidence,manifest){
 const context=evidence?.readSnapshot;if(!context||context.schema!=='echo-launch-read-snapshot/v1')throw Error('EXPORT_CONTEXT');
 if((await inspectManifestFile(stringify(manifest))).status!=='consistent')throw Error('EXPORT_DIGEST');
 if(context.projectId!==evidence.projectId||manifest?.id!==evidence.projectId||context.projectConfigDigest!==evidence.projectConfigDigest||manifest.configDigest!==evidence.projectConfigDigest||context.identity!==evidence.identity||context.capturedAt!==evidence.createdAt||context.phase!==evidence.phase||context.scenario!==evidence.scenario)throw Error('EXPORT_CONTEXT');
 if(context.scope!=='browser-local-only'||context.executionReady!==false||context.chainVerified!==false||evidence.chainId!==56||evidence.executionReady!==false||evidence.chainVerified!==false||evidence.transactionHash!==null||evidence.unsignedTransaction!==null)throw Error('REVIEW_AUTHORITY');
 const copy={...evidence};delete copy.readSnapshot;const original={...context};delete original.snapshotDigest;
 if(await digest({context:original,position:copy})!==context.snapshotDigest)throw Error('EXPORT_DIGEST');
 return {status:'local-snapshot-consistent',chainVerified:false,executionReady:false,signatureVerified:false};
}
