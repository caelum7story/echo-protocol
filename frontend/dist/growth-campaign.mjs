// Accrued marketing rewards, never automatic transfers or proof of payment.
export const GROWTH_CAMPAIGN=Object.freeze({
  id:'echo-paid-invite-v1',budgetWei:'200000000000000000',
  buyerRebateBps:500,inviterRebateBps:500,
  eligibility:'first-successful-paid-order-per-invited-identity',
  attribution:'chain-recorded-firstReferrer',budgetOrder:'chain-order-whole-orders-stop-when-insufficient',
  source:'project-30-percent-revenue',distribution:'project-wallet-reconciliation',
  automaticPayout:false,
  leaderboard:Object.freeze({basis:'distinct-direct-invited-identities-with-first-paid-mint',
    settles:'first-pool-opening-transaction-inclusive',prizesEcho:['25000','15000','10000'],
    prizePoolEcho:'50000',source:'existing-echo-reward-reserve',
    tieBreak:'earlier-event-reaching-the-score',minimumScore:1,unusedPrizes:'remain-in-reward-reserve'})
});
const ZERO='0x0000000000000000000000000000000000000000';
const cmp=(a,b)=>a.block-b.block||a.transactionIndex-b.transactionIndex||a.index-b.index;
const uint=v=>{const n=BigInt(v);if(n<0n)throw Error('INVALID_EVENT');return n;};
const address=v=>{if(!/^0x[0-9a-f]{40}$/i.test(v)||v.toLowerCase()===ZERO)throw Error('INVALID_WALLET');return v.toLowerCase();};
export function buildGrowthReport({events,opening=null,snapshotBlock,budgetWei=GROWTH_CAMPAIGN.budgetWei}={}){
  if(!Array.isArray(events)||!Number.isSafeInteger(snapshotBlock)||snapshotBlock<0)throw Error('INVALID_SNAPSHOT');
  const budget=uint(budgetWei),unique=new Map();
  for(const row of events){
    for(const k of ['block','transactionIndex','index'])if(!Number.isSafeInteger(row[k])||row[k]<0)throw Error('INVALID_EVENT');
    if(row.block>snapshotBlock||row.removed)throw Error('UNCONFIRMED_EVENT');
    if(!/^0x[0-9a-f]{64}$/i.test(row.hash))throw Error('INVALID_HASH');
    const id=uint(row.identityId),ref=uint(row.referrerId),cost=uint(row.costWei);
    if(id===0n||!Number.isInteger(row.shares)||row.shares<1||row.shares>10||![0,1].includes(row.freeShares)||row.freeShares>row.shares||(cost===0n)!==(row.shares===row.freeShares))throw Error('INVALID_EVENT');
    const e={...row,identityId:String(id),referrerId:String(ref),costWei:cost,wallet:address(row.wallet)};
    if(ref!==0n&&row.referrerWallet!==undefined)e.referrerWallet=address(row.referrerWallet);
    const key=row.hash.toLowerCase()+':'+row.index;
    if(unique.has(key)){if(JSON.stringify(unique.get(key),(_,v)=>typeof v==='bigint'?String(v):v)!==JSON.stringify(e,(_,v)=>typeof v==='bigint'?String(v):v))throw Error('CONFLICTING_EVENT');continue;}
    unique.set(key,e);
  }
  if(opening){for(const k of ['block','transactionIndex'])if(!Number.isSafeInteger(opening[k])||opening[k]<0||opening.block>snapshotBlock)throw Error('INVALID_OPENING');}
  const rows=[...unique.values()].sort(cmp),firstPaid=new Set(),bindings=new Map(),teams=new Map(),rebates=[];
  let used=0n,budgetStopped=false;
  for(const e of rows){
    if(bindings.has(e.identityId)&&bindings.get(e.identityId)!==e.referrerId)throw Error('REFERRER_CHANGED');
    bindings.set(e.identityId,e.referrerId);
    if(e.costWei===0n||firstPaid.has(e.identityId))continue;
    firstPaid.add(e.identityId);
    if(e.referrerId==='0'||e.referrerId===e.identityId)continue;
    e.referrerWallet=address(e.referrerWallet);
    if(e.referrerWallet===e.wallet)continue;
    // Include the Mint that opened the pool: its Minted log follows Opened.
    const beforeOpening=!opening||e.block<opening.block||e.block===opening.block&&e.transactionIndex<=opening.transactionIndex;
    if(beforeOpening){const team=teams.get(e.referrerId)||{identityId:e.referrerId,wallet:e.referrerWallet,score:0,reached:e};team.score++;team.reached=e;teams.set(e.referrerId,team);}
    const perSide=e.costWei*500n/10000n,total=perSide*2n;
    const eligible=!budgetStopped&&used+total<=budget;
    if(!eligible)budgetStopped=true;
    if(eligible)used+=total;
    rebates.push({claimId:'paid-invite:'+e.identityId,identityId:e.identityId,referrerId:e.referrerId,
      hash:e.hash,block:e.block,buyerWallet:e.wallet,inviterWallet:e.referrerWallet,
      mintCostWei:e.costWei,buyerWei:eligible?perSide:0n,inviterWei:eligible?perSide:0n,
      eligible,reason:eligible?'accrued-awaiting-project-transfer':'budget-limit',payoutVerified:false});
  }
  const ranked=[...teams.values()].sort((a,b)=>b.score-a.score||cmp(a.reached,b.reached)||a.identityId.localeCompare(b.identityId));
  const leaderboard=ranked.map((v,i)=>({...v,rank:i+1,prizeEcho:BigInt(GROWTH_CAMPAIGN.leaderboard.prizesEcho[i]||'0'),settled:!!opening,payoutVerified:false}));
  return {campaignId:GROWTH_CAMPAIGN.id,snapshotBlock,budgetWei:budget,committedWei:used,remainingWei:budget-used,budgetStopped,
    eligibleOrders:rebates.filter(v=>v.eligible).length,rebates,leaderboard,settled:!!opening,opening,
    automaticPayout:false,payoutVerified:false};
}
