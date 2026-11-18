import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){
 const target=fs.mkdtempSync(path.join(root,'evidence/release-config-test-'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'release/confirmed-config-manifest.json'),'utf8'));
 for(const file of [...Object.keys(manifest.files),'release/confirmed-config-manifest.json']){const out=path.join(target,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,file),out);}
 t.after(()=>{const actual=fs.realpathSync(target),boundary=fs.realpathSync(path.join(root,'evidence'));if(!actual.startsWith(boundary+path.sep)||!path.basename(actual).startsWith('release-config-test-'))throw Error('Unsafe test cleanup');fs.rmSync(actual,{recursive:true});});
 return target;
}
function edit(target,file,fn,{reseal=true}={}){
 const loc=path.join(target,file),value=JSON.parse(fs.readFileSync(loc,'utf8'));fn(value);fs.writeFileSync(loc,JSON.stringify(value));
 if(reseal){const name=path.join(target,'release/confirmed-config-manifest.json'),m=JSON.parse(fs.readFileSync(name,'utf8'));m.files[file]=hash(fs.readFileSync(loc));fs.writeFileSync(name,JSON.stringify(m));}
}
test('confirmed configuration verifies source pins without granting execution',()=>{const r=inspectReleaseConfiguration(root);assert.equal(r.configurationConfirmed,true);assert.equal(r.financialAuthorization,false);assert.equal(r.productionReady,false);assert.equal(r.executionReady,false);assert.ok(r.filesVerified>=30);});
test('changed administrator is rejected even after local manifest resealing',t=>{const f=fixture(t);edit(f,'release/deployment-spec.confirmed.json',x=>x.environment.platformAdmin='0x0000000000000000000000000000000000000001');assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_ADMIN_CHANGED/);});
test('changed revenue recipient is rejected independently of administrator',t=>{const f=fixture(t);edit(f,'release/deployment-spec.confirmed.json',x=>x.environment.platformRecipient='0x0000000000000000000000000000000000000001');assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_RECIPIENT_CHANGED/);});
test('unconfirmed oracle or read policy cannot be silently substituted',t=>{const f=fixture(t);edit(f,'release/deployment-spec.confirmed.json',x=>x.environment.oracleMaxAge=900);assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_ORACLE_CHANGED/);const f2=fixture(t);edit(f2,'runtime-config.json',x=>x.minConfirmations=1);assert.throws(()=>inspectReleaseConfiguration(f2),/RELEASE_READ_POLICY/);});
test('real chain mismatch and unconfirmed decision fail closed',t=>{const f=fixture(t);edit(f,'release/runtime-policy.confirmed.json',x=>x.chainId=97);assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_CHAIN/);const f2=fixture(t);edit(f2,'rules/deployment-decisions-20261115.json',x=>x.confirmedByUser=false);assert.throws(()=>inspectReleaseConfiguration(f2),/RELEASE_DECISION_REQUIRED/);});
test('missing and changed immutable inputs cannot pass release configuration',t=>{const f=fixture(t);const loc=path.join(f,'src/LaunchEscrow.sol');fs.appendFileSync(loc,'\n//changed');assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_INPUT_CHANGED/);const f2=fixture(t);edit(f2,'release/confirmed-config-manifest.json',m=>delete m.files['src/LaunchEscrow.sol'],{reseal:false});assert.throws(()=>inspectReleaseConfiguration(f2),/RELEASE_PIN_MISSING/);});
test('configuration consent never opens signing or invents live bindings',t=>{const f=fixture(t);edit(f,'rules/deployment-decisions-20261115.json',x=>x.executionScope.paidTransactions=true);assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_EXECUTION_NOT_AUTHORIZED/);const f2=fixture(t);edit(f2,'runtime-config.json',x=>x.executionReady=true);assert.throws(()=>inspectReleaseConfiguration(f2),/RELEASE_LIVE_BINDINGS_NOT_READY/);});
test('Gas wallet substitution and mismatched decision references cannot pass resealed pins',t=>{const f=fixture(t);edit(f,'rules/deployment-decisions-20261115.json',x=>x.roles.gasWallet='0x0000000000000000000000000000000000000001');assert.throws(()=>inspectReleaseConfiguration(f),/RELEASE_GAS_WALLET_CHANGED/);const f2=fixture(t);edit(f2,'release/deployment-spec.confirmed.json',x=>x.configurationDecisionSha256='0'.repeat(64));assert.throws(()=>inspectReleaseConfiguration(f2),/RELEASE_DECISION_REFERENCE/);});
