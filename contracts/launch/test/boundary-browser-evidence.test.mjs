import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectBoundaryBrowserEvidence} from '../scripts/boundary-browser-evidence.mjs';
const root=path.resolve(import.meta.dirname,'..'),workspace=path.resolve(root,'../..'),base='work/echo-launch-preview-20261113/boundary-browser-20261115/',sha=b=>createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(path.join(workspace,f)),json=f=>JSON.parse(read(f));
function inspect(overrides={}){const data=new Map(Object.entries(overrides).map(([f,v])=>[path.resolve(workspace,f),Buffer.from(typeof v==='string'?v:JSON.stringify(v))]));return inspectBoundaryBrowserEvidence(root,{readFile:f=>data.get(f)??fs.readFileSync(f)});}
test('current16boundary/wallet browser proofs remain local and source-current',()=>{const r=inspect();assert.equal(r.locallyVerified,true,JSON.stringify(r));assert.equal(r.browserObservations,21);assert.equal(r.productionReady,false);assert.equal(r.independentReview,false);});
test('changed screenshot or runtime source cannot retain verified browser evidence',()=>{for(const file of [base+'mobile-exit-cutoff.png','outputs/echo-mint-preview-20261105/dist/launch/runtime-read.mjs'])assert.equal(inspect({[file]:'changed'}).locallyVerified,false);});
test('elevated scope and evidence paths outside the fixed run are rejected',()=>{for(const change of [q=>q.chainId=56,q=>q.productionReady=true,q=>q.sourceRun='../outside',q=>q.independentReview=true]){const q=json(base+'browser-qa.json');change(q);assert.equal(inspect({[base+'browser-qa.json']:q}).locallyVerified,false);}});
test('resealed browser text must still agree with the independent API block and actual payment status',()=>{for(const change of [o=>o.find(x=>x.label==='mobile-exact-exit-cutoff').reader='wrong block',o=>o.find(x=>x.label==='mobile-nft-refund-credit').participant='退款记账款已核验付清',o=>o.find(x=>x.label==='desktop-invalid-wallet-hides-old-results').oldProofVisible=true]){const q=json(base+'browser-qa.json'),o=json(base+'browser-observations-final.json');change(o);const text=JSON.stringify(o);q.artifactHashes['browser-observations-final.json']=sha(text);assert.equal(inspect({[base+'browser-qa.json']:q,[base+'browser-observations-final.json']:text}).locallyVerified,false);}});
