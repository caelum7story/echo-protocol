import{Contract,Interface,keccak256}from'ethers';
import fs from'node:fs';
const abi=JSON.parse(fs.readFileSync(new URL('../artifacts/EchoLaunch.json',import.meta.url),'utf8')).abi;
/** Prepare only. Native BNB cannot be pulled: the wallet must sign/send each transaction. */
export async function prepareMint({provider,launchAddress,wallet,identityId,shares,referrerId=0,consent,expectedChainId=56,expectedRuntimeHash}){
 const chainId=Number(BigInt(await provider.send('eth_chainId',[])));if(chainId!==expectedChainId)throw Error('Wrong chain');
 if(chainId===56&&(!expectedRuntimeHash||keccak256(await provider.getCode(launchAddress))!==expectedRuntimeHash))throw Error('Unverified launch runtime');
 const launch=new Contract(launchAddress,abi,provider);const q=await launch.quote(wallet,identityId,shares,referrerId);const now=(await provider.getBlock('latest')).timestamp;
 if(q.cost>0n){if(!consent||String(consent.identityId)!==String(identityId)||Number(consent.shares)!==Number(shares)||String(consent.referrerId??0)!==String(referrerId)||consent.chainId!==chainId||consent.launch.toLowerCase()!==launchAddress.toLowerCase()||consent.wallet.toLowerCase()!==wallet.toLowerCase()||consent.expiresAt<now||BigInt(consent.maxMintWei)<q.cost||Number(consent.pricingVersion)!==Number(q.version))throw Error('Bounded payment consent required');
  if(!consent.autoPaid&&consent.approvedQuoteHash!==q.stateHash)throw Error('Confirm this paid quote');
 }
 const deadline=Math.min(now+300,consent?.expiresAt??now+300);const m={identityId,shares,referrerId,quoteHash:q.stateHash,maxCost:q.cost,deadline};const request={from:wallet,to:launchAddress,data:new Interface(abi).encodeFunctionData('mint',[m]),value:'0x'+q.cost.toString(16)};
 const gas=await provider.estimateGas(request);const fees=await provider.getFeeData();const gasPrice=fees.gasPrice;if(!gasPrice)throw Error('Gas quote unavailable');const gasLimit=gas*130n/100n+50000n;
 if(q.cost>0n&&(!consent?.maxGasWei||gasLimit*gasPrice>BigInt(consent.maxGasWei)))throw Error('Gas exceeds consent');
 return{request:{...request,chainId:'0x'+chainId.toString(16),gas:'0x'+gasLimit.toString(16),gasPrice:'0x'+gasPrice.toString(16)},summary:{costWei:q.cost.toString(),freeShares:Number(q.free),paidShares:Number(q.paid),tokens:q.tokens.toString(),version:Number(q.version)},broadcast:false};
}
