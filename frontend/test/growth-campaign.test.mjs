import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGrowthReport,GROWTH_CAMPAIGN} from '../dist/growth-campaign.mjs';
import {growthClaims,reconcileGrowthPayouts} from '../dist/growth-campaign-chain.mjs';
import {DEPLOYMENT} from '../dist/chain.mjs';
import {TOKEN_ABI} from '../dist/deployment.mjs';
import {Interface} from '../dist/vendor/ethers.mjs';
import fs from 'node:fs';
const wallet=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const event=(id,n,extra={})=>({identityId:String(id),referrerId:'99',wallet:wallet(id),referrerWallet:wallet(99),shares:1,freeShares:0,costWei:'2000000000000000',block:100+n,transactionIndex:0,index:0,hash:'0x'+BigInt(n+1).toString(16).padStart(64,'0'),...extra});
const report=(events,extra={})=>buildGrowthReport({events,snapshotBlock:200,...extra});

test('a free first mint earns no BNB rebate; only the first paid order per referred identity qualifies',()=>{
 const r=report([event(1,1,{costWei:'0',freeShares:1}),event(1,2,{shares:3,costWei:'6000000000000000'}),event(1,3),event(2,4,{referrerId:'0',referrerWallet:undefined})]);
 assert.equal(r.rebates.length,1);assert.equal(r.rebates[0].buyerWei,300000000000000n);assert.equal(r.rebates[0].inviterWei,300000000000000n);
 assert.equal(r.leaderboard[0].score,1);assert.equal(r.committedWei,600000000000000n);
 assert.equal(report([event(1,1,{referrerWallet:wallet(1)})]).rebates.length,0);
});
test('budget commitments never exceed the cap and an oversized next order stops later smaller orders',()=>{
 const r=report([event(1,1),event(2,2,{shares:3,costWei:'6000000000000000'}),event(3,3)],{budgetWei:'400000000000000'});
 assert.equal(r.eligibleOrders,1);assert.equal(r.committedWei,200000000000000n);assert.equal(r.remainingWei,200000000000000n);assert.equal(r.budgetStopped,true);
 assert.equal(r.rebates[2].eligible,false);assert.equal(r.leaderboard[0].score,3);
});
test('pool-opening Mint is included in the final leaderboard, later transactions in that same block are excluded',()=>{
 const r=report([event(1,1,{block:110,transactionIndex:3,index:8}),event(2,2,{referrerId:'88',referrerWallet:wallet(88),block:110,transactionIndex:4,index:10})],{opening:{block:110,transactionIndex:3}});
 assert.equal(r.leaderboard.length,1);assert.equal(r.leaderboard[0].identityId,'99');assert.equal(r.leaderboard[0].prizeEcho,25000n);
 assert.equal(r.eligibleOrders,2);assert.equal(r.settled,true);assert.equal(r.payoutVerified,false);
});
test('same-score teams rank by the event reaching that score, duplicate logs cannot inflate scores',()=>{
 const e=event(1,1),r=report([event(4,4,{referrerId:'88',referrerWallet:wallet(88)}),event(3,3),event(2,2,{referrerId:'88',referrerWallet:wallet(88)}),e,{...e}]);
 assert.deepEqual(r.leaderboard.map(v=>[v.identityId,v.score]),[['99',2],['88',2]]);
 assert.equal(r.rebates.length,4);assert.equal(growthClaims(r).some(v=>v.asset==='ECHO'),false);
 assert.equal(GROWTH_CAMPAIGN.leaderboard.prizesEcho.reduce((s,v)=>s+BigInt(v),0n),50000n);
 assert.throws(()=>report([e,{...e,costWei:'3000000000000000'}]),/CONFLICTING_EVENT/);
});
test('payout reconciliation requires the exact confirmed project-wallet transfer and never recycles the campaign budget',async()=>{
 const r=report([event(1,1)]),id=r.rebates[0].claimId+':buyer',hash='0x'+'a'.repeat(64);
 const provider={getTransactionReceipt:async()=>({status:1,blockNumber:180,logs:[]}),getTransaction:async()=>({chainId:56n,from:DEPLOYMENT.config.treasury,to:wallet(1),value:100000000000000n})};
 const client={provider};const paid=await reconcileGrowthPayouts(client,r,[{claimIds:[id],txHash:hash}]);
 assert.equal(paid.paymentReconciliation.paidClaims,1);assert.equal(paid.paymentReconciliation.unpaidClaims.length,1);assert.equal(paid.committedWei,r.committedWei);
 await assert.rejects(()=>reconcileGrowthPayouts(client,r,[{claimIds:[id,id],txHash:hash}]),/DUPLICATE_OR_UNKNOWN_CLAIM/);
 provider.getTransaction=async()=>({chainId:56n,from:DEPLOYMENT.config.treasury,to:wallet(2),value:100000000000000n});
 await assert.rejects(()=>reconcileGrowthPayouts(client,r,[{claimIds:[id],txHash:hash}]),/PAYOUT_AMOUNT_OR_RECIPIENT_MISMATCH/);
 provider.getTransactionReceipt=async()=>({status:0,blockNumber:180,logs:[]});
 await assert.rejects(()=>reconcileGrowthPayouts(client,r,[{claimIds:[id],txHash:hash}]),/PAYOUT_NOT_CONFIRMED/);
});
test('a finalized team prize is paid only when its exact ECHO transfer event matches, never merely because opening occurred',async()=>{
 const r=report([event(1,1)],{opening:{block:110,transactionIndex:0}}),iface=new Interface(TOKEN_ABI),hash='0x'+'b'.repeat(64);
 const log={address:DEPLOYMENT.token,...iface.encodeEventLog(iface.getEvent('Transfer'),[DEPLOYMENT.config.treasury,wallet(99),25000n*10n**18n])};
 const provider={getTransactionReceipt:async()=>({status:1,blockNumber:180,logs:[log]}),getTransaction:async()=>({chainId:56n,from:DEPLOYMENT.config.treasury,to:DEPLOYMENT.token,value:0n})};
 const client={provider,token:{interface:iface}},ledger=[{claimIds:['team-prize:99'],txHash:hash}];
 const paid=await reconcileGrowthPayouts(client,r,ledger);assert.equal(paid.paymentReconciliation.paidClaims,1);
 provider.getTransactionReceipt=async()=>({status:1,blockNumber:180,logs:[]});
 await assert.rejects(()=>reconcileGrowthPayouts(client,r,ledger),/PAYOUT_AMOUNT_OR_RECIPIENT_MISMATCH/);
});
test('public Agent and website campaign metadata preserve the same confirmed budget and prize allocation',()=>{
 for(const file of ['network.json','agent.json']){const data=JSON.parse(fs.readFileSync(new URL('../dist/'+file,import.meta.url)));assert.deepEqual(data.growthCampaign,GROWTH_CAMPAIGN);}
});
