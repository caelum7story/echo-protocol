import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const lockfileSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex');
const npmCli=process.env.npm_execpath;
if(!npmCli||!fs.existsSync(npmCli))throw Error('Run npm run audit:deps so the installed npm CLI path is supplied.');
const child=spawn(process.execPath,[npmCli,'audit','--json','--registry=https://registry.npmjs.org','--fetch-retries=0','--fetch-timeout=12000'],{cwd:root,stdio:['ignore','pipe','pipe']});
let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
const exitCode=await new Promise(resolve=>child.on('exit',resolve));
let parsed;try{parsed=JSON.parse(output);}catch{parsed={error:'Audit JSON unavailable',stderr:errors,output};}
const unchangedLockfile=lockfileSha256===createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex');
const result={observedAt:new Date().toISOString(),exitCode,lockfileSha256,unchangedLockfile,...parsed};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/dependency-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({exitCode,vulnerabilities:parsed.metadata?.vulnerabilities,error:parsed.error},null,2));
process.exitCode=exitCode===0&&unchangedLockfile?0:1;
