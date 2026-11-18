export const DEMO = Object.freeze({ priceWei: 2000000000000000n, freeShares: 1000, baseIdentityLimit: 10, tokensPerShare: 1000, maximumPerMint: 10, totalShares: 10000 });
const LEGACY_PRICE_WEI=1000000000000000n;
function priced(quote,unitPriceWei,pricingVersion){
  const costWei=unitPriceWei*BigInt(quote.paidQuantity),liquidityWei=costWei*70n/100n;
  return {...quote,unitPriceWei,pricingVersion,costWei,liquidityWei,treasuryWei:costWei-liquidityWei};
}
export function normalizeIdentity(value) {
  const label=String(value).trim().toLowerCase().replace(/\.ai$/, '');
  if(!/^[a-z0-9]{1,64}$/.test(label)) throw new Error('请输入 1–64 位字母或数字，例如 nova.ai。');
  return `${label}.ai`;
}
export function identityAllowance({identityMinted=0,successfulInvites=0,freeClaimsUsed=0}={}){
  for(const value of [identityMinted,successfulInvites,freeClaimsUsed])if(!Number.isSafeInteger(value)||value<0)throw new Error('身份额度数据无效。');
  if(freeClaimsUsed>DEMO.freeShares||identityMinted>DEMO.totalShares||successfulInvites>DEMO.totalShares)throw new Error('身份额度数据无效。');
  const identityLimit=DEMO.baseIdentityLimit+successfulInvites;
  return {identityMinted,successfulInvites,freeClaimsUsed,identityLimit,identityRemaining:Math.max(0,identityLimit-identityMinted),freeRemaining:DEMO.freeShares-freeClaimsUsed};
}
export function quoteMint(quantity,remaining=DEMO.totalShares,eligibility={}) {
  const q=Number(quantity);
  if(!Number.isInteger(q)||q<1||q>DEMO.maximumPerMint) throw new Error('请选择 1–10 的整数份数。');
  if(!Number.isSafeInteger(remaining)||remaining<0||remaining>DEMO.totalShares) throw new Error('演示剩余份数无效。');
  if(q>remaining) throw new Error('演示剩余份数不足，请减少份数。');
  const allowance=identityAllowance(eligibility);
  if(q>allowance.identityRemaining)throw new Error(`当前身份剩余 ${allowance.identityRemaining} 份额度，请减少份数或成功邀请新身份。`);
  const mintedBefore=DEMO.totalShares-remaining;
  const freeQuantity=allowance.identityMinted===0&&allowance.freeRemaining>0?1:0,paidQuantity=q-freeQuantity;
  return priced({...allowance,quantity:q,mintedBefore,freeQuantity,paidQuantity,tokens:q*DEMO.tokensPerShare},DEMO.priceWei,3);
}
// Existing all-paid preview receipts retain their original pricing snapshot.
export function quoteRecordedMint(order){
  const mintedBefore=order.mintedBefore===undefined?DEMO.freeShares:order.mintedBefore;
  if(!Number.isSafeInteger(mintedBefore)||mintedBefore<0)throw new Error('本机演示订单无效。');
  let q;
  if(order.pricingVersion===2||order.pricingVersion===3){
    q=quoteMint(order.quantity,DEMO.totalShares-mintedBefore,{identityMinted:order.identityMinted,successfulInvites:order.successfulInvites,freeClaimsUsed:order.freeClaimsUsed});
    q=priced(q,order.pricingVersion===2?LEGACY_PRICE_WEI:DEMO.priceWei,order.pricingVersion);
  }else{
    if(order.pricingVersion!==undefined&&order.pricingVersion!==1)throw new Error('本机演示订单无效。');
    // Preserve pre-identity-cap receipts at their historical quoted price.
    const quantity=Number(order.quantity);
    if(!Number.isInteger(quantity)||quantity<1||quantity>DEMO.maximumPerMint||mintedBefore+quantity>DEMO.totalShares)throw new Error('本机演示订单无效。');
    const freeQuantity=Math.min(quantity,Math.max(0,DEMO.freeShares-mintedBefore)),paidQuantity=quantity-freeQuantity;
    q=priced({quantity,mintedBefore,freeQuantity,paidQuantity,tokens:quantity*DEMO.tokensPerShare},LEGACY_PRICE_WEI,1);
  }
  if(String(q.costWei)!==order.costWei)throw new Error('模拟订单金额不一致。');
  return q;
}
// Offline economic review only. The website has no trusted live oracle yet.
export function quoteMarketMintPreview(quantity,remaining,eligibility,market){
  const {twapUnitPriceWei,spotUnitPriceWei,liquidityBnbWei,minLiquidityBnbWei,observedAtSeconds,nowSeconds,maxAgeSeconds,maxDeviationBps,oracleReady}=market||{};
  if(oracleReady!==true)throw new Error('Market oracle is not ready.');
  for(const v of [twapUnitPriceWei,spotUnitPriceWei,liquidityBnbWei,minLiquidityBnbWei])if(typeof v!=='bigint'||v<=0n)throw new Error('Invalid market price or liquidity.');
  for(const v of [observedAtSeconds,nowSeconds,maxAgeSeconds,maxDeviationBps])if(!Number.isSafeInteger(v)||v<0)throw new Error('Invalid market observation.');
  if(maxAgeSeconds===0||maxDeviationBps===0||maxDeviationBps>10000||observedAtSeconds>nowSeconds||nowSeconds-observedAtSeconds>maxAgeSeconds)throw new Error('Market quote is stale or invalid.');
  if(liquidityBnbWei<minLiquidityBnbWei)throw new Error('Market liquidity is too low.');
  const difference=spotUnitPriceWei>twapUnitPriceWei?spotUnitPriceWei-twapUnitPriceWei:twapUnitPriceWei-spotUnitPriceWei;
  if(difference*10000n>twapUnitPriceWei*BigInt(maxDeviationBps))throw new Error('Market price deviation is too large.');
  const unitPriceWei=spotUnitPriceWei>twapUnitPriceWei?spotUnitPriceWei:twapUnitPriceWei;
  return {...priced(quoteMint(quantity,remaining,eligibility),unitPriceWei,3),phase:'post-open',previewOnly:true};
}
export function formatBNB(wei) {
  const whole=wei/1000000000000000000n;
  const fraction=(wei%1000000000000000000n).toString().padStart(18,'0').replace(/0+$/,'');
  return `${whole}${fraction?'.'+fraction:''}`;
}
export function demoRecipients(participants,currentIdentity,quantity,offset=0) {
  const current=normalizeIdentity(currentIdentity);
  const unique=[...new Set(participants.map(normalizeIdentity))].filter(name=>name!==current);
  if(!unique.length) return [];
  return Array.from({length:quantity},(_,i)=>unique[(offset+i)%unique.length]);
}
