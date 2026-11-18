import test from 'node:test';
import assert from 'node:assert/strict';
import {launchOverview} from '../dist/launch-overview.mjs';
const state=(extra={})=>({totalMinted:116,totalPaid:0,freeClaimed:116,pendingLiquidityBnb:0n,mintEnabled:true,opened:false,block:123,...extra});

test('free allocations count towards opening but never invent liquidity funding',()=>{
 const s=launchOverview(state());assert.equal(s.openingRemaining,4884);assert.equal(s.freeRemaining,884);assert.equal(s.totalPaid,0);assert.equal(s.fundingWei,0n);assert.equal(s.phase,'minting');
 const paid=launchOverview(state({totalMinted:146,totalPaid:30,pendingLiquidityBnb:42000000000000000n}));assert.equal(paid.freeClaimed,116);assert.equal(paid.totalPaid,30);assert.equal(paid.fundingWei,42000000000000000n);
});
test('an early opening does not pretend the 5000-share threshold was reached',()=>{
 const s=launchOverview(state({opened:true}));assert.equal(s.phase,'opened');assert.equal(s.openingValue,116);assert.equal(s.openingRemaining,4884);
});
test('unavailable and inconsistent snapshots are not shown as zero participation',()=>{
 for(const s of [null,state({totalPaid:1}),state({freeClaimed:1001}),state({totalMinted:10001}),state({pendingLiquidityBnb:-1n}),state({pendingLiquidityBnb:undefined}),state({totalPaid:NaN})])assert.equal(launchOverview(s).available,false);
});
test('failed refreshes retain a clearly stale snapshot rather than asserting fresh state',()=>{
 const s=launchOverview(state(),{fresh:false});assert.equal(s.available,true);assert.equal(s.fresh,false);assert.equal(s.block,123);
 assert.equal(launchOverview(state({paused:true})).phase,'paused');assert.equal(launchOverview(state({mintEnabled:false})).active,false);assert.equal(launchOverview(state({retired:true})).phase,'retired');
});
