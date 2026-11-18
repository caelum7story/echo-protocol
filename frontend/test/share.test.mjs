import test from 'node:test';
import assert from 'node:assert/strict';
import {participationCard,cardShareText} from '../dist/share-model.mjs';
import {buildAgentBrief} from '../dist/interaction-model.mjs';
import {createReferralState,recordReferralOrder,hydrateReferralState} from '../dist/referral.mjs';
const order={id:'DEMO-0001',identity:'nova.ai',quantity:3,costWei:'3000000000000000',referrer:'atlas.ai'};
test('a result card is built only from a consistent existing demo order',()=>{
  const card=participationCard(order,'https://example.com/?ref=atlas.ai');
  assert.equal(card.quantity,3);assert.equal(card.tokens,3000);assert.equal(card.kind,'preview');
  assert.match(cardShareText(card),/非链上凭证/);assert.match(cardShareText(card),/3 份模拟 Mint/);
  assert.throws(()=>participationCard(null,'https://example.com'));
  assert.throws(()=>participationCard({...order,id:'0x'+'1'.repeat(64)},'https://example.com'));
  assert.throws(()=>participationCard({...order,costWei:'0'},'https://example.com'));
});
test('the participant becomes the inviter and private URL data never enters a result card',()=>{
  const card=participationCard({...order,wallet:'PRIVATE_WALLET',session:'SECRET'},'https://user:password@example.com/?ref=atlas.ai&session=SECRET#private');
  assert.equal(card.link,'https://example.com/?ref=nova.ai#mint');
  assert.doesNotMatch(JSON.stringify(card),/password|SECRET|PRIVATE_WALLET|atlas.ai/);
  assert.ok(Object.isFrozen(card));
});
test('an Agent brief uses credential-free official docs and stops before unconfigured transactions',()=>{
  const brief=buildAgentBrief({identity:'nova.ai',quantity:1,baseUrl:'https://u:secret@example.com/?token=SECRET'});
  assert.match(brief,/https:\/\/example.com\/llms.txt/);assert.match(brief,/https:\/\/example.com\/network.json/);
  assert.match(brief,/executionReady/);assert.match(brief,/停止任何交易流程/);assert.match(brief,/不得编造交易哈希/);
  assert.doesNotMatch(brief,/secret|SECRET/);
  assert.throws(()=>buildAgentBrief({identity:'nova.ai',quantity:1,baseUrl:'javascript:alert(1)'}));
});
test('free, mixed and paid order snapshots survive refresh and generate matching cards',()=>{
  const first=recordReferralOrder(createReferralState(),{identity:'nova.ai',quantity:1});
  const mixed=recordReferralOrder(createReferralState(),{identity:'nova.ai',quantity:10});
  const paid=recordReferralOrder(first.state,{identity:'nova.ai',quantity:9});
  for(const [{state,order},expected]of [[first,'0'],[mixed,'18000000000000000'],[paid,'18000000000000000']]){
    const loaded=hydrateReferralState(JSON.stringify(state)).orders[0];
    assert.equal(loaded.costWei,expected);assert.equal(loaded.mintedBefore,order.mintedBefore);
    assert.equal(participationCard(loaded,'https://example.com').quantity,order.quantity);
    assert.throws(()=>participationCard({...order,costWei:'1'},'https://example.com'));
  }
  const legacy={...order,firstOrder:true,attributionEligible:true};
  const state={version:1,pendingReferrer:null,bindings:[{identity:'nova.ai',referrer:'atlas.ai',orderId:legacy.id}],orders:[legacy],nextOrder:2};
  assert.equal(hydrateReferralState(state).orders[0].costWei,legacy.costWei);
  assert.equal(participationCard(legacy,'https://example.com').cost,'0.003 BNB');
});
