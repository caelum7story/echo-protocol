const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const positive=v=>BigInt(v??0)>0n;

export function hasWalletRecord(state) {
  const who=state.who, p=who?.position;
  return !!who && (positive(who.creditWei)||positive(who.principalWei)||who.refunded===true||
    !!p&&(positive(p.units)||positive(p.principalWei)||positive(p.revision)||p.delivered===true));
}

// Bounded discovery. It never claims to discover positions under old .ai identities.
export async function walletRecordsPage({registry,client,wallet,handle,mode,offset,limit,blockNumber}) {
  if(!['records','manage'].includes(mode)||!Number.isSafeInteger(offset)||offset<0||
    !Number.isSafeInteger(limit)||limit<1||limit>3)throw Error('INVALID_WALLET_PAGE');
  const [addresses,total]=await Promise.all([
    registry.listProjects(offset,limit,{blockTag:blockNumber}),
    registry.projectCount({blockTag:blockNumber})
  ]);
  if(addresses.length>limit)throw Error('WALLET_PAGE_PROVENANCE');
  const records=[];
  // Sequential snapshots keep RPC load and request memory bounded.
  for(const project of addresses) {
    const record=await registry.projects(project,{blockTag:blockNumber});
    const createdByWallet=same(record.creator,wallet);
    if(mode==='manage'&&!createdByWallet)continue;
    const state=await client.historicalSnapshot(project,{blockNumber,wallet,handle:handle||undefined});
    if(!same(state.project,project)||state.blockNumber!==blockNumber||!same(state.who?.wallet,wallet))
      throw Error('WALLET_PAGE_PROVENANCE');
    if(createdByWallet||hasWalletRecord(state))records.push({project,createdByWallet,state});
  }
  const next=offset+addresses.length;
  if(BigInt(next)<BigInt(total)&&addresses.length===0)throw Error('WALLET_PAGE_PROVENANCE');
  return {wallet,handle:handle||null,mode,records,scanned:addresses.length,registryTotal:String(total),
    nextOffset:BigInt(next)<BigInt(total)?next:null,coverage:'current-identity-and-wallet-credit',
    historicalIdentitiesIncluded:false,financialExecutionAllowed:false};
}
