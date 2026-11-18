import {launchInterface,DEPLOYMENT,identityId} from './chain.mjs';
import {buildGrowthReport} from './growth-campaign.mjs';
export async function readGrowthReport(client,{confirmations=20,onProgress=()=>{}}={}){
  await client.verifyDeployment();
  const latest=Number(BigInt(await client.provider.send('eth_blockNumber',[]))),snapshotBlock=latest-confirmations;
  if(!Number.isSafeInteger(snapshotBlock)||snapshotBlock<DEPLOYMENT.block)throw Error('SNAPSHOT_NOT_READY');
  const atSnapshot={blockTag:snapshotBlock};
  const [totalPaid,opened]=await Promise.all([client.launch.totalPaid(atSnapshot),client.launch.opened(atSnapshot)]);
  // totalPaid only increases in the pinned launch contract. At zero, no paid
  // invitation can exist through this same confirmed block. Opened pools still
  // use the event history so their settlement transaction is retained.
  if(totalPaid===0n&&opened===false){
    const report=buildGrowthReport({events:[],snapshotBlock});
    return {...report,latestBlock:latest,confirmations,source:'verified-echo-launch-counter',coverageFromBlock:DEPLOYMENT.block,
      zeroPaidEvidence:{block:snapshotBlock,totalPaid:'0',opened:false}};
  }
  const mintedTopic=launchInterface.getEvent('Minted').topicHash,openedTopic=launchInterface.getEvent('Opened').topicHash;
  const logs=[];
  for(let from=DEPLOYMENT.block;from<=snapshotBlock;from+=5000){const to=Math.min(from+4999,snapshotBlock);logs.push(...await client.provider.getLogs({address:DEPLOYMENT.launch,topics:[[mintedTopic,openedTopic]],fromBlock:from,toBlock:to}));onProgress({fromBlock:from,toBlock:to,snapshotBlock});}
  const parsed=logs.filter(v=>!v.removed).map(v=>({log:v,event:launchInterface.parseLog(v)}));
  const open=parsed.filter(v=>v.event?.name==='Opened').sort((a,b)=>a.log.blockNumber-b.log.blockNumber||a.log.index-b.log.index)[0];
  const events=parsed.filter(v=>v.event?.name==='Minted').map(({log:l,event:e})=>({hash:l.transactionHash,block:l.blockNumber,transactionIndex:l.transactionIndex,index:l.index,wallet:e.args.wallet,identityId:String(e.args.identityId),referrerId:String(e.args.referrerId),shares:Number(e.args.shares),freeShares:Number(e.args.freeShares),costWei:String(e.args.cost),removed:false}));
  const owners=new Map(),seenPaid=new Set();events.sort((a,b)=>a.block-b.block||a.transactionIndex-b.transactionIndex||a.index-b.index);
  for(const e of events){if(BigInt(e.costWei)===0n||seenPaid.has(e.identityId))continue;seenPaid.add(e.identityId);if(e.referrerId==='0')continue;const key=e.referrerId+':'+e.block;if(!owners.has(key))owners.set(key,await client.registry.ownerOf(BigInt(e.referrerId),{blockTag:e.block}));e.referrerWallet=owners.get(key);}
  const report=buildGrowthReport({events,opening:open?{block:open.log.blockNumber,transactionIndex:open.log.transactionIndex,hash:open.log.transactionHash}:null,snapshotBlock});
  const walletBlock=report.opening?.block??snapshotBlock;
  for(const team of report.leaderboard){const wallet=await client.registry.ownerOf(BigInt(team.identityId),{blockTag:walletBlock});team.wallet=wallet;const handle=await client.registry.handleOf(wallet,{blockTag:walletBlock});team.name=handle&&identityId(handle)===BigInt(team.identityId)?handle+'.ai':null;}
  return {...report,latestBlock:latest,confirmations,source:'verified-echo-launch-events',coverageFromBlock:DEPLOYMENT.block};
}

export function growthClaims(report){
  const claims=[];
  for(const row of report.rebates.filter(v=>v.eligible)){
    claims.push({id:row.claimId+':buyer',asset:'BNB',to:row.buyerWallet,amount:BigInt(row.buyerWei)});
    claims.push({id:row.claimId+':inviter',asset:'BNB',to:row.inviterWallet,amount:BigInt(row.inviterWei)});
  }
  if(report.settled)for(const team of report.leaderboard.filter(v=>v.prizeEcho>0n))claims.push({id:'team-prize:'+team.identityId,asset:'ECHO',to:team.wallet,amount:BigInt(team.prizeEcho)*10n**18n});
  return claims;
}

export async function reconcileGrowthPayouts(client,report,records=[]){
  if(!Array.isArray(records))throw Error('INVALID_PAYOUT_LEDGER');
  const claims=growthClaims(report),byId=new Map(claims.map(v=>[v.id,v])),paid=new Set(),hashes=new Set();
  for(const record of records){
    if(!/^0x[0-9a-f]{64}$/i.test(record.txHash)||!Array.isArray(record.claimIds)||!record.claimIds.length)throw Error('INVALID_PAYOUT_RECORD');
    const hash=record.txHash.toLowerCase();if(hashes.has(hash))throw Error('DUPLICATE_PAYOUT_TRANSACTION');hashes.add(hash);
    const group=record.claimIds.map(id=>{if(paid.has(id)||!byId.has(id))throw Error('DUPLICATE_OR_UNKNOWN_CLAIM');paid.add(id);return byId.get(id);});
    const first=group[0];if(group.some(v=>v.asset!==first.asset||v.to.toLowerCase()!==first.to.toLowerCase()))throw Error('PAYOUT_GROUP_MISMATCH');
    const amount=group.reduce((n,v)=>n+v.amount,0n),[receipt,tx]=await Promise.all([client.provider.getTransactionReceipt(hash),client.provider.getTransaction(hash)]);
    if(receipt?.status!==1||!tx||tx.chainId!==56n||tx.from.toLowerCase()!==DEPLOYMENT.config.treasury.toLowerCase()||receipt.blockNumber>report.snapshotBlock)throw Error('PAYOUT_NOT_CONFIRMED');
    if(first.asset==='BNB'){
      if(tx.to?.toLowerCase()!==first.to.toLowerCase()||tx.value!==amount)throw Error('PAYOUT_AMOUNT_OR_RECIPIENT_MISMATCH');
    }else{
      let transferred=0n;
      for(const log of receipt.logs){if(log.address.toLowerCase()!==DEPLOYMENT.token.toLowerCase())continue;try{const e=client.token.interface.parseLog(log);if(e?.name==='Transfer'&&e.args.from.toLowerCase()===DEPLOYMENT.config.treasury.toLowerCase()&&e.args.to.toLowerCase()===first.to.toLowerCase())transferred+=e.args.value;}catch{}}
      if(transferred!==amount)throw Error('PAYOUT_AMOUNT_OR_RECIPIENT_MISMATCH');
    }
  }
  return {...report,paymentReconciliation:{verifiedTransactions:hashes.size,paidClaims:paid.size,unpaidClaims:claims.filter(v=>!paid.has(v.id)),automaticPayout:false}};
}
