// The pinned EchoLaunch release assigns 700 ECHO and 70% of each paid Mint
// to liquidity. Free shares never add BNB or liquidity tokens. This is a
// contribution-ratio estimate, not an executable DEX quote or return promise.
const TOKEN_UNIT=10n**18n;
export function openingEstimate(state){
 if(!state)return {phase:'unavailable'};
 if(state.opened)return {phase:'opened'};
 if(state.closed||state.retired)return {phase:'unavailable'};
 try{
  const paid=state.totalPaid;
  if(!Number.isSafeInteger(paid)||paid<0||paid>10000)return {phase:'unavailable'};
  const pending=BigInt(state.pendingLiquidityBnb);
  if(pending<0n)return {phase:'unavailable'};
  let bnb,tokens,basis;
  if(paid>0){bnb=pending;tokens=BigInt(paid)*700n*TOKEN_UNIT;basis='accumulated';}
  else{
   if(pending!==0n)return {phase:'unavailable'};
   const price=BigInt(state.pricing.preOpenPrice);if(price<=0n)return {phase:'unavailable'};
   bnb=price*7000n/10000n;tokens=700n*TOKEN_UNIT;basis='parameters';
  }
  if(bnb<=0n||tokens<=0n)return {phase:'unavailable'};
  const perTokenWei=bnb*TOKEN_UNIT/tokens,perShareWei=bnb*1000n*TOKEN_UNIT/tokens;
  if(perTokenWei===0n)return {phase:'unavailable'};
  return {phase:'estimated',basis,perTokenWei,perShareWei,liquidityBnbWei:bnb,liquidityTokensWei:tokens};
 }catch{return {phase:'unavailable'};}
}
