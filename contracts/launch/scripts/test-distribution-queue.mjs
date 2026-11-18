import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compile,root} from './compile.mjs';
const compiled=compile(),sha=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const files=['scripts/distribution-queue.mjs','scripts/distribution-service-policy.mjs','scripts/distribution-budget.mjs','scripts/distribution-worker.mjs','scripts/distribution-monitor.mjs','scripts/test-distribution-queue.mjs','test/distribution-queue.test.mjs','test/local-chain.mjs','package-lock.json',...fs.readdirSync(path.join(root,'lib')).filter(f=>f.endsWith('.mjs')).map(f=>'lib/'+f)];
const inputHashes=Object.fromEntries(files.map(f=>[f,sha(f)])),artifactHashes=Object.fromEntries(fs.readdirSync(path.join(root,'artifacts')).filter(f=>f.endsWith('.json')).map(f=>['artifacts/'+f,sha('artifacts/'+f)]));
const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','test/distribution-queue.test.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});let output='';for(const pipe of [child.stdout,child.stderr])pipe.on('data',d=>{output+=d;process.stdout.write(d);});
const exitCode=await new Promise(resolve=>child.on('exit',resolve));fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/distribution-queue-tests.tap'),output);
const mismatches=Object.entries({...inputHashes,...artifactHashes}).filter(([f,h])=>sha(f)!==h).map(([f])=>f),walkthrough='evidence/distribution-queue-walkthrough.json';
fs.writeFileSync(path.join(root,'evidence/distribution-queue-result.json'),JSON.stringify({observedAt:new Date().toISOString(),exitCode,passed:Number(output.match(/# pass (\d+)/)?.[1]??0),failed:Number(output.match(/# fail (\d+)/)?.[1]??0),chainId:31337,sourceHashes:compiled.sourceHashes,inputHashes,artifactHashes,mismatches,currentInputsMatch:mismatches.length===0,walkthroughSha256:fs.existsSync(path.join(root,walkthrough))?sha(walkthrough):null,tapSha256:sha('evidence/distribution-queue-tests.tap'),publicTransactions:false,realWalletUsed:false,automaticSignerConfigured:false,independentSecurityReview:false,productionReady:false},null,2)+'\n');process.exitCode=exitCode===0&&mismatches.length===0?0:1;


