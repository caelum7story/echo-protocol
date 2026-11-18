#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {buildNftContent,verifyNftCarFile,checkNftRetrieval} from '../lib/nft-content.mjs';

async function jsonFile(file){if(!file)throw Error('CONTENT_JSON_FILE_REQUIRED');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>16*1024*1024)throw Error('CONTENT_JSON_SIZE');return JSON.parse(await fs.readFile(file,'utf8'));}
try{
 const {values:v,positionals}=parseArgs({allowPositionals:true,strict:true,options:Object.fromEntries(['input','asset-root','out-dir','car','reference','gateways','max-bytes','max-records'].map(k=>[k,{type:'string'}]).concat([['local-test',{type:'boolean'}]]))});
 const [command]=positionals;if(positionals.length!==1)throw Error('CONTENT_COMMAND_REQUIRED');
 const options={};if(v['max-bytes'])options.maxBytes=Number(v['max-bytes']);if(v['max-records'])options.maxRecords=Number(v['max-records']);
 let result;
 if(command==='build'){
  if(!v['asset-root']||!v['out-dir'])throw Error('CONTENT_BUILD_PATHS_REQUIRED');
  const {car,manifest,...reference}=await buildNftContent(await jsonFile(v.input),{assetRoot:v['asset-root'],...options});
  const parent=await fs.realpath(path.dirname(path.resolve(v['out-dir']))),output=path.join(parent,path.basename(path.resolve(v['out-dir']))),temporary=path.join(parent,'.echo-content-'+randomUUID());
  if(!output.startsWith(parent+path.sep)||!temporary.startsWith(parent+path.sep))throw Error('CONTENT_OUTPUT_PATH');
  try{await fs.access(output);throw Error('CONTENT_OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(temporary);
  await Promise.all([fs.writeFile(path.join(temporary,'collection.car'),car,{flag:'wx'}),fs.writeFile(path.join(temporary,'reference.json'),JSON.stringify(reference,null,2)+'\n',{flag:'wx'}),fs.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})]);
  await fs.rename(temporary,output);result={...reference,status:'local-content-package-built',uploaded:false};
 }else if(command==='verify')result=await verifyNftCarFile(v.car,await jsonFile(v.reference),options);
 else if(command==='retrieve')result=await checkNftRetrieval(await jsonFile(v.reference),{...options,gateways:v.gateways?.split(','),mode:v['local-test']?'local-test':'public'});
 else throw Error('CONTENT_INVALID_COMMAND');
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'CONTENT_READ_OR_VERIFICATION_FAILED',uploaded:false,walletOperations:false}));process.exitCode=1;}
