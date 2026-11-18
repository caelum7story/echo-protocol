import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root} from './compile.mjs';
const files=['lib/nft-content.mjs','agent/echo-nft-content.mjs','test/nft-content.test.mjs','scripts/test-nft-content.mjs','package.json','package-lock.json'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),inputHashes=Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const child=spawn(process.execPath,['--test','--test-reporter=tap','test/nft-content.test.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});
const exitCode=await new Promise(resolve=>child.on('exit',resolve)),result={at:new Date().toISOString(),exitCode,passed:Number(output.match(/# pass (\d+)/)?.[1]||0),failed:Number(output.match(/# fail (\d+)/)?.[1]||0),
 inputHashes,node:process.version,uploaded:false,publicPinning:false,independentAudit:false};
fs.writeFileSync(path.join(root,'evidence/nft-content-tests.tap'),output);fs.writeFileSync(path.join(root,'evidence/nft-content-result.json'),JSON.stringify(result,null,2)+'\n');process.exitCode=exitCode===0?0:1;
