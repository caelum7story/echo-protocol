import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
async function using(fn){const work=path.resolve(root,'../../work/echo-launch-preview-20261113/release-completion-20261115-1450');await fs.mkdir(work,{recursive:true});const dir=await fs.mkdtemp(path.join(work,'cli-boundary-'));const config=path.join(dir,'runtime.json'),policy=path.join(dir,'policy.json'),db=path.join(dir,'must-not-create.sqlite');return fn({dir,config,policy,db});}
function run({config,policy,db},rpc){return spawnSync(process.execPath,['scripts/public-read-service.mjs','--config',config,'--policy',policy,'--db',db,'--start-block','1'],{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,ECHO_LAUNCH_RPC_URL:rpc}});}
test('unconfigured production cannot create a database or open a listener',()=>using(async f=>{
 await fs.writeFile(f.config,JSON.stringify({chainId:56,registry:{address:null,runtimeHash:null}}));await fs.writeFile(f.policy,JSON.stringify({chainId:56,registry:null}));
 const result=run(f,'https://bsc-dataseed.bnbchain.org');assert.notEqual(result.status,0);assert.match(result.stderr,/VERIFIED_PUBLIC_LAUNCH_BINDINGS_REQUIRED/);await assert.rejects(()=>fs.stat(f.db),{code:'ENOENT'});
}));
test('malformed or authenticated RPC input does not leak its text in startup diagnostics',()=>using(async f=>{
 const registry='0x1111111111111111111111111111111111111111';await fs.writeFile(f.config,JSON.stringify({chainId:56,registry:{address:registry,runtimeHash:'0x'+'11'.repeat(32)}}));await fs.writeFile(f.policy,JSON.stringify({chainId:56,registry}));
 for(const rpc of ['sensitive-test-marker-not-a-url','https://user:sensitive-test-marker@example.com']){const result=run(f,rpc);assert.notEqual(result.status,0);assert.match(result.stderr,/PUBLIC_HTTPS_RPC_REQUIRED/);assert.ok(!result.stderr.includes('sensitive-test-marker'));assert.ok(!result.stdout.includes('sensitive-test-marker'));await assert.rejects(()=>fs.stat(f.db),{code:'ENOENT'});}
}));
