import fs from 'node:fs';
import {Contract,Interface,ZeroAddress,decodeBytes32String} from 'ethers';
import {jsonSafe} from './agent-client.mjs';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),E18=10n**18n;
const artifacts=Object.fromEntries(['NftLaunch','TokenLaunch','LaunchToken'].map(name=>[name,JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),'utf8'))]));
const fail=()=>{throw Error('PARTICIPANT_PROOF_MISMATCH');};

export async function verifyParticipantEvents({provider,state,rows,loadReceipt=hash=>provider.getTransactionReceipt(hash)}){
 if(rows.length>1000)throw Error('PARTICIPANT_HISTORY_LIMIT');
 const wallet=state.who?.wallet;if(!wallet)throw Error('PARTICIPANT_WALLET_REQUIRED');
 const iface=new Interface(artifacts[state.kind===1?'NftLaunch':'TokenLaunch'].abi),assetIface=new Interface(artifacts.LaunchToken.abi);
 const events=rows.map(row=>({...row,args:JSON.parse(row.args_json)})),hashes=[...new Set(events.map(e=>e.tx_hash))];
 if(hashes.length>100)throw Error('PARTICIPANT_HISTORY_LIMIT');
 const receipts=new Map();
 for(let i=0;i<hashes.length;i+=8)await Promise.all(hashes.slice(i,i+8).map(async hash=>{
  const receipt=await loadReceipt(hash);if(!receipt||receipt.status!==1||!same(receipt.hash,hash)||!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<0||receipt.blockNumber>state.blockNumber||!Array.isArray(receipt.logs))fail();receipts.set(hash,receipt);
 }));
 for(const event of events){const receipt=receipts.get(event.tx_hash),log=receipt.logs.find(log=>log.index===event.log_index&&same(log.address,state.project));
  if(!log||receipt.blockNumber!==event.block_number||!same(receipt.blockHash,event.block_hash))fail();
  let parsed;try{parsed=iface.parseLog(log);}catch{fail();}if(!parsed||parsed.name!==event.name||JSON.stringify(jsonSafe(parsed.args.toObject()))!==JSON.stringify(event.args))fail();
  if(event.name==='Delivered'){
   const a=event.args,amount=state.kind===1?1n:BigInt(a.amount);
   if(!same(a.wallet,wallet)||state.kind===2&&amount%E18!==0n)fail();
   const transfer=receipt.logs.some(log=>{if(!same(log.address,state.kind===1?state.project:state.extra.token))return false;
    let p;try{p=(state.kind===1?iface:assetIface).parseLog(log);}catch{return false;}
    return p?.name==='Transfer'&&same(p.args.from,state.kind===1?ZeroAddress:state.project)&&same(p.args.to,wallet)&&
     (state.kind===1?p.args.tokenId===BigInt(a.tokenId):p.args.value===amount);});if(!transfer)fail();
  }
 }
 return {events,receipts};
}

export async function readParticipantProof({provider,state,rows}){
 const {events,receipts}=await verifyParticipantEvents({provider,state,rows}),wallet=state.who.wallet;
 const sale=new Contract(state.project,artifacts[state.kind===1?'NftLaunch':'TokenLaunch'].abi,provider),at={blockTag:state.blockNumber};
 const subscribed=events.filter(e=>e.name==='Subscribed'&&same(e.args.wallet,wallet)),keys=[...new Set(subscribed.map(e=>e.args.key).filter(Boolean))];
 let subscribedUnits=0n,activeUnits=0n,principal=0n,deliveredUnits=0n,refundCredited=0n,exitCredited=0n,totalCredit=0n,withdrawn=0n;
 const creditReasons=new Set(),deliveredKeys=new Set();
 for(const event of events){const a=event.args;
  if(event.name==='Subscribed')subscribedUnits+=BigInt(a.count??a.units);
  if(event.name==='CreditAdded'){
   totalCredit+=BigInt(a.amount);let reason;try{reason=decodeBytes32String(a.reason);}catch{reason='UNKNOWN';}creditReasons.add(reason);
   if(reason==='NFT_REFUND'||reason==='TOKEN_REFUND')refundCredited+=BigInt(a.amount);if(reason==='EARLY_EXIT_REFUND')exitCredited+=BigInt(a.amount);
  }
  if(event.name==='CreditWithdrawn')withdrawn+=BigInt(a.amount);
  if(event.name==='Delivered'){
   const amount=state.kind===1?1n:BigInt(a.amount),key=state.kind===1?String(a.tokenId):a.key;
   if(deliveredKeys.has(key)||!same(a.wallet,wallet))fail();deliveredKeys.add(key);
   deliveredUnits+=state.kind===1?1n:amount/E18;
  }
 }
 if(totalCredit-withdrawn!==BigInt(state.who.creditWei)||withdrawn>totalCredit)fail();
 let holdingBalance;
 if(state.kind===1){
  principal=BigInt(state.who.principalWei);if(principal%BigInt(state.base.unitPrice)!==0n||subscribedUnits!==principal/BigInt(state.base.unitPrice))fail();
  activeUnits=state.who.refunded?0n:subscribedUnits;
  const refunds=events.filter(e=>e.name==='Refunded');if(Boolean(refunds.length)!==state.who.refunded||refunds.reduce((n,e)=>n+BigInt(e.args.principal),0n)!==refundCredited)fail();
  holdingBalance=await sale.balanceOf(wallet,at);
 }else{
  let deliveredPositions=0n;
  for(const key of keys){const position=await sale.positions(key,at);if(!same(position.wallet,wallet))fail();activeUnits+=position.units;principal+=position.principal;
   if(position.delivered){if(!deliveredKeys.has(key))fail();deliveredPositions+=position.units;}else if(deliveredKeys.has(key))fail();}
  if(deliveredPositions!==deliveredUnits)fail();
  const refunded=events.filter(e=>e.name==='Refunded').reduce((n,e)=>n+BigInt(e.args.principal),0n),exited=events.filter(e=>e.name==='Exited').reduce((n,e)=>n+BigInt(e.args.refund),0n);
  if(refunded!==refundCredited||exited!==exitCredited)fail();
  holdingBalance=await new Contract(state.extra.token,artifacts.LaunchToken.abi,provider).balanceOf(wallet,at);
 }
 if(deliveredUnits>activeUnits&&refundCredited===0n)fail();
 const finalBlock=await provider.getBlock(state.blockNumber);if(!same(finalBlock?.hash,state.blockHash))throw Error('PARTICIPANT_CURSOR_REORG');
 return participantOutcome({state,stats:{subscribedUnits,activeUnits,principal,deliveredUnits,refundCredited,exitCredited,totalCredit,withdrawn,creditReasons},holdingBalance,
  receiptProofs:[...receipts.values()].map(r=>({transactionHash:r.hash,blockNumber:r.blockNumber,blockHash:r.blockHash,status:r.status}))});
}

