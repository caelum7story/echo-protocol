import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root} from './compile.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const inputFiles=['test/official-dex-runtime.test.mjs','test/local-chain.mjs','references/pancake-v2/deployed-runtime.json','evidence/baseline-agent41/TokenLaunch.json','scripts/test-official-dex.mjs'];
const compiled=JSON.parse(fs.readFileSync(path.join(root,'artifacts/compile-report.json'),'utf8'));
for(const [file,digest] of Object.entries(compiled.sourceHashes)){
 const resolved=path.join(root,file.startsWith('@')?'node_modules':'',file);
 if(hash(fs.readFileSync(resolved))!==digest)throw Error('Compile current source before official runtime test: '+file);
}
const inputHashes=Object.fromEntries(inputFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','test/official-dex-runtime.test.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});
const exitCode=await new Promise(resolve=>child.on('exit',resolve));
const result={at:new Date().toISOString(),exitCode,passed:Number(output.match(/# pass (\d+)/)?.[1]||0),failed:Number(output.match(/# fail (\d+)/)?.[1]||0),
 sourceHashes:compiled.sourceHashes,inputHashes,lockfileSha256:hash(fs.readFileSync(path.join(root,'package-lock.json'))),chainId:31337,
 environment:'Exact mainnet deployed V2 runtime on fresh isolated local storage; not a historical-state mainnet fork',remoteWrites:false,realWalletUsed:false,audit:false};
fs.writeFileSync(path.join(root,'evidence/official-dex-runtime-tests.tap'),output);
fs.writeFileSync(path.join(root,'evidence/official-dex-runtime-result.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=exitCode===0?0:1;
