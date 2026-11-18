import test from 'node:test';
import assert from 'node:assert/strict';
import {LAUNCH_POLICY,marketTaxQuote} from '../dist/launch-policy.mjs';
import {DEMO,quoteMarketMintPreview,quoteMint} from '../dist/model.mjs';
import {createReferralState,recordReferralOrder,hydrateReferralState} from '../dist/referral.mjs';
import {participationCard} from '../dist/share-model.mjs';

test('confirmed supply adds up, keeps rewards at 20%, and only paid shares fund the 70/30 split',()=>{
  const user=BigInt(LAUNCH_POLICY.mintUserAllocationTokens),lp=BigInt(LAUNCH_POLICY.liquidityTokenAllocation),reward=BigInt(LAUNCH_POLICY.rewardAllocationTokens),total=BigInt(LAUNCH_POLICY.totalTokenSupply);
  assert.equal(user+lp+reward,total);assert.equal(reward*10000n,total*2000n);
  assert.equal(user,BigInt(LAUNCH_POLICY.totalShares*LAUNCH_POLICY.tokensPerShare));
  const q=quoteMint(10);assert.equal(q.tokens,10000);assert.equal(q.costWei,18000000000000000n);
  assert.equal(q.liquidityWei,12600000000000000n);assert.equal(q.treasuryWei,5400000000000000n);
  assert.equal(LAUNCH_POLICY.autoOpenMintedShares,5000);assert.equal(LAUNCH_POLICY.autoOpenIncludesFree,true);
  assert.equal(LAUNCH_POLICY.deadlineEnabled,false);assert.equal(LAUNCH_POLICY.mintRefunds,false);
});

test('opening 30% sell tax replaces 2%, ends exactly at 30 minutes, and excludes DEX fees',()=>{
  const openedAtSeconds=1000,amount=1000n*10n**18n;
  for(const nowSeconds of [1000,2799]){
    const sell=marketTaxQuote({side:'sell',amount,openedAtSeconds,nowSeconds});
    assert.equal(sell.rateBps,3000);assert.equal(sell.taxAmount,amount*30n/100n);
    assert.equal(marketTaxQuote({side:'buy',amount,openedAtSeconds,nowSeconds}).rateBps,100);
  }
  assert.equal(marketTaxQuote({side:'sell',amount,openedAtSeconds,nowSeconds:2800}).rateBps,200);
  assert.throws(()=>marketTaxQuote({side:'sell',amount,openedAtSeconds:0,nowSeconds:1000}));
  assert.throws(()=>marketTaxQuote({side:'sell',amount,openedAtSeconds,nowSeconds:999}));
});

test('0.001 BNB historical receipts retain their price when current mint pricing changes to 0.002',()=>{
  const first=recordReferralOrder(createReferralState(),{identity:'legacy.ai',quantity:3});
  const state=JSON.parse(JSON.stringify(first.state));state.orders[0].pricingVersion=2;state.orders[0].costWei='2000000000000000';
  const restored=hydrateReferralState(state);
  assert.equal(participationCard(restored.orders[0],'https://example.com').cost,'0.002 BNB');
  assert.equal(restored.orders[0].pricingVersion,2);
  const next=recordReferralOrder(restored,{identity:'legacy.ai',quantity:1});
  assert.equal(next.order.pricingVersion,3);assert.equal(next.order.costWei,'2000000000000000');
  assert.equal(hydrateReferralState(next.state).orders[1].costWei,'2000000000000000');
});

const market={oracleReady:true,twapUnitPriceWei:2000000000000000n,spotUnitPriceWei:2000000000000000n,liquidityBnbWei:10n**19n,minLiquidityBnbWei:10n**18n,observedAtSeconds:1000,nowSeconds:1001,maxAgeSeconds:60,maxDeviationBps:1000};
test('offline market-linked preview rejects untrusted or stale data and follows the higher reference',()=>{
  const q=quoteMarketMintPreview(1,9000,{freeClaimsUsed:1000},{...market,spotUnitPriceWei:2100000000000000n});
  assert.equal(q.unitPriceWei,2100000000000000n);assert.equal(q.tokens,1000);assert.equal(q.previewOnly,true);
  for(const changes of [{oracleReady:false},{nowSeconds:1061},{observedAtSeconds:1002},{liquidityBnbWei:1n},{spotUnitPriceWei:3000000000000000n}])assert.throws(()=>quoteMarketMintPreview(1,9000,{freeClaimsUsed:1000},{...market,...changes}));
});

test('a bounded same-pool paid mint-and-immediate-sell simulation has no gross loop profit',()=>{
  // This checks only the stated reserve model, not all markets or oracle attacks.
  const E=10n**18n,reserveBnb=10n*E,reserveTokens=5000000n*E;
  for(let quantity=1;quantity<=10;quantity++)for(const twap of [market.twapUnitPriceWei,2100000000000000n])for(const sellTaxBps of [200n,3000n]){
    const q=quoteMarketMintPreview(quantity,9000,{freeClaimsUsed:1000},{...market,twapUnitPriceWei:twap});
    const bnbAfter=reserveBnb+q.liquidityWei,tokensAfter=reserveTokens+BigInt(quantity*700)*E;
    const sellTokens=BigInt(q.tokens)*E*(10000n-sellTaxBps)/10000n;
    const withDexFee=sellTokens*9975n;
    const proceeds=bnbAfter*withDexFee/(tokensAfter*10000n+withDexFee);
    assert(proceeds<q.costWei);assert(q.treasuryWei+q.liquidityWei===q.costWei);
  }
  assert.equal(DEMO.priceWei,2000000000000000n);
});
