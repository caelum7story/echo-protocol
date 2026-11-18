import fs from 'node:fs';import path from 'node:path';import solc from 'solc';import {createHash} from 'node:crypto';
export function compile({write=true,test=false}={}){
 const files=['Interfaces.sol','EmergencyControl.sol','EchoToken.sol','EchoOracle.sol','EchoLaunch.sol',...(test?['test/Mocks.sol']:[])];
 const sources=Object.fromEntries(files.map(n=>['contracts/'+n,{content:fs.readFileSync('contracts/'+n,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n')}]));
 const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',metadata:{bytecodeHash:'ipfs'},outputSelection:{'*':{'*':['abi','metadata','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const used={...sources};const output=JSON.parse(solc.compile(JSON.stringify(input),{import(p){try{const content=fs.readFileSync(path.join('node_modules',p),'utf8');used[p]={content};return{contents:content};}catch{return{error:'Missing import '+p};}}}));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifacts={};for(const [file,cs]of Object.entries(output.contracts))for(const [name,c]of Object.entries(cs)){const a={contractName:name,sourceName:file,abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtime:'0x'+c.evm.deployedBytecode.object,metadata:JSON.parse(c.metadata)};if(a.bytecode!=='0x')artifacts[name]=a;}
 if(write){fs.mkdirSync('artifacts',{recursive:true});for(const [n,a]of Object.entries(artifacts))fs.writeFileSync('artifacts/'+n+'.json',JSON.stringify(a,null,2)+'\n');
 const standard={...input,sources:used};fs.writeFileSync('artifacts/standard-input.json',JSON.stringify(standard,null,2)+'\n');
 const sizes=Object.fromEntries(Object.entries(artifacts).filter(([n])=>n.startsWith('Echo')).map(([n,a])=>[n,{initBytes:(a.bytecode.length-2)/2,runtimeBytes:(a.runtime.length-2)/2}]));
 for(const[n,s]of Object.entries(sizes)){if(s.runtimeBytes>24576||s.initBytes>49152)throw Error(n+' exceeds EVM code size limits');}
 const report={compiler:solc.version(),settings:input.settings,sizes,sourceSha256:createHash('sha256').update(JSON.stringify(standard)).digest('hex')};fs.writeFileSync('artifacts/build-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
 return artifacts;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/compile.mjs'))compile();
