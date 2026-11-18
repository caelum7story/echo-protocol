import {REFERRAL_STORAGE_KEY,createReferralState,parseReferralLink,buildReferralLink,hydrateReferralState,withPendingReferral,resolveReferral,recordReferralOrder,mintTotals,mintEligibility} from './referral.mjs';

export function initReferralUI({identity,toast,openModal,baseUrl}){
  const $=id=>document.getElementById(id);let state=createReferralState(),persistence=true,lastReceipt=null;
  try{state=hydrateReferralState(localStorage.getItem(REFERRAL_STORAGE_KEY));}catch{persistence=false;}
  const incoming=parseReferralLink(baseUrl);if(incoming.referrer)state=withPendingReferral(state,incoming.referrer);
  function save(){try{localStorage.setItem(REFERRAL_STORAGE_KEY,JSON.stringify(state));}catch{persistence=false;}}
  function sourceMessage(source){if(source.status==='self')return '当前名称与分享人相同，不计邀请。';if(source.status==='locked')return source.referrer?'本机首单来源已记录，后续链接不会改写原归属。':'本机首单没有邀请来源，后续链接不会追溯新增。';return '确认模拟订单时记录来源。正式归属仍需身份与链上事件核验。';}
  function line(label,value){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);return row;}
  function render(){
    const name=identity(true),resolved=name?resolveReferral(state,name):null,source=resolved?.status==='locked'?resolved.referrer:state.pendingReferrer;
    $('referral-banner').hidden=!source&&resolved?.status!=='locked';$('referral-name').textContent=source?`由 ${source} 分享给你`:'首单未关联邀请人';$('referral-message').textContent=resolved?sourceMessage(resolved):'填写自己的 .ai 名称以预览来源。';
    $('share-identity-label').textContent=name?`${name} · 未核验`:'先填写上方 .ai 名称';$('my-invite-link').value=name?buildReferralLink(baseUrl,name):'';$('copy-invite-link').disabled=!name;
    $('my-referral-count').textContent=`我的首单邀请演示：${state.bindings.filter(b=>b.referrer===name).length}`;
    $('referral-storage-note').textContent=persistence?'来源和订单保存在这个浏览器，刷新后保留；它们不是链上订单，不产生佣金。':'当前浏览器无法保存全部记录。本次会话仍可体验，记录不是链上订单。';
    $('referral-orders').replaceChildren();
    for(const order of state.orders.slice(0,5)){const article=document.createElement('article');article.className='referral-order';const top=document.createElement('div');top.className='referral-order-top';const id=document.createElement('strong'),buyer=document.createElement('span'),detail=document.createElement('p'),status=document.createElement('small');id.textContent=order.id;buyer.textContent=order.identity;top.append(id,buyer);detail.textContent=`${order.quantity} 份模拟 Mint · 来源：${order.referrer||'无'}`;status.textContent=order.attributionEligible?'首单来源已记录 · 本机演示，未产生奖励':'无新增首单奖励 · 本机演示';article.append(top,detail,status);$('referral-orders').append(article);}
    $('referral-orders-empty').hidden=state.orders.length>0;document.dispatchEvent(new Event('echo:referral'));
  }
  $('agent-name').addEventListener('input',render);
  window.addEventListener('storage',e=>{if(e.key!==REFERRAL_STORAGE_KEY)return;try{state=hydrateReferralState(e.newValue);render();}catch{toast('其他标签页记录无效，未载入。');}});
  save();render();if(incoming.invalid)toast('分享标识无效，未新增邀请来源。');
  return {
    resolve:name=>resolveReferral(state,name),orders:()=>state.orders.map(order=>({...order})),
    totals:()=>mintTotals(state),eligibility:name=>mintEligibility(state,name),
    record(q){const result=recordReferralOrder(state,{identity:q.identity,quantity:q.quantity,expectedQuote:q,expectedReferrer:q.invitation.referrer});state=result.state;lastReceipt=result.order;save();render();return lastReceipt;},
    decorate(kicker,q){if(kicker==='ECHO / MINT PREVIEW'&&q?.invitation)$('modal-body').querySelector('.quote-details')?.append(line('邀请来源 · 未核验',q.invitation.referrer||'无'),line('首单归属',q.invitation.firstOrder?'确认本次模拟订单时记录':'沿用原归属，不新增奖励'));
      if(kicker==='ECHO / DEMO COMPLETE'&&lastReceipt){const block=document.createElement('dl');block.className='quote-details';block.append(line('本机模拟订单',lastReceipt.id),line('邀请来源',lastReceipt.referrer||'无'),line('归属状态',lastReceipt.attributionEligible?'首单来源已记录，无真实佣金':'无新增首单奖励'));$('modal-body').insertBefore(block,$('modal-body').querySelector('button'));}}
  };
}
