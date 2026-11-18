import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferralState,parseReferralLink,buildReferralLink,hydrateReferralState,withPendingReferral,resolveReferral,recordReferralOrder,referralAgentNote,mintEligibility,mintTotals} from '../dist/referral.mjs';
import {quoteMint} from '../dist/model.mjs';

test('shared URL contains only the public inviter and mint destination',()=>{
  const link=buildReferralLink('https://example.test/path/?token=private&wallet=secret&ref=old.ai#account',' ATLAS.AI ');
  assert.equal(link,'https://example.test/path/?ref=atlas.ai#mint');
  assert.deepEqual(parseReferralLink(link),{referrer:'atlas.ai',invalid:false});
  assert.throws(()=>buildReferralLink('javascript:alert(1)','atlas.ai'));
});
test('invalid and ambiguous inbound links cannot set an invitation',()=>{
  for(const href of ['https://example.test/?ref=','https://example.test/?ref=a.ai&ref=b.ai','https://example.test/?ref=%3Cscript%3E','not a URL']) {
    assert.deepEqual(parseReferralLink(href),{referrer:null,invalid:true});
  }
  assert.deepEqual(parseReferralLink('https://example.test/'),{referrer:null,invalid:false});
});
test('the displayed source survives refresh and is captured in the first order',()=>{
  const loaded=hydrateReferralState(JSON.stringify(withPendingReferral(createReferralState(),'atlas')));
  const result=recordReferralOrder(loaded,{identity:'nova.ai',quantity:3,expectedReferrer:'atlas.ai'});
  assert.equal(result.order.referrer,'atlas.ai');
  assert.equal(result.order.costWei,'4000000000000000');
  assert.equal(result.order.attributionEligible,true);
  const refreshed=hydrateReferralState(JSON.stringify(result.state));
  assert.deepEqual(refreshed.orders[0],result.order);
  assert.match(referralAgentNote(refreshed,'nova.ai'),/atlas\.ai/);
});
test('a new link cannot rewrite an existing first order or earn repeat attribution',()=>{
  const first=recordReferralOrder(withPendingReferral(createReferralState(),'atlas.ai'),{identity:'nova.ai',quantity:1});
  const changed=withPendingReferral(hydrateReferralState(JSON.stringify(first.state)),'iris.ai');
  assert.equal(resolveReferral(changed,'nova.ai').referrer,'atlas.ai');
  const second=recordReferralOrder(changed,{identity:'nova.ai',quantity:9});
  assert.equal(second.order.referrer,'atlas.ai');
  assert.equal(second.order.attributionEligible,false);
  assert.equal(second.state.bindings.length,1);
  assert.equal(second.state.orders[1].referrer,'atlas.ai');
});
test('self referrals and retroactive links never generate a first-order attribution',()=>{
  const state=withPendingReferral(createReferralState(),'nova.ai');
  assert.equal(resolveReferral(state,'NOVA.ai').status,'self');
  const first=recordReferralOrder(state,{identity:'nova.ai',quantity:1});
  assert.equal(first.order.referrer,null);
  const next=recordReferralOrder(withPendingReferral(first.state,'atlas.ai'),{identity:'nova.ai',quantity:1});
  assert.equal(next.order.referrer,null);
  assert.equal(next.order.attributionEligible,false);
});
test('different buyer identities retain independent first-order bindings',()=>{
  const a=recordReferralOrder(withPendingReferral(createReferralState(),'atlas.ai'),{identity:'nova.ai',quantity:1});
  const b=recordReferralOrder(withPendingReferral(a.state,'iris.ai'),{identity:'luna.ai',quantity:2});
  assert.equal(resolveReferral(b.state,'nova.ai').referrer,'atlas.ai');
  assert.equal(resolveReferral(b.state,'luna.ai').referrer,'iris.ai');
  assert.notEqual(a.order.id,b.order.id);
});
test('source changes during a preview require a new confirmation',()=>{
  const state=withPendingReferral(createReferralState(),'iris.ai');
  assert.throws(()=>recordReferralOrder(state,{identity:'nova.ai',quantity:1,expectedReferrer:'atlas.ai'}));
  assert.equal(state.orders.length,0);
});
test('persisted records cannot acquire eligibility by altering stored flags',()=>{
  const first=recordReferralOrder(withPendingReferral(createReferralState(),'atlas.ai'),{identity:'nova.ai',quantity:1});
  const second=recordReferralOrder(first.state,{identity:'nova.ai',quantity:1});
  second.state.orders[0].attributionEligible=true;
  assert.equal(hydrateReferralState(JSON.stringify(second.state)).orders[0].attributionEligible,false);
  second.state.orders[0].referrer='<img onerror=alert(1)>';
  assert.throws(()=>hydrateReferralState(JSON.stringify(second.state)));
});
test('first-order bindings survive when older orders leave the recent-history window',()=>{
  let state=recordReferralOrder(withPendingReferral(createReferralState(),'atlas.ai'),{identity:'nova.ai',quantity:1}).state;
  for(let i=0;i<55;i++) state=recordReferralOrder(state,{identity:`guest${i}.ai`,quantity:1}).state;
  const restored=hydrateReferralState(JSON.stringify(state));
  assert.equal(restored.orders.length,50);
  assert.equal(restored.bindings.length,56);
  assert.equal(resolveReferral(withPendingReferral(restored,'iris.ai'),'nova.ai').referrer,'atlas.ai');
  assert.equal(restored.bindings.filter(binding=>binding.referrer==='atlas.ai').length,56);
});
test('identity cap persists across refresh and each distinct invited first mint unlocks one paid share',()=>{
  let state=recordReferralOrder(createReferralState(),{identity:'nova.ai',quantity:10}).state;
  assert.equal(mintEligibility(state,'nova.ai').identityRemaining,0);
  assert.throws(()=>recordReferralOrder(state,{identity:'nova.ai',quantity:1}));
  state=recordReferralOrder(withPendingReferral(state,'nova.ai'),{identity:'friend.ai',quantity:1}).state;
  state=hydrateReferralState(JSON.stringify(state));
  assert.equal(mintEligibility(state,'nova.ai').identityLimit,11);
  const extra=recordReferralOrder(state,{identity:'nova.ai',quantity:1});
  assert.equal(extra.order.costWei,'2000000000000000');
  state=recordReferralOrder(extra.state,{identity:'friend.ai',quantity:1}).state;
  assert.equal(mintEligibility(state,'nova.ai').successfulInvites,1);
  assert.equal(mintEligibility(state,'nova.ai').identityRemaining,0);
  assert.throws(()=>recordReferralOrder(state,{identity:'nova.ai',quantity:1}));
  const changedSource=withPendingReferral(state,'other.ai');
  state=recordReferralOrder(changedSource,{identity:'friend.ai',quantity:1}).state;
  assert.equal(mintEligibility(state,'other.ai').successfulInvites,0);
  assert.equal(mintTotals(state).freeClaimsUsed,2);
});
test('the 1000 free claims are independent of paid shares and cannot exceed the global pool',()=>{
  let state=recordReferralOrder(createReferralState(),{identity:'first.ai',quantity:10}).state;
  for(let i=1;i<1000;i++)state=recordReferralOrder(state,{identity:`claim${i}.ai`,quantity:1}).state;
  assert.equal(mintTotals(state).freeClaimsUsed,1000);assert.equal(mintTotals(state).minted,1009);
  const next=recordReferralOrder(state,{identity:'late.ai',quantity:10});
  assert.equal(next.order.costWei,'20000000000000000');
  assert.equal(mintTotals(next.state).freeClaimsUsed,1000);
  assert.equal(mintEligibility(next.state,'late.ai').identityRemaining,0);
});
test('stale quote confirmation cannot charge a different price or use changed allowance',()=>{
  let state=createReferralState();const expectedQuote=quoteMint(1,10000,mintEligibility(state,'nova.ai'));
  state=recordReferralOrder(state,{identity:'other.ai',quantity:1}).state;
  assert.throws(()=>recordReferralOrder(state,{identity:'nova.ai',quantity:1,expectedQuote}));
});
