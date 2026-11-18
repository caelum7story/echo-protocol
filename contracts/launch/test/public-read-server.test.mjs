import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createPublicReadServer} from '../lib/public-read-server.mjs';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';

const registry='0x1111111111111111111111111111111111111111';
function policy(changes={}) {return {schema:'echo-launch-public-read-policy/v1',chainId:56,registry,hosts:['echobsc.fun'],origins:['https://echobsc.fun'],maxConcurrent:2,requestsPerMinute:600,requestDeadlineMs:1000,maxResponseBytes:1048576,maxBlockAgeSeconds:120,...changes};}
function fixture() {let syncs=0;const status={chainId:56,registry,confirmationsRequired:12,health:'healthy',head:{number:100,timestamp:Math.floor(Date.now()/1000)}};return {status:()=>({...status}),sync:async()=>{syncs++;},projects:()=>({projects:[],status}),events:()=>({events:[]}),syncs:()=>syncs,raw:status};}
function request(url,options={}) {return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method??'GET',headers:{Host:'echobsc.fun',...options.headers}},res=>{let body='';res.setEncoding('utf8');res.on('data',s=>body+=s);res.on('end',()=>resolve({status:res.statusCode,headers:{get:k=>res.headers[k.toLowerCase()]??null},text:async()=>body,json:async()=>JSON.parse(body)}));});req.on('error',reject);req.end();});}
async function using(fn,{index=fixture(),changes={}}={}) {const service=await createPublicReadServer({index,policy:policy(changes)});const read=(route,options={})=>request(service.url+route,options);try{await fn({service,index,read});}finally{await service.close();}}

test('public read transport denies writes,foreign hosts and origins,arbitrary RPC and malformed pagination before provider work',()=>using(async({read,index})=>{
  for(const [route,options,expected] of [
    ['/launch-api/status',{method:'POST'},405],['/launch-api/status',{headers:{Host:'other.example'}},403],
    ['/launch-api/status',{headers:{Origin:'https://other.example'}},403],['/launch-api/status?rpc=https://other.example',{},400],
    ['/launch-api/projects?limit=1&limit=2',{},400],['/launch-api/projects?limit=1e2',{},400],['/launch-api/projects?limit=0',{},400],
    ['/launch-api/history?address='+registry,{},400],['/launch-api/state?address=bad',{},400],['/launch-api/status/extra',{},404]
  ]) {const r=await read(route,options);assert.equal(r.status,expected,route);if(expected===403)assert.equal(r.headers.get('access-control-allow-origin'),null);await r.text();}
  assert.equal(index.syncs(),0);
}));
test('public status and projects remain read-only with strict response headers',()=>using(async({read})=>{
  const r=await read('/launch-api/status',{headers:{Origin:'https://echobsc.fun'}}),body=await r.json();
  assert.equal(r.status,200);assert.equal(body.chainId,56);assert.equal(body.executionReady,false);assert.equal(body.financialExecutionAllowed,false);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),'https://echobsc.fun');
  assert.deepEqual((await(await read('/launch-api/projects')).json()).projects,[]);
}));
test('stale snapshots and provider faults fail without serving a prior healthy result',()=>using(async({read,index})=>{
  assert.equal((await read('/launch-api/status')).status,200);
  index.raw.head.timestamp-=121;let r=await read('/launch-api/status');assert.equal(r.status,503);assert.equal((await r.json()).error,'INDEX_STALE_BLOCK');
  index.sync=async()=>{throw Error('upstream URL contains credential-shaped data');};r=await read('/launch-api/projects');assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'READ_UNAVAILABLE',financialExecutionAllowed:false});
}));
test('request timeout keeps the real read slot occupied and does not start a second sync',async()=>{
  const index=fixture();let release;const pending=new Promise(r=>{release=r;});index.sync=()=>pending;
  await using(async({read,service})=>{
    try{const first=await read('/launch-api/status');assert.equal((await first.json()).error,'READ_DEADLINE');assert.equal(service.status().activeReads,1);
    const second=await read('/launch-api/status');assert.equal((await second.json()).error,'READ_CAPACITY');}finally{release();}
    await new Promise(r=>setImmediate(r));assert.equal(service.status().activeReads,0);
  },{index,changes:{maxConcurrent:1,requestDeadlineMs:30}});
});
test('global rate cap ignores forged forwarding headers',()=>using(async({read})=>{
  assert.equal((await read('/launch-api/status')).status,200);
  assert.equal((await read('/launch-api/status',{headers:{'X-Forwarded-For':'1.2.3.4'}})).status,429);
},{changes:{requestsPerMinute:1}}));
test('oversized provider output fails closed',async()=>{
  const index=fixture();index.projects=()=>({projects:['X'.repeat(2000)]});
  await using(async({read})=>{const r=await read('/launch-api/projects');assert.equal(r.status,503);assert.equal((await r.json()).error,'READ_RESPONSE_LIMIT');},{index,changes:{maxResponseBytes:1024}});
});
test('weak confirmation policies and chain/registry substitution cannot start the transport',async()=>{
  for(const changes of [{chainId:97},{registry:'0x2222222222222222222222222222222222222222'},{maxBlockAgeSeconds:121},{origins:['http://echobsc.fun']},{maxConcurrent:0}])await assert.rejects(()=>createPublicReadServer({index:fixture(),policy:policy(changes)}),/PUBLIC_READ_POLICY/);
  const index=fixture();index.raw.confirmationsRequired=1;await assert.rejects(()=>createPublicReadServer({index,policy:policy()}),/PUBLIC_READ_POLICY/);
});
test('actual isolated registry,index and public transport return matching canonical state without a signer', {timeout:120000},async()=>{
  const work=path.resolve(import.meta.dirname,'../../../work/echo-launch-preview-20261113/release-completion-20261115-1450');await fs.mkdir(work,{recursive:true});
  const directory=await fs.mkdtemp(path.join(work,'public-read-integration-'));let rehearsal,service;
  try{
    rehearsal=await createLocalRuntimeRehearsal({directory});
    await rehearsal.chain.provider.request({method:'evm_setNextBlockTimestamp',params:[Math.floor(Date.now()/1000)]});await rehearsal.chain.provider.request({method:'evm_mine',params:[]});
    service=await createPublicReadServer({index:rehearsal.index,policy:policy({chainId:31337,localTestOnly:true,registry:rehearsal.config.registry.address,requestDeadlineMs:30000})});
    const read=route=>request(service.url+route);
    const list=await(await read('/launch-api/projects')).json();assert.ok(list.projects.length>=2);
    const project=list.projects.find(x=>x.interpreted);const response=await read('/launch-api/state?address='+project.address);
    assert.equal(response.status,200);const state=await response.json();assert.equal(state.state.project.toLowerCase(),project.address.toLowerCase());
    assert.equal(state.state.blockHash,state.index.head.hash);assert.equal(state.executionReady,false);assert.equal(state.financialExecutionAllowed,false);
  }finally{await service?.close();await rehearsal?.close();}
});
