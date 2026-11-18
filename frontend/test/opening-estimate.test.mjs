import test from 'node:test';
import assert from 'node:assert/strict';
import {openingEstimate} from '../dist/opening-estimate.mjs';
const state=(extra={})=>({opened:false,closed:false,retired:false,totalPaid:0,totalMinted:85,freeClaimed:85,pendingLiquidityBnb:0n,pricing:{preOpenPrice:2000000000000000n},...extra});
test('zero paid mints produce a clearly parameter-based estimate, never a fictitious funded pool',()=>{
 const e=openingEstimate(state());assert.equal(e.basis,'parameters');assert.equal(e.perTokenWei,2000000000000n);assert.equal(e.perShareWei,2000000000000000n);
 const moreFree=openingEstimate(state({totalMinted:999,freeClaimed:999}));assert.equal(moreFree.perTokenWei,e.perTokenWei);
});
test('opening price uses accumulated 70% BNB and paid-share liquidity tokens, not the latest Mint price or free recipients',()=>{
 const e=openingEstimate(state({totalPaid:2,pendingLiquidityBnb:3500000000000000n,pricing:{preOpenPrice:3000000000000000n}}));
 assert.equal(e.basis,'accumulated');assert.equal(e.liquidityTokensWei,1400n*10n**18n);assert.equal(e.perTokenWei,2500000000000n);assert.equal(e.perShareWei,2500000000000000n);
});
test('an opened, retired, unbacked or invalid pool never shows a continuing opening-price estimate',()=>{
 assert.equal(openingEstimate(state({opened:true})).phase,'opened');
 for(const s of [null,state({retired:true}),state({closed:true}),state({totalPaid:1,pendingLiquidityBnb:0n}),state({totalPaid:0,pendingLiquidityBnb:1n}),state({totalPaid:-1}),state({pendingLiquidityBnb:-1n}),state({pricing:{preOpenPrice:0n}})])assert.equal(openingEstimate(s).phase,'unavailable');
});