export function participantOutcome({state,stats,holdingBalance,receiptProofs,receiptProofsTotal=receiptProofs.length,verifiedHistory=null}){
 const {subscribedUnits,activeUnits,principal,deliveredUnits,refundCredited,exitCredited,totalCredit,withdrawn}=stats,creditReasons=new Set(stats.creditReasons),wallet=state.who.wallet;
 if(totalCredit-withdrawn!==BigInt(state.who.creditWei)||withdrawn>totalCredit||deliveredUnits>activeUnits&&refundCredited===0n)fail();
 const refundOnly=creditReasons.size===1&&['NFT_REFUND','TOKEN_REFUND'].some(reason=>creditReasons.has(reason)),exitOnly=creditReasons.size===1&&creditReasons.has('EARLY_EXIT_REFUND');
 const creditPaid=totalCredit>0n&&withdrawn===totalCredit&&BigInt(state.who.creditWei)===0n;
 const refundable=state.base.refundEligible&&(state.kind===1?!state.who.refunded:principal>0n)?principal:0n;
 const claimable=state.phase==='succeeded'&&activeUnits>deliveredUnits?activeUnits-deliveredUnits:0n;
 let status='no-subscription',suggestedAction='none';
 if(refundable>0n){status='refundable';suggestedAction='review-refund';}
 else if(claimable>0n){status='claimable';suggestedAction='review-delivery';}
 else if(deliveredUnits>0n)status='delivery-confirmed';
 else if(refundCredited>0n){status=creditPaid?'refund-paid':refundOnly?'refund-credit':'mixed-credit';suggestedAction=BigInt(state.who.creditWei)>0n?'review-withdraw':'none';}
 else if(activeUnits>0n){status=state.phase==='awaiting-liquidity'?'awaiting-liquidity':state.phase==='awaiting-finalize'?'awaiting-finalization':'subscribing';}
 else if(exitCredited>0n){status=creditPaid?'exit-paid':exitOnly?'exit-credit':'mixed-credit';suggestedAction=BigInt(state.who.creditWei)>0n?'review-withdraw':'none';}
 else if(totalCredit>0n)status='mixed-credit';
 return jsonSafe({schema:'echo-launch-participant-proof/v1',wallet,project:state.project,kind:state.kind,blockNumber:state.blockNumber,blockHash:state.blockHash,status,suggestedAction,
  subscribedUnits,activeUnits,deliveredUnits,claimableUnits:claimable,refundablePrincipalWei:refundable,refundCreditedWei:refundCredited,exitRefundCreditedWei:exitCredited,
  totalCreditedWei:totalCredit,withdrawnBnbWei:withdrawn,availableCreditWei:state.who.creditWei,holdingBalance,holdingUnit:state.kind===1?'nft-count':'token-wei',
  creditScope:refundOnly?'refund-only':exitOnly?'early-exit-only':totalCredit===0n?'none':'mixed',refundPayoutAttributed:status==='refund-paid',
  receiptProofs,receiptProofsTotal,receiptPreviewTruncated:receiptProofsTotal>receiptProofs.length,verifiedHistory,
  historical:true,executionReady:false,financialExecutionAllowed:false});
}
