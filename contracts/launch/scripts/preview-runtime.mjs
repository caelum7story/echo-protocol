import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {keccak256} from 'ethers';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';
import {createRuntimeReadServer} from '../lib/runtime-read-server.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.resolve(root,'../../work/echo-launch-preview-20261113/runtime-read-20261114');
const {values:v}=parseArgs({options:{port:{type:'string',default:'4217'}}}),port=Number(v.port);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_LOCAL_PORT');
fs.mkdirSync(work,{recursive:true});const directory=fs.mkdtempSync(path.join(work,'run-'));let rehearsal,service;
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),artifactHashes=Object.fromEntries(fs.readdirSync(path.join(root,'artifacts')).filter(f=>f.endsWith('.json')).map(f=>['artifacts/'+f,hash('artifacts/'+f)]));
const startedAt=new Date().toISOString();
try{
 rehearsal=await createLocalRuntimeRehearsal({directory,lifecycle:true,pagination:true});
 for(const [f,d]of Object.entries(artifactHashes))if(hash(f)!==d)throw Error('PREVIEW_ARTIFACTS_CHANGED_DURING_STARTUP');
 for(const [kind,name]of [[1,'NftLaunch'],[2,'TokenLaunch']]){const a=JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));if(rehearsal.config.approvedTemplates.find(x=>x.kind===kind)?.creationCodeHash!==keccak256(a.bytecode))throw Error('PREVIEW_CREATION_CODE_MISMATCH');}
 const build={startedAt,artifactHashes,templateCreationCodeHashesVerified:true};
 fs.writeFileSync(path.join(directory,'build-provenance.json'),JSON.stringify(build,null,2)+'\n');
 service=await createRuntimeReadServer({index:rehearsal.index,staticRoot:path.resolve(root,'../../frontend/dist'),port,
  rehearsalInfo:{sampleWallet:rehearsal.sampleWallet,cases:rehearsal.cases}});
 fs.writeFileSync(path.join(directory,'preview.json'),JSON.stringify({pid:process.pid,url:service.url+'/launch/#/runtime',chainId:31337,localOnly:true,publicDeployment:false,...build},null,2)+'\n');
 console.log('Local: '+service.url+'/launch/#/runtime');console.log('Only an isolated EVM31337 rehearsal is seeded. API is read-only; no real wallet or public-chain transaction.');
 fs.writeFileSync(path.join(work,'active-preview.json'),JSON.stringify({pid:process.pid,url:service.url+'/launch/#/runtime',directory,chainId:31337,localOnly:true,status:'running',...build},null,2)+'\n');
 let closing=false;const close=async()=>{if(closing)return;closing=true;await service.close();await rehearsal.close();};
 process.on('SIGINT',close);process.on('SIGTERM',close);
}catch(error){await service?.close();await rehearsal?.close();console.error(/^[A-Z][A-Z_]+$/.test(error.message)?error.message:'LOCAL_PREVIEW_FAILED');process.exitCode=1;}
