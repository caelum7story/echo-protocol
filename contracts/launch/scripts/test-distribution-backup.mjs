import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compile,root} from './compile.mjs';
const compiled=compile(),sha=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const files=['scripts/distribution-queue.mjs','scripts/distribution-service-policy.mjs','scripts/distribution-budget.mjs','scripts/distribution-backup.mjs','scripts/test-distribution-backup.mjs','test/distribution-backup.test.mjs','test/local-chain.mjs','package-lock.json',...fs.readdirSync(path.join(root,'lib')).filter(f=>f.endsWith('.mjs')).map(f=>'lib/'+f)],inputHashes=Object.fromEntries(files.map(file=>[file,sha(file)])),artifactHashes=Object.fromEntries(fs.readdirSync(path.join(root,'artifacts')).filter(f=>f.endsWith('.json')).map(f=>['artifacts/'+f,sha('artifacts/'+f)]));
const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','test/distribution-backup.test.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});const exitCode=await new Promise(resolve=>child.once('exit',resolve));
fs.writeFileSync(path.join(root,'evidence/distribution-backup-tests.tap'),output);const mismatches=Object.entries({...inputHashes,...artifactHashes}).filter(([file,digest])=>sha(file)!==digest).map(([file])=>file),walkthrough='evidence/distribution-backup-walkthrough.json';
const result={observedAt:new Date().toISOString(),exitCode,passed:Number(output.match(/# pass (\d+)/)?.[1]??0),failed:Number(output.match(/# fail (\d+)/)?.[1]??0),chainId:31337,sourceHashes:compiled.sourceHashes,inputHashes,artifactHashes,mismatches,currentInputsMatch:mismatches.length===0,tapSha256:sha('evidence/distribution-backup-tests.tap'),walkthroughSha256:fs.existsSync(path.join(root,walkthrough))?sha(walkthrough):null,publicTransactions:false,realWalletUsed:false,automaticResumeAllowed:false,automaticSignerConfigured:false,productionReady:false};fs.writeFileSync(path.join(root,'evidence/distribution-backup-result.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=exitCode===0&&mismatches.length===0?0:1;


