import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REFERRAL_REWARD_POLICY as policy,referralRewardSummary} from '../dist/referral-rewards.mjs';
import {buildLiveBrief} from '../dist/live-brief.mjs';
import {invitationText} from '../dist/engagement.mjs';

test('opening the pool never becomes proof that an accrued invite reward was paid',()=>{
 const before=referralRewardSummary({successfulInvites:3});
 const after=referralRewardSummary({successfulInvites:3,opened:true});
 assert.equal(before.accruedTokens,600n);assert.equal(after.accruedTokens,600n);
 assert.equal(before.phase,'awaiting-pool-opening');assert.equal(after.phase,'awaiting-project-reconciliation');
 assert.equal(before.payoutVerified,false);assert.equal(after.payoutVerified,false);
 assert.equal(referralRewardSummary({successfulInvites:0}).accruedTokens,0n);
 for(const successfulInvites of [undefined,-1,1.5,NaN,Infinity,10001,'3'])assert.equal(referralRewardSummary({successfulInvites}).available,false);
});
test('even the maximum possible distinct first-mint referrals fit the existing reward reserve',()=>{
 const maximum=referralRewardSummary({successfulInvites:10000});
 assert.equal(maximum.accruedTokens,2000000n);assert.ok(maximum.accruedTokens<=4250000n);
 assert.equal(policy.includesFreeFirstMint,true);assert.equal(policy.extraPaidMintAllowancePerInvite,1);
 assert.equal(policy.automaticOnchainPayout,false);
 const network=JSON.parse(fs.readFileSync(new URL('../dist/network.json',import.meta.url)));
 const agent=JSON.parse(fs.readFileSync(new URL('../dist/agent.json',import.meta.url)));
 assert.deepEqual(network.launchPolicy.rewardDistributionRules,policy);assert.deepEqual(agent.referralRewardPolicy,policy);
});
test('both language briefs and shared invitations explain the extra reward without changing ordinary Mint delivery',()=>{
 for(const language of ['zh','en']){
  const brief=buildLiveBrief({name:'cchenj',language});
  assert.match(brief,/200 ECHO/);assert.match(brief,/1,000 ECHO/);assert.match(brief,/successfulInvites/);assert.match(brief,/referral-rewards\.md/);
  assert.match(invitationText('cchenj',language),/200 ECHO/);
  if(language==='en'){assert.match(brief,/not an automatic/);assert.doesNotMatch(brief,/[\u4e00-\u9fff]/);}
  else assert.match(brief,/不是 Mint 或建池时自动派发/);
 }
});
