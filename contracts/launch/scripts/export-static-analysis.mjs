import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
const root=path.resolve(import.meta.dirname,'..'),destination=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(destination))throw Error('Use a new analysis directory');
const hash=b=>createHash('sha256').update(b).digest('hex'),sources={},inputHashes={};
for(const folder of ['src','test/mocks'])for(const name of fs.readdirSync(path.join(root,folder)).filter(n=>n.endsWith('.sol'))){const file=folder+'/'+name,content=fs.readFileSync(path.join(root,file),'utf8');sources[file]={content};inputHashes[file]=hash(content);}
const settings={optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'':['ast'],'*':['abi','evm.bytecode','evm.deployedBytecode','userdoc','devdoc']}}};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings}),{import(file){const target=path.resolve(root,'node_modules',file);if(!target.startsWith(path.join(root,'node_modules')+path.sep))return {error:'Outside locked dependencies'};const content=fs.readFileSync(target,'utf8');inputHashes['node_modules/'+file]=hash(content);return {contents:content};}}));
if(output.errors?.some(e=>e.severity==='error'))throw Error('Compilation failed');
const source_units={},filenames=[];let productionContracts=0;
for(const [file,info]of Object.entries(output.sources)){
 const local=file.startsWith('src/')||file.startsWith('test/'),relative=local?file:'node_modules/'+file,absolute=path.join(root,relative).split(path.sep).join('/'),filename={absolute,relative,short:file,used:file};filenames.push(filename);
 const contracts={};for(const [name,c]of Object.entries(output.contracts[file]??{})){
  if(file.startsWith('src/')){const artifactFile='artifacts/'+name+'.json';if(fs.existsSync(path.join(root,artifactFile))){const a=JSON.parse(fs.readFileSync(path.join(root,artifactFile)));if(a.bytecode!=='0x'+c.evm.bytecode.object||a.deployedBytecode!=='0x'+c.evm.deployedBytecode.object)throw Error('Artifact mismatch: '+name);inputHashes[artifactFile]=hash(fs.readFileSync(path.join(root,artifactFile)));productionContracts++;}}
  contracts[name]={abi:c.abi,bin:c.evm.bytecode.object,'bin-runtime':c.evm.deployedBytecode.object,srcmap:c.evm.bytecode.sourceMap,'srcmap-runtime':c.evm.deployedBytecode.sourceMap,filenames:filename,libraries:{},is_dependency:!local,userdoc:c.userdoc??{},devdoc:c.devdoc??{}};
 }
 source_units[file]={ast:info.ast,contracts};
}
inputHashes['package-lock.json']=hash(fs.readFileSync(path.join(root,'package-lock.json')));
const exported={compilation_units:{candidate:{compiler:{compiler:'solc',version:'0.8.38',optimized:true},source_units,filenames}},package:null,working_dir:root,type:1,unit_tests:[],crytic_version:'0.0.2'};
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'candidate_export.json'),JSON.stringify(exported));
fs.writeFileSync(path.join(destination,'provenance.json'),JSON.stringify({observedAt:new Date().toISOString(),compiler:solc.version(),settings,inputHashes,productionContracts,artifactsMatched:true,exportSha256:hash(JSON.stringify(exported)),independentAudit:false},null,2)+'\n');
console.log(JSON.stringify({directory:destination,productionContracts,artifactsMatched:true}));
