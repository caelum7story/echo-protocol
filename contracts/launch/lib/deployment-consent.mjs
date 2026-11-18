// Narrow,expiring project delegation. This does not enable a distribution signer.
const fail=()=>{throw Error('BOUNDED_DEPLOYMENT_CONSENT_REQUIRED');},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function assertDeploymentConsent(c,review,transactionDigest,now){
 const a=c?.authority;
 if(c?.authorizationType!=='bounded-project-delegation'||c.approvalDigest!==review.approvalDigest||c.acknowledgedWalletEstimatedGas!==true||review.purpose!=='deployment'||review.transaction.chainId!==56||String(review.transaction.value)!=='0'||!Number.isSafeInteger(c.reviewPreparedAtMs)||c.reviewPreparedAtMs>now||now-c.reviewPreparedAtMs>120000)fail();
 if(a?.schema!=='echo-launch-bounded-deployment-authority/v1'||a.chainId!==56||!same(a.wallet,review.transaction.from)||typeof a.source!=='string'||a.source.length<1||a.source.length>1024||!Number.isSafeInteger(a.recordedAtMs)||a.recordedAtMs>now||!Number.isSafeInteger(a.expiresAtMs)||a.expiresAtMs<=now||a.expiresAtMs>a.recordedAtMs+7200000||!Array.isArray(a.allowedTransactionDigests)||a.allowedTransactionDigests.length!==2||new Set(a.allowedTransactionDigests).size!==2||a.allowedTransactionDigests.some(x=>!/^[a-f0-9]{64}$/.test(x))||!a.allowedTransactionDigests.includes(transactionDigest)||a.estimatedGasBudgetWei!=='1000000000000000'||a.estimatedBudgetIsNotSignedFeeCap!==true)fail();
 if(review.transaction.gasLimit!==undefined&&(!/^[0-9]+$/.test(String(review.transaction.gasLimit))||BigInt(review.transaction.gasLimit)>9000000n))fail();
 return {estimatedGasBudgetWei:BigInt(a.estimatedGasBudgetWei),userDelegationSource:a.source};
}
