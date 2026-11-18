export const MIB=1024*1024;
export const MAX_METADATA_UPLOAD_BYTES=2*MIB;
export const MAX_METADATA_BYTES=8*MIB;
export const MAX_MANIFEST_BYTES=12*MIB;
export const MAX_SEAL_SNAPSHOT_BYTES=24*MIB;
export const MAX_BACKUP_BYTES=16*MIB;
export const SINGLE_RECOVERY_LIMITS=Object.freeze({bytes:MAX_BACKUP_BYTES,drafts:500,events:5000,costs:504});
export const MULTIPART_RECOVERY_LIMITS=Object.freeze({bytes:64*MIB,drafts:4096,events:50000,costs:4096});
export const utf8Bytes=text=>new TextEncoder().encode(text).length;
export function checkTextBudget(text,limit,code){if(typeof text!=='string'||utf8Bytes(text)>limit)throw Error(code);return text;}
export const compactJsonText=text=>JSON.stringify(JSON.parse(text));
export function manifestBudget(manifest){
 const text=JSON.stringify(manifest),bytes=utf8Bytes(text),metadataBytes=manifest?.metadata?utf8Bytes(JSON.stringify(manifest.metadata)):0;
 return {bytes,metadataBytes,limitBytes:MAX_MANIFEST_BYTES,metadataLimitBytes:MAX_METADATA_BYTES,
  supported:bytes<=MAX_MANIFEST_BYTES&&metadataBytes<=MAX_METADATA_BYTES,executionReady:false};
}
export function backupBudget(backup){
 const text=JSON.stringify(backup),bytes=utf8Bytes(text),d=backup?.data??{};
 const counts={drafts:d.drafts?.length??0,events:d.events?.length??0,operatingPlans:Object.keys(d.operatingPlans??{}).length};
 return {bytes,limitBytes:MAX_BACKUP_BYTES,counts,sizeSupported:bytes<=MAX_BACKUP_BYTES,
  countsSupported:counts.drafts<=500&&counts.events<=5000&&counts.operatingPlans<=504,
  automaticRestoreSupported:bytes<=MAX_BACKUP_BYTES&&counts.drafts<=500&&counts.events<=5000&&counts.operatingPlans<=504};
}
export function byteLabel(bytes){return bytes>=MIB?(bytes/MIB).toFixed(2)+' MiB':bytes>=1024?(bytes/1024).toFixed(1)+' KiB':bytes+' B';}
