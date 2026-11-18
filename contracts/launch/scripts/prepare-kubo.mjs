import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {root} from './compile.mjs';
const run=promisify(execFile),hash=(bytes,type='sha256')=>createHash(type).update(bytes).digest('hex');
const reference=JSON.parse(await fs.readFile(path.join(root,'references/kubo-release.json'),'utf8'));
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This pinned tool reference is Windows x64 only');
const directory=path.join(root,'tools','kubo-'+reference.version),archive=path.join(directory,'release.zip'),unpacked=path.join(directory,'unpacked'),executable=path.join(unpacked,'kubo','ipfs.exe');
await fs.mkdir(directory,{recursive:true});
const headers={'User-Agent':'ECHO-local-offline-compatibility-preparation'};
const api=await fetch(reference.releaseApi,{headers,signal:AbortSignal.timeout(20000)});if(!api.ok)throw Error('Official release metadata unavailable');
const release=await api.json(),asset=release.assets.find(a=>a.browser_download_url===reference.archiveUrl);
if(release.tag_name!==reference.version||!asset||asset.size!==reference.archiveBytes||asset.digest!=='sha256:'+reference.archiveSha256)throw Error('Pinned official release mismatch');
let archiveData;
try{archiveData=await fs.readFile(archive);}catch(error){if(error.code!=='ENOENT')throw error;}
if(!archiveData){
 const response=await fetch(reference.archiveUrl,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Official archive download failed');
 const parts=[];let length=0;for await(const bytes of response.body){length+=bytes.length;if(length>reference.archiveBytes)throw Error('Archive size exceeded');parts.push(Buffer.from(bytes));}
 archiveData=Buffer.concat(parts);if(length!==reference.archiveBytes||hash(archiveData)!==reference.archiveSha256)throw Error('Archive digest mismatch');
 const partial=path.join(directory,'release-'+randomUUID()+'.partial');await fs.writeFile(partial,archiveData,{flag:'wx'});await fs.rename(partial,archive);
}
if(archiveData.length!==reference.archiveBytes||hash(archiveData)!==reference.archiveSha256)throw Error('Stored archive digest mismatch');
const checksumResponse=await fetch(reference.checksumUrl,{signal:AbortSignal.timeout(20000)});if(!checksumResponse.ok)throw Error('Official SHA512 unavailable');
const checksum=(await checksumResponse.text()).trim().split(/\s+/)[0].toLowerCase();if(!/^[a-f0-9]{128}$/.test(checksum)||hash(archiveData,'sha512')!==checksum)throw Error('Archive SHA512 mismatch');
const existingProof=path.join(directory,'verified-tool.json');
let prior;try{prior=JSON.parse(await fs.readFile(existingProof,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(prior){if(hash(await fs.readFile(executable))!==prior.executableSha256||prior.archiveSha256!==reference.archiveSha256)throw Error('Existing executable changed');}
else{
 const listing=(await run('tar.exe',['-tf',archive],{windowsHide:true,timeout:20000,maxBuffer:1024*1024})).stdout.trim().split(/\r?\n/);
 if(!listing.includes('kubo/ipfs.exe')||listing.some(entry=>/^[\\/]|^[A-Za-z]:/.test(entry)||entry.split(/[\\/]/).includes('..')||!entry.startsWith('kubo/')))throw Error('Unsafe archive entry');
 try{await fs.mkdir(unpacked);}catch(error){if(error.code==='EEXIST')throw Error('Unverified extraction exists; inspect it before reuse');throw error;}
 await run('tar.exe',['-xf',archive,'-C',unpacked],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
}
const version=(await run(executable,['version','--number'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024})).stdout.trim();
if(version!==reference.version.slice(1))throw Error('Executable version mismatch');
const result={at:new Date().toISOString(),version,executable:path.relative(root,executable),executableSha256:hash(await fs.readFile(executable)),archiveSha256:reference.archiveSha256,archiveSha512:checksum,
 source:reference.releaseUrl,officialReleaseMetadataMatched:true,archiveChecksumsVerified:true,globalInstallation:false,networkPublication:false};
await fs.writeFile(existingProof,JSON.stringify(result,null,2)+'\n');await fs.writeFile(path.join(root,'evidence/kubo-tool-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
