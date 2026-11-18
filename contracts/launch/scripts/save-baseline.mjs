import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './compile.mjs';
const target=path.join(root,'evidence/baseline-solc0824-ganache');
if(fs.existsSync(path.join(target,'manifest.json')))throw Error('Baseline already saved; do not overwrite');
const files=['package.json','package-lock.json','scripts/compile.mjs','scripts/test.mjs','test/contracts.test.mjs','test/mocks/Fixtures.sol','evidence/local-chain-tests.tap','evidence/local-chain-result.json','evidence/dependency-audit.json','artifacts/compile-report.json',...fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.sol')).map(f=>'src/'+f)];
const hashes={};
for(const relative of files){const source=path.join(root,relative),output=path.join(target,relative);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(source,output);hashes[relative]=createHash('sha256').update(fs.readFileSync(source)).digest('hex');}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({at:new Date().toISOString(),purpose:'Historical local baseline before removing vulnerable test tooling and upgrading the compiler; not production approval',hashes},null,2)+'\n');
console.log('Preserved19/19 local bytecode test baseline.');
