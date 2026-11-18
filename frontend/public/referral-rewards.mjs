// Referral attribution is on-chain; reward transfers are made by the project wallet.
export const REFERRAL_REWARD_POLICY=Object.freeze({
  tokensPerSuccessfulInvite:200,
  attribution:'EchoLaunch.successfulInvites',
  directOnly:true,distinctFirstMintOnly:true,includesFreeFirstMint:true,
  selfReferralEligible:false,existingRecordsIncluded:true,
  extraPaidMintAllowancePerInvite:1,
  source:'existing-reward-reserve',
  distribution:'project-wallet-transfer-after-pool-opening',
  automaticOnchainPayout:false,
  rules:'/referral-rewards.md'
});

export function referralRewardSummary({successfulInvites,opened=false}={}){
  if(!Number.isSafeInteger(successfulInvites)||successfulInvites<0||successfulInvites>10000)return {available:false};
  return {
    available:true,successfulInvites,
    accruedTokens:BigInt(successfulInvites)*BigInt(REFERRAL_REWARD_POLICY.tokensPerSuccessfulInvite),
    phase:opened?'awaiting-project-reconciliation':'awaiting-pool-opening',
    payoutVerified:false
  };
}
