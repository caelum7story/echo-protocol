import {formatBnb} from './core.mjs';
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<(1n<<256n);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function checkParticipantProof(proof,state,wallet){
 const invalid=()=>{throw Error('RUNTIME_PARTICIPANT_INVALID');};
 if(proof?.schema!=='echo-launch-participant-proof/v1'||!same(proof.wallet,wallet)||!same(proof.project,state.project)||proof.kind!==state.kind||proof.blockNumber!==state.blockNumber||proof.blockHash!==state.blockHash||
  proof.executionReady!==false||proof.financialExecutionAllowed!==false||proof.historical!==true||!['no-subscription','subscribing','awaiting-finalization','awaiting-liquidity','claimable','delivery-confirmed','refundable','refund-credit','refund-paid','exit-credit','exit-paid','mixed-credit'].includes(proof.status)||
  !['subscribedUnits','activeUnits','deliveredUnits','claimableUnits','refundablePrincipalWei','refundCreditedWei','exitRefundCreditedWei','totalCreditedWei','withdrawnBnbWei','availableCreditWei','holdingBalance'].every(k=>uint(proof[k]))||
  proof.holdingUnit!==(state.kind===1?'nft-count':'token-wei')||BigInt(proof.withdrawnBnbWei)+BigInt(proof.availableCreditWei)!==BigInt(proof.totalCreditedWei)||proof.availableCreditWei!==state.who?.creditWei||
  !Array.isArray(proof.receiptProofs)||proof.receiptProofs.length>100||proof.receiptProofs.some(r=>r.status!==1||!/^0x[0-9a-fA-F]{64}$/.test(r.transactionHash)||!/^0x[0-9a-fA-F]{64}$/.test(r.blockHash)||!Number.isSafeInteger(r.blockNumber)||r.blockNumber>state.blockNumber))invalid();
 if(BigInt(proof.refundCreditedWei)+BigInt(proof.exitRefundCreditedWei)>BigInt(proof.totalCreditedWei)||BigInt(proof.activeUnits)>BigInt(proof.subscribedUnits)||BigInt(proof.deliveredUnits)>BigInt(proof.subscribedUnits)||BigInt(proof.claimableUnits)>BigInt(proof.activeUnits)||(proof.subscribedUnits!=='0'||proof.totalCreditedWei!=='0')&&!proof.receiptProofs.length)invalid();
 if(!['none','refund-only','early-exit-only','mixed'].includes(proof.creditScope))invalid();
 const total=proof.receiptProofsTotal??proof.receiptProofs.length,history=proof.verifiedHistory;
 if(!Number.isSafeInteger(total)||total<proof.receiptProofs.length||new Set(proof.receiptProofs.map(r=>r.transactionHash.toLowerCase())).size!==proof.receiptProofs.length||proof.receiptProofs.some(r=>r.blockNumber<0)||
  proof.receiptProofsTotal!==undefined&&proof.receiptPreviewTruncated!==(total>proof.receiptProofs.length))invalid();
 if(total>proof.receiptProofs.length||history){if(history?.complete!==true||proof.receiptProofs.length>50||!/^[a-f0-9]{48}$/.test(history.scanId??'')||history.blockNumber!==state.blockNumber||history.blockHash!==state.blockHash||history.receiptCount!==total||!Number.isSafeInteger(history.eventCount)||history.eventCount<total)invalid();}
 if(proof.status==='refund-paid'&&(!proof.refundPayoutAttributed||proof.refundCreditedWei==='0'||proof.availableCreditWei!=='0'||proof.withdrawnBnbWei!==proof.totalCreditedWei))invalid();
 if(proof.status!=='refund-paid'&&proof.refundPayoutAttributed!==false||proof.status==='claimable'&&proof.claimableUnits==='0'||proof.status==='refundable'&&proof.refundablePrincipalWei==='0'||proof.status==='delivery-confirmed'&&proof.deliveredUnits==='0')invalid();
 return proof;
}
export function participantView(proof,state,lang='zh'){
 checkParticipantProof(proof,state,proof.wallet);const t=(zh,en)=>lang==='en'?en:zh;
 const labels={
  'no-subscription':t('未查到原始认购权益','No original subscription'),subscribing:t('认购权益已记录','Subscription recorded'),
  'awaiting-finalization':t('已售罄，等待结算','Sold out; awaiting finalization'),'awaiting-liquidity':t('等待建池结果','Awaiting liquidity'),
  claimable:state.kind===1?t('NFT 可领取','NFTs ready to claim'):t('代币尚待交付','Token delivery pending'),
  'delivery-confirmed':t('已核验累计交付','Cumulative delivery verified'),refundable:t('可申请本金退款','Principal refund available'),
  'refund-credit':t('退款已记账，尚未全部支付','Refund credited; payment outstanding'),'refund-paid':t('退款记账款已核验付清','Refund credits paid in full'),
  'exit-credit':t('提前退出款已记账','Early-exit credit recorded'),'exit-paid':t('提前退出记账款已付清','Early-exit credits paid'),
  'mixed-credit':t('含多类记账，需分别核对','Mixed credits; reconcile separately')};
 const help={
  refundable:t('按固定规则退认购本金，Gas 不退。申请退款与提取记账余额是两个步骤，本页不会提交交易。','Principal is refundable under fixed rules; gas is not. Recording a refund and withdrawing its credit are separate steps. This page submits neither.'),
  claimable:state.kind===1?t('对应编号的 NFT 尚未全部交付。交给 Agent 重新核对预留编号、领取条件和 Gas 后，再单独确认。','Reserved NFTs remain undelivered. Ask your Agent to recheck IDs, eligibility and gas before a separate confirmation.'):
   t('建池后仍有待交付代币。平台分批派发与用户兜底领取共用同一权益，须核验真实 Transfer 回执。','Tokens remain due after pool creation. Platform batching and fallback self-claim share one entitlement; verify actual Transfer receipts.'),
  'delivery-confirmed':t('累计交付由成功回执及同笔资产 Transfer 共同核验；当前持仓已单列，转出不会被误记为尚未到账。','Successful receipts and matching asset Transfers prove cumulative delivery. Current holdings are separate; later transfers out do not erase delivery.'),
  'mixed-credit':t('累计提取可能同时包含退出款、退款或项目收益，不能把部分提取全部归到某一笔退款。所有记账款付清后，才能核验全部退款已支付。','Withdrawals may include exit, refund or proceeds credits. A partial withdrawal is not wholly attributed to one refund. Full settlement can prove all refund credits were paid.')
 };
 const row=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`,bnb=value=>formatBnb(BigInt(value))+' BNB';
 const unit=state.kind===1?'NFT':t('枚代币','tokens'),holding=state.kind===1?proof.holdingBalance:formatBnb(BigInt(proof.holdingBalance));
 return `<section class="participant-proof"><div class="section-heading"><h2>${t('原钱包的收款与交付','Original-wallet payment & delivery')}</h2><span class="tag">${esc(labels[proof.status])}</span></div><p>${help[proof.status]??t('只读快照不构成签名或付款授权；有余额或待交付权益时，先由 Agent 重新核对。','A read-only observation grants no signing or payment authority. Your Agent must recheck any remaining credit or entitlement.')}</p><dl class="facts runtime-facts">${row(t('累计认购 · 含已退出','Lifetime subscribed · Includes exits'),esc(proof.subscribedUnits)+' '+unit)}${row(t('累计已交付','Cumulative delivered'),esc(proof.deliveredUnits)+' '+unit)}${row(t('成功后尚待交付','Due after successful settlement'),esc(proof.claimableUnits)+' '+unit)}${row(t('当前资产余额 · 含转入/转出','Current holdings · Includes transfers'),esc(holding)+' '+unit)}${row(t('可退本金 · 尚未记账','Refundable principal · Not yet credited'),bnb(proof.refundablePrincipalWei))}${row(t('累计退款记账','Cumulative refund credits'),bnb(proof.refundCreditedWei))}${row(t('累计提前退出款记账','Cumulative early-exit credits'),bnb(proof.exitRefundCreditedWei))}${row(t('当前可提取 BNB 记账额','Current withdrawable BNB credit'),bnb(proof.availableCreditWei))}${row(t('累计已提取 BNB · 可能含多类款项','BNB withdrawn · May include mixed credits'),bnb(proof.withdrawnBnbWei))}</dl><details><summary>${t('核对成功回执','Successful receipt proofs')} · ${proof.receiptProofsTotal??proof.receiptProofs.length}${(proof.receiptProofsTotal??proof.receiptProofs.length)>proof.receiptProofs.length?' · '+t('预览','Preview')+' '+proof.receiptProofs.length:''}</summary><div class="runtime-events">${proof.receiptProofs.map(r=>`<article><small>${t('本地区块','Local block')} ${r.blockNumber}</small><code>${esc(r.transactionHash)}</code></article>`).join('')}</div></details></section>`;
}
