import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function compile() {
  const sources = {};
  const sourceHashes = {};
  const hash=content=>createHash('sha256').update(content).digest('hex');
  for (const folder of ['src', 'test/mocks']) {
    if (!fs.existsSync(path.join(root, folder))) continue;
    for (const file of fs.readdirSync(path.join(root, folder)).filter(f => f.endsWith('.sol'))) {
      sources[`${folder}/${file}`] = {content: fs.readFileSync(path.join(root, folder, file), 'utf8')};
      sourceHashes[`${folder}/${file}`]=hash(sources[`${folder}/${file}`].content);
    }
  }
  const input = {language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
  const output = JSON.parse(solc.compile(JSON.stringify(input), {import(file) {
    const resolved = path.resolve(root, 'node_modules', file);
    if (!resolved.startsWith(path.join(root, 'node_modules') + path.sep)) return {error:'Import outside dependency root'};
    try {const contents=fs.readFileSync(resolved,'utf8');sourceHashes[file]=hash(contents);return {contents};} catch {return {error:`Missing import ${file}`};}
  }}));
  const errors = (output.errors || []).filter(e=>e.severity==='error');
  if (errors.length) throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  const result = {compiler:solc.version(),settings:input.settings,sourceHashes,lockfileSha256:hash(fs.readFileSync(path.join(root,'package-lock.json'))),contracts:{},warnings:(output.errors||[]).map(e=>e.formattedMessage)};
  for (const [file, entries] of Object.entries(output.contracts)) {
    if (!file.startsWith('src/') && !file.startsWith('test/')) continue;
    for (const [name,c] of Object.entries(entries)) {
      const artifact = {file,name,abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object};
      fs.writeFileSync(path.join(root,'artifacts',name+'.json'),JSON.stringify(artifact,null,2)+'\n');
      result.contracts[name] = {runtimeBytes:c.evm.deployedBytecode.object.length/2,initcodeBytes:c.evm.bytecode.object.length/2};
      if (result.contracts[name].runtimeBytes > 24576) throw new Error(`${name}: EIP170 size exceeded`);
      if (result.contracts[name].initcodeBytes > 49152) throw new Error(`${name}: EIP3860 size exceeded`);
    }
  }
  fs.writeFileSync(path.join(root,'artifacts','compile-report.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(compile(),null,2));
