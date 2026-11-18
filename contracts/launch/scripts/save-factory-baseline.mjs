import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),target=path.join(root,'evidence/baseline-solc0838-factory25');
if(fs.existsSync(path.join(target,'manifest.json')))throw Error('Baseline already exists');
const files=['package.json','package-lock.json','test/contracts.test.mjs','test/local-chain.mjs','test/mocks/Fixtures.sol','evidence/local-chain-result.json','evidence/local-chain-tests.tap','evidence/dependency-audit.json',...fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.sol')).map(f=>'src/'+f)];
const hashes={};for(const f of files){const data=fs.readFileSync(path.join(root,f));fs.mkdirSync(path.dirname(path.join(target,f)),{recursive:true});fs.writeFileSync(path.join(target,f),data);hashes[f]=createHash('sha256').update(data).digest('hex');}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({at:new Date().toISOString(),purpose:'25 passing local tests before Agent deadline/API integration',hashes},null,2)+'\n');
console.log('Saved25-case local factory baseline.');
