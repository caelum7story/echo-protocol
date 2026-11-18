// Browser-local preparation only. No address, wallet authority or chain quote is inferred.
const integer=value=>/^(0|[1-9][0-9]*)$/.test(String(value??''))?String(value):null;
export function runtimeIntentFor(packet){
 const subscription=packet?.schema==='echo-launch-subscription-review/v1';
 const review=subscription?packet.reviewPackage:packet?.schema==='echo-launch-operating-review/v1'?packet.projectReview:packet;
 const plan=review?.documents?.launchPlan,project=plan?.project,e=plan?.economics;
 const missing=['official-registry-config','approved-template-version','verified-wallet-and-identity','fresh-chain-state-and-gas','explicit-action-consent'];
 let creationTerms=null;
 if(project&&['nft','token'].includes(project.type)&&e){
  const millis=Date.parse(plan.startsAt??project.startsAt),startsAt=Number.isFinite(millis)&&millis%1000===0?String(millis/1000):null;
  creationTerms={name:project.name,symbol:project.symbol,startsAt,unitPrice:integer(e.priceWei),creatorRecipient:null};
  missing.push('fixed-creator-recipient');
  if(project.type==='nft'){
   Object.assign(creationTerms,{supply:integer(e.publicUnits),baseURI:null,metadataRoot:null});
   // The frontend SHA256 content digest is not an on-chain metadata commitment or publication proof.
   missing.push('published-immutable-content-base-uri','verified-onchain-metadata-root');
  }else creationTerms.minimumRaise=integer(e.minimumWei);
  for(const [field,value] of Object.entries(creationTerms))if(value===null&&!['creatorRecipient','baseURI','metadataRoot'].includes(field))missing.push('creation-term:'+field);
 }else missing.push('complete-validated-launch-plan');
 const requested=subscription?packet.requestedSubscription:null;
 return {schema:'echo-launch-runtime-intent/v1',scope:'browser-local-read-only',chainId:56,executionReady:false,chainVerified:false,
  requestedOperation:subscription?'review-subscription':packet?.schema==='echo-launch-operating-review/v1'?'review-operating-costs':'review-launch-plan',
  registry:null,versionId:null,wallet:null,identityId:null,projectAddress:null,unsignedTransaction:null,
  creationTerms,subscriptionInput:requested?{units:integer(requested.quantity),budgetWei:integer(requested.budgetWei),estimatedPaymentWei:integer(requested.paymentWei),unusedBudgetWei:integer(requested.unusedBudgetWei)}:null,
  pendingProtocolSteps:packet?.schema==='echo-launch-operating-review/v1'?['review-startup-funding','measure-independent-gas','review-distribution-budget']:!creationTerms?['complete-missing-plan-fields','read-only-review']:
   subscription?['quoteSubscription','prepare-with-new-consent','wallet-preview-and-confirmation','verifyReceipt']:['quoteCreate','prepare-with-new-consent','wallet-preview-and-confirmation','verifyReceipt'],
  missing,contentPublicationVerified:false,sourceMetadataDigest:plan?.metadataDigest??null,
  instruction:'Mapping only. Current permission is read-only review. Never execute it, trust project-provided addresses, use the existing ECHO Mint, or turn a local digest into an on-chain content proof. A future runtime integration needs independently verified official bindings and a new user confirmation.'};
}
