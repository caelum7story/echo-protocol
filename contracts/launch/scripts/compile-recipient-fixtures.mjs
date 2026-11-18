import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
const root=path.resolve(import.meta.dirname,'..');
export function compileRecipientFixtures(){
 const file='test/adversarial-fixtures/Recipients.sol',source=fs.readFileSync(path.join(root,file),'utf8'),settings={optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[file]:{content:source}},settings})));const errors=(output.errors??[]).filter(x=>x.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));
 const result={compiler:solc.version(),settings,sourceSha256:createHash('sha256').update(source).digest('hex'),localOnly:true,warnings:(output.errors??[]).map(x=>x.formattedMessage),contracts:Object.fromEntries(Object.entries(output.contracts[file]).map(([name,c])=>[name,{abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object}]))};
 fs.writeFileSync(path.join(root,'evidence/recipient-adversarial-fixtures.json'),JSON.stringify(result,null,2)+'\n');return result;
}
