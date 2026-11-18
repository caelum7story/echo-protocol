import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
const root=path.resolve(import.meta.dirname,'..'),destination=process.argv[2]?path.resolve(process.argv[2]):null,hash=b=>createHash('sha256').update(b).digest('hex');
if(!destination||process.argv.length!==3||fs.existsSync(destination))throw Error('Usage: node scripts/export-source-verification.mjs <new-directory>');
const sources={};
for(const folder of ['src','test/mocks'])for(const name of fs.readdirSync(path.join(root,folder)).filter(n=>n.endsWith('.sol'))){const file=folder+'/'+name;sources[file]={content:fs.readFileSync(path.join(root,file),'utf8')};}
// Resolve the import closure before compilation: the exported standard input is self-contained.
function closure(file){for(const m of sources[file].content.matchAll(/import\s+(?:[^;]*?from\s*)?["']([^"']+)["']/g)){const relative=m[1].startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])):m[1];if(Object.hasOwn(sources,relative))continue;const target=path.resolve(root,'node_modules',relative);if(!target.startsWith(path.join(root,'node_modules')+path.sep))throw Error('Import outside locked dependencies');sources[relative]={content:fs.readFileSync(target,'utf8')};closure(relative);}}
for(const file of Object.keys(sources))closure(file);
const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}},output=JSON.parse(solc.compile(JSON.stringify(input)));
if(output.errors?.some(e=>e.severity==='error'))throw Error('Verification input does not compile');
const contracts=[];
for(const [file,entries]of Object.entries(output.contracts).filter(([f])=>f.startsWith('src/')))for(const [name,c]of Object.entries(entries)){const a=JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json')));if(a.bytecode!=='0x'+c.evm.bytecode.object||a.deployedBytecode!=='0x'+c.evm.deployedBytecode.object)throw Error('Verification artifact mismatch: '+name);contracts.push({file,name,artifactSha256:hash(fs.readFileSync(path.join(root,'artifacts',name+'.json'))),creationBytecodeSha256:hash(c.evm.bytecode.object),runtimeBytecodeSha256:hash(c.evm.deployedBytecode.object)});}
fs.mkdirSync(destination,{recursive:true});
const bytes=JSON.stringify(input,null,2)+'\n';fs.writeFileSync(path.join(destination,'standard-input.json'),bytes,{flag:'wx'});
const manifest={schema:'echo-launch-source-verification-input/v1',observedAt:new Date().toISOString(),compiler:solc.version(),standardInputSha256:hash(bytes),selfContained:true,contracts,artifactsMatched:true,sourceHashes:Object.fromEntries(Object.entries(sources).map(([f,s])=>[f,hash(s.content)])),lockfileSha256:hash(fs.readFileSync(path.join(root,'package-lock.json'))),publicVerificationCompleted:false,constructorArgumentsNeedActualDeploymentRecord:true,limitations:'Exact local compiler-input verification only. Add actual deployed address and ABI-encoded constructor arguments after confirmed receipts;do not claim explorer/Sourcify verification until independently observed.'};
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({selfContained:true,artifactsMatched:true,contracts:contracts.length,standardInputSha256:manifest.standardInputSha256,publicVerificationCompleted:false}));
