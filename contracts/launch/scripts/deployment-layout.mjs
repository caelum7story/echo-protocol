import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
import {getBytes,hexlify,toBeHex,zeroPadValue} from 'ethers';
const root=path.resolve(import.meta.dirname,'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['LaunchRegistry','NftLaunchFactory','TokenLaunchFactory'];let cached;
const fail=code=>{throw Error(code);};
export function assertDeploymentLayoutsCurrent(layouts){for(const [file,digest]of Object.entries(layouts.inputHashes)){const target=path.join(root,file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)fail('DEPLOY_LAYOUT_INPUT_CHANGED');}}
export function getDeploymentLayouts(){
 if(cached){assertDeploymentLayoutsCurrent(cached);return cached;}
 const sources={},inputHashes={};
 for(const folder of ['src','test/mocks'])for(const name of fs.readdirSync(path.join(root,folder)).filter(n=>n.endsWith('.sol'))){const file=folder+'/'+name,content=fs.readFileSync(path.join(root,file),'utf8');sources[file]={content};inputHashes[file]=hash(content);}
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'':['ast'],'*':['evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}),{import(file){
  const target=path.resolve(root,'node_modules',file);if(!target.startsWith(path.join(root,'node_modules')+path.sep))return {error:'Outside pinned dependencies'};
  try{const content=fs.readFileSync(target,'utf8');inputHashes['node_modules/'+file]=hash(content);return {contents:content};}catch{return {error:'Missing pinned source'};}
 }}));
 if(output.errors?.some(e=>e.severity==='error'))fail('DEPLOY_LAYOUT_COMPILE_FAILED');
 const variables=new Map();function walk(node){if(!node||typeof node!=='object')return;if(node.nodeType==='VariableDeclaration'&&node.mutability==='immutable')variables.set(String(node.id),node.name);for(const value of Object.values(node))if(value&&typeof value==='object')Array.isArray(value)?value.forEach(walk):walk(value);}
 for(const source of Object.values(output.sources))walk(source.ast);
 const layouts={},creationBytecodes={};
 for(const name of [...names,'NftLaunch','TokenLaunch']){const file='artifacts/'+name+'.json',bytes=fs.readFileSync(path.join(root,file)),artifact=JSON.parse(bytes),compiled=output.contracts[artifact.file]?.[name];
  if(!compiled||artifact.bytecode!=='0x'+compiled.evm.bytecode.object||artifact.deployedBytecode!=='0x'+compiled.evm.deployedBytecode.object)fail('DEPLOY_LAYOUT_ARTIFACT_MISMATCH');
  inputHashes[file]=hash(bytes);creationBytecodes[name]='0x'+compiled.evm.bytecode.object;if(!names.includes(name))continue;const size=getBytes(artifact.deployedBytecode).length,occupied=new Set();
  const fields=Object.entries(compiled.evm.deployedBytecode.immutableReferences).map(([astId,ranges])=>{const name=variables.get(astId);if(!name||!ranges.length)fail('DEPLOY_LAYOUT_UNKNOWN_IMMUTABLE');for(const range of ranges){if(range.length!==32||!Number.isSafeInteger(range.start)||range.start<0||range.start+32>size)fail('DEPLOY_LAYOUT_RANGE');for(let n=range.start;n<range.start+32;n++){if(occupied.has(n))fail('DEPLOY_LAYOUT_OVERLAP');occupied.add(n);}}return {name,astId,ranges};});
  layouts[name]={runtime:artifact.deployedBytecode,fields};
 }
 for(const file of ['package-lock.json','artifacts/TokenLaunch.json'])inputHashes[file]=hash(fs.readFileSync(path.join(root,file)));
 cached={compiler:solc.version(),inputHashes,layouts,creationBytecodes};assertDeploymentLayoutsCurrent(cached);return cached;
}
export function expectedDeploymentRuntime(name,immutables,layouts=getDeploymentLayouts()){
 const layout=layouts.layouts[name];if(!layout)fail('DEPLOY_LAYOUT_CONTRACT');const code=getBytes(layout.runtime);
 for(const field of layout.fields){if(!Object.hasOwn(immutables,field.name))fail('DEPLOY_LAYOUT_UNBOUND_IMMUTABLE');let value;
  try{const raw=immutables[field.name],hex=typeof raw==='number'||typeof raw==='bigint'?toBeHex(raw):raw;value=getBytes(zeroPadValue(hex,32));}catch{fail('DEPLOY_LAYOUT_VALUE');}
  for(const range of field.ranges)code.set(value,range.start);
 }
 return hexlify(code);
}
