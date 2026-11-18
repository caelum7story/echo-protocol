import test from 'node:test';
import assert from 'node:assert/strict';
import {teamPreview} from '../dist/team-preview.mjs';
import {REFERRAL_REWARD_POLICY} from '../dist/referral-rewards.mjs';

test('free first mints earn the existing referral reward while only first-paid friends add points',()=>{
 const free=teamPreview({firstMints:'5',paidIdentities:'0'});
 assert.equal(free.rewardEcho,5*REFERRAL_REWARD_POLICY.tokensPerSuccessfulInvite);
 assert.equal(free.extraPaidAllowance,5);assert.equal(free.teamPoints,0);
 const mixed=teamPreview({firstMints:5,paidIdentities:2});
 assert.equal(mixed.rewardEcho,1000);assert.equal(mixed.teamPoints,2);assert.equal(mixed.extraPaidAllowance,5);
});
test('inconsistent, blank, fractional or out-of-range scenarios never show a calculated reward',()=>{
 assert.deepEqual(teamPreview({firstMints:2,paidIdentities:3}),{available:false,error:'PAID_EXCEEDS_TOTAL'});
 for(const value of ['',null,undefined,'1.5',-1,10000,Infinity,{},'1e2'])assert.equal(teamPreview({firstMints:value,paidIdentities:0}).available,false);
 assert.equal(teamPreview({firstMints:5,paidIdentities:''}).available,false);
 assert.equal(teamPreview({firstMints:0,paidIdentities:0}).rewardEcho,0);
 assert.equal(teamPreview({firstMints:9999,paidIdentities:9999}).rewardEcho,1999800);
});
