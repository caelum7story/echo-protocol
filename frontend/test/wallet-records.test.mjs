import test from 'node:test';
import assert from 'node:assert/strict';
import {walletRecordsPage} from '../worker/wallet-records.mjs';
import {readerForProvider} from '../scripts/wallet-reader-entry.mjs';
const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const projects=['0x3333333333333333333333333333333333333333','0x4444444444444444444444444444444444444444'];
function fixtures(states,{total=2,creator=other}={}){return {wallet,mode:'records',offset:0,limit:2,blockNumber:100,
  registry:{listProjects:async()=>projects,projectCount:async()=>total,projects:async()=>({creator})},
  client:{historicalSnapshot:async(project,options)=>({project,blockNumber:options.blockNumber,who:{wallet,...states[projects.indexOf(project)]}})}};}
test('discovery retains exited or delivered positions and original-wallet credit',async()=>{
  const d=await walletRecordsPage(fixtures([{position:{units:'0',principalWei:'0',revision:'2',delivered:false}},{creditWei:'19'}]));
  assert.equal(d.records.length,2);assert.equal(d.nextOffset,null);assert.equal(d.historicalIdentitiesIncluded,false);assert.equal(d.financialExecutionAllowed,false);
});
test('cursor follows scanned projects even when a page has no matching record',async()=>{
  const d=await walletRecordsPage(fixtures([{},{}],{total:4}));assert.equal(d.records.length,0);assert.equal(d.nextOffset,2);assert.equal(d.scanned,2);
});
test('creator discovery filters by recorded creator and keeps empty owned projects',async()=>{
  const d=await walletRecordsPage({...fixtures([{},{}],{creator:wallet}),mode:'manage'});assert.equal(d.records.length,2);assert.ok(d.records.every(r=>r.createdByWallet));
  const skipped=await walletRecordsPage({...fixtures([{},{}]),mode:'manage',client:{historicalSnapshot(){throw Error('should not read unrelated project')}}});assert.equal(skipped.records.length,0);
});
test('wrong-wallet and wrong-block snapshots cannot be attributed to connected wallet',async()=>{
  const f=fixtures([{},{}]);f.client.historicalSnapshot=async project=>({project,blockNumber:100,who:{wallet:other}});
  await assert.rejects(()=>walletRecordsPage(f),/WALLET_PAGE_PROVENANCE/);
  f.client.historicalSnapshot=async project=>({project,blockNumber:99,who:{wallet}});await assert.rejects(()=>walletRecordsPage(f),/WALLET_PAGE_PROVENANCE/);
});
test('record discovery failures stay failures rather than empty success',async()=>{
  const f=fixtures([{},{}]);f.client.historicalSnapshot=async()=>{throw Error('RPC_UNAVAILABLE')};await assert.rejects(()=>walletRecordsPage(f),/RPC_UNAVAILABLE/);
  await assert.rejects(()=>walletRecordsPage({...f,limit:4}),/INVALID_WALLET_PAGE/);
});
test('wallet adapter exposes account connection only, validates chain and addresses',async()=>{
  const calls=[],p={request:async({method})=>{calls.push(method);return method==='eth_requestAccounts'?[wallet]:'0x38'},disconnect(){},on(){},removeListener(){}};
  const reader=readerForProvider(p);assert.equal(await reader.connect(),wallet);assert.deepEqual(calls,['eth_requestAccounts','eth_chainId']);assert.equal(reader.request,undefined);assert.equal(reader.signMessage,undefined);
  p.request=async({method})=>method==='eth_requestAccounts'?[wallet]:'0x1';await assert.rejects(()=>reader.connect(),/WRONG_WALLET_NETWORK/);
  p.request=async({method})=>method==='eth_requestAccounts'?['0x0000000000000000000000000000000000000000']:'56';await assert.rejects(()=>reader.connect(),/INVALID_WALLET_ACCOUNT/);
});
test('wallet and network changes invalidate the current public lookup',()=>{
  const listeners={},seen=[];const p={on:(n,f)=>listeners[n]=f,removeListener:n=>delete listeners[n]};
  const stop=readerForProvider(p).watch(w=>seen.push(w),()=>seen.push('disconnected'));listeners.accountsChanged([other]);listeners.chainChanged('0x1');listeners.disconnect();assert.deepEqual(seen,[other,null,'disconnected']);stop();assert.equal(Object.keys(listeners).length,0);
});
