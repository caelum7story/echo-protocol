export const RESCUE_POLICY=Object.freeze({
  designStatus:'confirmed',mode:'identide-derived-24h',implementationStatus:'deployed-verified',
  delaySeconds:86400,referenceDelaySeconds:172800,ownerOnly:true,pausedRequired:true,fixedRecipient:true,rescueVault:'0xA0F8fA9E4Cb9DFeE193C46B147D1F3ae19bD69e5',
  onePendingRescue:true,cancellable:true,automaticExecution:false,lpRescueAllowed:false,
  projectLpRecipient:'0x000000000000000000000000000000000000dEaD',
  nativeRefundCreditsProtected:true,nativeRescueRetiresMint:false,
  referenceUsdtOrProjectTokenRescueRetiresMint:true,automaticMigration:false,automaticUserRefund:false,
  referenceContract:'0x4Dee8C96BD33F174b8310eF89Be00a16F6c0321a',executionReady:false
});
export const RESCUE_REFERENCE_URL='https://sourcify.dev/server/v2/contract/56/0x4Dee8C96BD33F174b8310eF89Be00a16F6c0321a?fields=sources,abi,creationMatch,runtimeMatch';
