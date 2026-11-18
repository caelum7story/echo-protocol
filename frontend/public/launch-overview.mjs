const TOTAL_SHARES=10000,FREE_SHARES=1000,OPEN_AT=5000;

// This panel reports observed allocations and funds, never estimated liquidity.
export function launchOverview(state,{fresh=true}={}){
 if(!state)return {available:false,fresh:false};
 const {totalMinted,totalPaid,freeClaimed}=state;
 if(![totalMinted,totalPaid,freeClaimed].every(Number.isSafeInteger)||totalMinted<0||totalMinted>TOTAL_SHARES||totalPaid<0||freeClaimed<0||freeClaimed>FREE_SHARES||totalPaid+freeClaimed!==totalMinted)return {available:false,fresh:false};
 let fundingWei;try{fundingWei=BigInt(state.pendingLiquidityBnb);}catch{return {available:false,fresh:false};}
 if(fundingWei<0n)return {available:false,fresh:false};
 const active=!!state.mintEnabled&&!state.paused&&!state.closed&&!state.retired;
 const phase=state.retired?'retired':state.closed?'closed':state.opened?'opened':active?'minting':'paused';
 return {available:true,fresh:!!fresh,phase,active,opened:!!state.opened,totalMinted,totalPaid,freeClaimed,fundingWei,freeRemaining:FREE_SHARES-freeClaimed,openingTarget:OPEN_AT,openingValue:Math.min(totalMinted,OPEN_AT),openingRemaining:Math.max(0,OPEN_AT-totalMinted),block:state.block??null};
}
