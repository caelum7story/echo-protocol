import test from 'node:test';
import assert from 'node:assert/strict';
import {mintSummary,buildAgentBrief} from '../dist/interaction-model.mjs';

test('mobile summary and Agent brief quote the same exact quantity and BNB amount',()=>{
  for(const quantity of [1,3,5,10]) {
    const q=mintSummary(quantity);
    const brief=buildAgentBrief({identity:'NOVA.ai',quantity,referrer:'atlas.ai'});
    assert.ok(brief.includes(`计划数量：${quantity} 份`));
    assert.ok(brief.includes(`演示总费用：${q.costLabel}`));
    assert.ok(brief.includes(`演示基础份额：${q.tokenLabel}`));
    assert.ok(brief.includes('邀请来源：atlas.ai'));
  }
});
test('Agent briefs preserve a locked first-order source and distinguish unsigned previews',()=>{
  const brief=buildAgentBrief({identity:'nova.ai',quantity:1,referrer:'atlas.ai',firstOrder:false});
  assert.match(brief,/原归属保持不变/);
  assert.match(brief,/不要请求钱包授权、签名、转账或广播交易/);
  assert.match(brief,/比例、上限和结算条件尚未确认/);
  assert.match(brief,/随机回响仅为候选演示/);
});
test('invalid quantities, exhausted inventory and self referrals cannot produce a brief',()=>{
  assert.throws(()=>buildAgentBrief({identity:'nova.ai',quantity:0}));
  assert.throws(()=>buildAgentBrief({identity:'nova.ai',quantity:3,remaining:2}));
  assert.throws(()=>buildAgentBrief({identity:'nova.ai',quantity:1,referrer:'NOVA.ai'}));
  assert.throws(()=>buildAgentBrief({identity:'<script>',quantity:1}));
});
test('free and mixed Agent quotes itemize costs and bound automatic paid fallback',()=>{
  for(const language of ['zh','en']){
    const free=buildAgentBrief({identity:'nova.ai',quantity:1,language});
    const mixed=buildAgentBrief({identity:'nova.ai',quantity:10,remaining:9003,language});
    assert.match(free,/0 BNB/);assert.match(mixed,/0.018 BNB/);
    if(language==='zh'){
      assert.match(free,/本次免费份数：1 份/);assert.match(mixed,/本次免费份数：1 份/);
      assert.match(mixed,/本次付费份数：9 份/);assert.match(mixed,/仅可在我预先授权/);
    }else{
      assert.match(free,/Free shares in this quote: 1/);assert.match(mixed,/Paid shares in this quote: 9/);
      assert.match(mixed,/Automatic paid fallback is allowed only within/);
      assert.doesNotMatch(mixed,/[\u4e00-\u9fff]/);
    }
  }
});
test('Agent summaries preserve the actual identity usage and referral allowance',()=>{
  const options={identity:'nova.ai',quantity:1,remaining:9980,eligibility:{identityMinted:10,successfulInvites:1,freeClaimsUsed:2}};
  assert.match(buildAgentBrief(options),/当前已铸：10 份；成功邀请：1 位；累计上限：11 份；剩余额度：1 份/);
  assert.match(buildAgentBrief({...options,language:'en'}),/Identity already minted: 10; successful invites: 1; total allowance: 11; remaining allowance: 1/);
  assert.throws(()=>buildAgentBrief({...options,quantity:2}));
});
