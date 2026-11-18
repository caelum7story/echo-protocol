import test from 'node:test';
import assert from 'node:assert/strict';
import {readGrowthReport} from '../dist/growth-campaign-chain.mjs';
import {DEPLOYMENT,launchInterface} from '../dist/chain.mjs';

const wallet=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function fixture({paid=0n,opened=false,logs=[]}={}){
  const latest=DEPLOYMENT.block+1020,snapshot=latest-20,calls={verified:0,counters:[],logs:[]};
  const read=(name,value)=>async options=>{calls.counters.push({name,...options});assert.equal(options.blockTag,snapshot);return typeof value==='function'?value(options.blockTag):value;};
  const client={
    verifyDeployment:async()=>{calls.verified++;},
    launch:{totalPaid:read('totalPaid',paid),opened:read('opened',opened)},
    provider:{send:async method=>{assert.equal(method,'eth_blockNumber');return '0x'+latest.toString(16);},
      getLogs:async range=>{calls.logs.push(range);return logs.filter(l=>l.blockNumber>=range.fromBlock&&l.blockNumber<=range.toBlock);}},
    registry:{ownerOf:async()=>wallet(99),handleOf:async()=>''}
  };
  return {client,calls,latest,snapshot};
}
function log(name,args,{index=0}={}){
  return {address:DEPLOYMENT.launch,...launchInterface.encodeEventLog(launchInterface.getEvent(name),args),
    blockNumber:DEPLOYMENT.block+5,transactionIndex:0,index,transactionHash:'0x'+'1'.padStart(64,'0'),removed:false};
}

test('confirmed zero-paid proof avoids history scans even if newer blocks could contain paid Mints',async()=>{
  const f=fixture({paid:block=>{assert.equal(block,DEPLOYMENT.block+1000);return 0n;}});
  const r=await readGrowthReport(f.client);
  assert.equal(f.calls.verified,1);
  assert.deepEqual(f.calls.counters.map(c=>[c.name,c.blockTag]),[['totalPaid',f.snapshot],['opened',f.snapshot]]);
  assert.equal(f.calls.logs.length,0);
  assert.equal(r.snapshotBlock,f.snapshot);assert.equal(r.latestBlock,f.latest);assert.equal(r.confirmations,20);
  assert.equal(r.source,'verified-echo-launch-counter');
  assert.deepEqual(r.zeroPaidEvidence,{block:f.snapshot,totalPaid:'0',opened:false});
  assert.deepEqual(r.leaderboard,[]);assert.equal(r.eligibleOrders,0);assert.equal(r.committedWei,0n);assert.equal(r.settled,false);
});

test('nonzero paid counter retains event-based referral scoring',async()=>{
  const f=fixture({paid:1n,logs:[log('Minted',[wallet(1),1n,99n,1n,0n,2000000000000000n,1000n*10n**18n])]});
  const r=await readGrowthReport(f.client);
  assert.equal(f.calls.logs.length,1);assert.equal(f.calls.logs[0].toBlock,f.snapshot);
  assert.equal(r.source,'verified-echo-launch-events');assert.equal(r.zeroPaidEvidence,undefined);
  assert.equal(r.leaderboard[0].identityId,'99');assert.equal(r.leaderboard[0].score,1);assert.equal(r.eligibleOrders,1);
});

test('opened state still reads its settlement event when the paid counter is zero',async()=>{
  const f=fixture({opened:true,logs:[log('Opened',[0n,1n,1n,1n])]});
  const r=await readGrowthReport(f.client);
  assert.equal(f.calls.logs.length,1);assert.equal(r.source,'verified-echo-launch-events');
  assert.equal(r.zeroPaidEvidence,undefined);assert.equal(r.settled,true);assert.equal(r.opening.block,DEPLOYMENT.block+5);
});

test('failed counter verification cannot be reported as an empty leaderboard',async()=>{
  for(const name of ['totalPaid','opened']){
    const f=fixture();f.client.launch[name]=async()=>{throw Error('RPC_READ_FAILED');};
    await assert.rejects(()=>readGrowthReport(f.client),/RPC_READ_FAILED/);
    assert.equal(f.calls.logs.length,0);
  }
});
