import test from 'node:test';
import assert from 'node:assert/strict';
import {translateText} from '../dist/locales.mjs';
import {buildAgentBrief} from '../dist/interaction-model.mjs';
import {participationCard,cardShareText} from '../dist/share-model.mjs';

test('localized dynamic records preserve public identity, quantity and receipt identifiers',()=>{
  assert.equal(translateText('由 nova.ai 分享给你','en'),'Invited by nova.ai');
  assert.equal(translateText('3 份模拟 · DEMO-0001','en'),'3 demo shares · DEMO-0001');
  assert.equal(translateText('剩余 8,714 份','en'),'8,714 shares remaining');
  assert.equal(translateText('nova.ai','en'),'nova.ai');
  assert.equal(translateText('0.003 BNB','en'),'0.003 BNB');
  assert.equal(translateText('参与记录','zh'),'参与记录');
});
test('English Agent briefs retain quote, attribution and the unconfigured execution stop',()=>{
  const brief=buildAgentBrief({identity:'nova.ai',quantity:3,remaining:9000,eligibility:{freeClaimsUsed:1000},referrer:'atlas.ai',language:'en',baseUrl:'https://example.com/?token=SECRET'});
  assert.match(brief,/Planned quantity: 3 shares/);assert.match(brief,/0.006 BNB/);assert.match(brief,/Referrer: atlas.ai/);
  assert.match(brief,/executionReady/);assert.match(brief,/stop all transaction execution/);assert.match(brief,/Never invent a hash/);
  assert.doesNotMatch(brief,/SECRET|[\u4e00-\u9fff]/);
});
test('English exported result text remains a demo receipt and uses the participant invitation',()=>{
  const card=participationCard({id:'DEMO-0001',identity:'nova.ai',quantity:1,costWei:'1000000000000000'},'https://example.com/?ref=atlas.ai&token=SECRET','en');
  const text=cardShareText(card);assert.match(text,/Not an on-chain receipt/);assert.match(text,/ref=nova.ai/);
  assert.doesNotMatch(text,/SECRET|atlas.ai|[\u4e00-\u9fff]/);
});
