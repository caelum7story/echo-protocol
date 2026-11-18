import {AbiCoder, Interface, keccak256,encodeBytes32String} from 'ethers';
import {artifacts} from './protocol.mjs';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const fail=code=>{throw Error(code);};
const saleInterface=new Interface(artifacts.TokenLaunch.abi);
const tokenInterface=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const keyFor=(id,wallet)=>keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address'],[id,wallet]));

// Read-only proof of this transaction, not proof that it matches a previously signed quote.
export async function verifyLaunchReceipt({provider,snapshot,wallet,hash,context}){
 if(!/^0x[\da-f]{64}$/i.test(hash??''))fail('INVALID_TRANSACTION_HASH');
 if(snapshot.kind!==2)fail('NFT_PUBLIC_STORAGE_DEFERRED');
 const project=snapshot.project;
 const [tx,r]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)]);
 const result={transactionHash:hash,project,wallet,confirmed:false,paymentConfirmed:false,deliveryConfirmed:false,financialExecutionAllowed:false};
 if(!tx||!r)return {...result,stage:'pending-or-not-found'};
 if(!same(tx.to,project)||!same(r.to,project)||!same(tx.hash,hash)||!same(r.hash,hash))fail('RECEIPT_PROJECT_MISMATCH');
 if(r.blockNumber>context.number)return {...result,stage:'awaiting-confirmations'};
 const block=await provider.getBlock(r.blockNumber);
 if(!block||!same(block.hash,r.blockHash))fail('RECEIPT_REORG');
 let call;try{call=saleInterface.parseTransaction({data:tx.data,value:tx.value});}catch{fail('RECEIPT_METHOD_UNSUPPORTED');}
 if(!call)fail('RECEIPT_METHOD_UNSUPPORTED');
 const ownCall=['subscribe','exitAll','claim'].includes(call.name);
 if(ownCall&&!same(tx.from,wallet))fail('RECEIPT_WALLET_MISMATCH');
 if(call.name==='refundFor'&&!same(call.args.wallet,wallet)||call.name==='withdrawCreditFor'&&!same(call.args.recipient,wallet))fail('RECEIPT_WALLET_MISMATCH');
 if(!['subscribe','exitAll','refundFor','claim','distribute','withdrawCreditFor'].includes(call.name))fail('RECEIPT_METHOD_UNSUPPORTED');
 if(r.status!==1)return {...result,stage:'transaction-failed',method:call.name};
 const events=r.logs.filter(l=>!l.removed&&same(l.address,project)).map(l=>{try{return saleInterface.parseLog(l);}catch{return null;}}).filter(Boolean);
 const single=(name,predicate)=>{const rows=events.filter(e=>e.name===name&&predicate(e.args));if(rows.length!==1)fail('RECEIPT_EVENT_MISMATCH');return rows[0].args;};
 const out={...result,confirmed:true,method:call.name,blockNumber:r.blockNumber,blockHash:r.blockHash,confirmedAtBlock:context.number};
 if(call.name==='subscribe'){
  const e=single('Subscribed',a=>same(a.wallet,wallet)&&a.identityId===call.args.identityId&&a.units===call.args.units&&a.principal===tx.value&&same(a.key,keyFor(a.identityId,wallet)));
  single('SubscriptionRequestRecorded',a=>same(a.wallet,wallet)&&same(a.requestId,call.args.requestId)&&a.identityId===e.identityId&&a.units===e.units&&a.principal===e.principal&&a.deadline===call.args.deadline);
  if(e.units<=0n||e.principal<=0n||e.principal!==e.units*BigInt(snapshot.base.unitPrice))fail('RECEIPT_AMOUNT_MISMATCH');
  return {...out,stage:'subscription-recorded',units:String(e.units),amountWei:String(e.principal)};
 }
 if(tx.value!==0n)fail('RECEIPT_VALUE_MISMATCH');
 if(call.name==='withdrawCreditFor'){
  const e=single('CreditWithdrawn',a=>same(a.recipient,wallet)&&a.amount>0n);
  return {...out,stage:'bnb-paid',paymentConfirmed:true,amountWei:String(e.amount)};
 }
 if(call.name==='refundFor'||call.name==='exitAll'){
  const e=single(call.name==='refundFor'?'Refunded':'Exited',a=>same(a.key,keyFor(call.args.identityId,wallet))&&a.principal>0n);
  const amount=call.name==='refundFor'?e.principal:e.refund;
  if(call.name==='exitAll'&&(e.fee!==e.principal*5n/100n||e.refund!==e.principal-e.fee))fail('RECEIPT_AMOUNT_MISMATCH');
  single('CreditAdded',a=>same(a.recipient,wallet)&&a.amount===amount&&a.reason===encodeBytes32String(call.name==='refundFor'?'TOKEN_REFUND':'EARLY_EXIT_REFUND'));
  return {...out,stage:'credit-recorded',amountWei:String(amount),feeWei:String(call.name==='refundFor'?0n:e.fee)};
 }
 const delivered=events.filter(e=>e.name==='Delivered'&&same(e.args.wallet,wallet)&&e.args.amount>0n);
 if(!delivered.length)fail('RECEIPT_DELIVERY_MISMATCH');
 const seen=new Set();let amount=0n;
 for(const e of delivered){const key=e.args.key.toLowerCase();if(seen.has(key))fail('RECEIPT_DELIVERY_MISMATCH');seen.add(key);amount+=e.args.amount;}
 if(call.name==='claim'&&(delivered.length!==1||!same(delivered[0].args.key,keyFor(call.args.identityId,wallet))))fail('RECEIPT_DELIVERY_MISMATCH');
 if(call.name==='distribute'&&delivered.some(e=>!call.args[0].some(k=>same(k,e.args.key))))fail('RECEIPT_DELIVERY_MISMATCH');
 const transfers=r.logs.filter(l=>!l.removed&&same(l.address,snapshot.extra.token)).map(l=>{try{return tokenInterface.parseLog(l);}catch{return null;}}).filter(e=>e?.name==='Transfer'&&same(e.args.from,project)&&same(e.args.to,wallet));
 if(transfers.reduce((sum,e)=>sum+e.args.value,0n)!==amount)fail('RECEIPT_TOKEN_TRANSFER_MISMATCH');
 return {...out,stage:'tokens-delivered',deliveryConfirmed:true,tokenAmountWei:String(amount)};
}
