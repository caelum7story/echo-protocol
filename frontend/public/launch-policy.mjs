import {REFERRAL_REWARD_POLICY} from './referral-rewards.mjs';
export const LAUNCH_POLICY=Object.freeze({
  designStatus:'confirmed-core-parameters',executionReady:false,
  preOpenPaidPriceWei:'2000000000000000',
  automaticPaidFallback:true,boundedPaymentConsentRequired:true,mintTokenDelivery:'same-transaction-to-minter',separateTokenClaimRequired:false,
  pricingRulesOwnerMutable:true,pricingChangesApplyToFutureMintsOnly:true,
  taxRatesOwnerMutable:false,openingTaxDurationOwnerMutable:false,
  totalShares:10000,tokensPerShare:1000,mintUserAllocationTokens:'10000000',
  rewardReserveBps:2000,rewardReserveBasis:'total-token-supply',liquidityTokensSeparate:true,
  totalTokenSupply:'21250000',liquidityTokenAllocation:'7000000',rewardAllocationTokens:'4250000',
  liquidityTokensPerPaidShare:700,unusedLiquidityReserve:'burn-after-sellout',rewardDistributionRules:REFERRAL_REWARD_POLICY,
  autoOpenMintedShares:5000,autoOpenIncludesFree:true,ownerCanOpenEarly:true,continueMintAfterOpen:true,
  postOpenPricingMode:'fixed-tokens-market-linked-bnb',deadlineEnabled:false,mintRefunds:false,
  liquidityBps:7000,projectBps:3000,projectPaymentTiming:'each-successful-paid-mint',projectRecipient:'0xA0F8fA9E4Cb9DFeE193C46B147D1F3ae19bD69e5',
  buyTaxBps:100,normalSellTaxBps:200,openingSellTaxBps:3000,openingSellTaxSeconds:1800,
  openingTaxReplacesNormalSellTax:true,taxCollectionMode:'accumulate-tokens-and-batch-swap-to-bnb',taxRecipient:'0xA0F8fA9E4Cb9DFeE193C46B147D1F3ae19bD69e5',
  oracleParameters:null,taxSwapParameters:null,liveIntegrationStatus:'not-implemented'
});

// Token transfer tax only. DEX fees, price impact and gas are separate.
export function marketTaxQuote({side,amount,openedAtSeconds,nowSeconds}){
  if(!['buy','sell'].includes(side)||typeof amount!=='bigint'||amount<0n)throw new Error('Invalid market-tax input.');
  if(!Number.isSafeInteger(openedAtSeconds)||openedAtSeconds<=0||!Number.isSafeInteger(nowSeconds)||nowSeconds<openedAtSeconds)throw new Error('Pool opening time is not valid.');
  const openingWindow=nowSeconds<openedAtSeconds+LAUNCH_POLICY.openingSellTaxSeconds;
  const rateBps=side==='buy'?LAUNCH_POLICY.buyTaxBps:openingWindow?LAUNCH_POLICY.openingSellTaxBps:LAUNCH_POLICY.normalSellTaxBps;
  const taxAmount=amount*BigInt(rateBps)/10000n;
  return {rateBps,taxAmount,netAmount:amount-taxAmount};
}
