import {DEMO,normalizeIdentity,quoteMint,formatBNB} from './model.mjs';
import {initReferralUI} from './referral-ui.mjs';
import {initInteractions} from './interactions.mjs';
import {buildAgentBrief} from './interaction-model.mjs';
import {initGrowth} from './growth.mjs';
import {initLanguage,getLanguage} from './i18n.mjs';

const $=id=>document.getElementById(id);
const number=value=>new Intl.NumberFormat('zh-CN').format(value);
const state={completed:false};
let activeQuote=null,lastFocus=null,toastTimer;
const modal=$('modal');
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const goTo=id=>$(id).scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});

function identity(quiet=false){
  try{const name=normalizeIdentity($('agent-name').value);if(!quiet)$('identity-error').textContent='';return name;}
  catch(error){if(!quiet)$('identity-error').textContent=error.message;return null;}
}
function quote(quiet=false){
  try{const name=identity(true);if(!name)return null;const q=quoteMint($('quantity').value,DEMO.totalShares-referrals.totals().minted,referrals.eligibility(name));if(!quiet)$('quantity-error').textContent='';return q;}
  catch(error){if(!quiet)$('quantity-error').textContent=error.message;return null;}
}
function updateQuote(){
  const name=identity(true),allowance=name?referrals.eligibility(name):null,q=quote();
  $('identity-minted').textContent=allowance?`${allowance.identityMinted} / ${allowance.identityLimit} 份`:'—';
  $('identity-invites').textContent=allowance?`${allowance.successfulInvites} 份`:'—';
  $('identity-remaining').textContent=allowance?`${allowance.identityRemaining} 份`:'—';
  $('identity-free-state').textContent=!allowance?'填写身份查看首免资格':allowance.identityMinted>0?'首份已铸造，后续均付费':allowance.freeRemaining>0?'首份可免费，正式 Gas 另付':'免费名额已用尽，需确认付费';
  $('quote-tokens').textContent=q?number(q.tokens):'—';
  $('auto-paid-cap').textContent=q?`自动付费上限（开盘前）：${formatBNB(DEMO.priceWei*BigInt(q.quantity))} BNB，Gas 另设上限`:'—';
  $('quote-cost').textContent=q?`${formatBNB(q.costWei)} BNB`:'—';
  $('quote-free').textContent=q?`${q.freeQuantity} 份`:'—';
  $('quote-paid').textContent=q?`${q.paidQuantity} 份`:'—';
  $('mint-unit-price').textContent=q?(q.paidQuantity===0?'免费':q.freeQuantity>0?'部分免费':'0.002 BNB'):'—';
  $('mint-form').querySelector('[type=submit]').disabled=!q;
  const value=Number($('quantity').value);
  document.querySelectorAll('[data-quantity]').forEach(button=>{const selected=Number(button.dataset.quantity)===value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=!allowance||Number(button.dataset.quantity)>Math.min(allowance.identityRemaining,DEMO.totalShares-referrals.totals().minted);});
  document.querySelector('[data-action=minus]').disabled=value<=1;
  document.querySelector('[data-action=plus]').disabled=value>=Math.min(DEMO.maximumPerMint,DEMO.totalShares-referrals.totals().minted,allowance?.identityRemaining||0);
  document.dispatchEvent(new Event('echo:quote'));
}
function setQuantity(value){$('quantity').value=String(Math.max(1,Math.min(DEMO.maximumPerMint,DEMO.totalShares-referrals.totals().minted,value)));updateQuote();}
function updateSupply(){
  const totals=referrals.totals();
  $('opening-progress').textContent=`开盘门槛 · 本机演示 ${number(totals.minted)} / 5,000 份（含免费）`;
  $('minted-count').textContent=number(totals.minted);
  $('remaining-count').textContent=`剩余 ${number(DEMO.totalShares-referrals.totals().minted)} 份`;
  $('supply-progress').setAttribute('aria-valuenow',String(totals.minted));
  $('supply-progress').firstElementChild.style.width=`${totals.minted/DEMO.totalShares*100}%`;
  $('free-remaining').textContent=`免费剩余 ${number(Math.max(0,DEMO.freeShares-totals.freeClaimsUsed))} / ${number(DEMO.freeShares)} 份`;
}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function openModal(kicker,html){
  if(!modal.open)lastFocus=document.activeElement;
  $('modal-kicker').textContent=kicker;$('modal-body').innerHTML=html;
  referrals.decorate(kicker,activeQuote);
  if(!modal.open)modal.showModal();
  document.body.style.overflow='hidden';modal.scrollTop=0;
}
function closeModal(){modal.close();}
modal.addEventListener('close',()=>{document.body.style.overflow='';activeQuote=null;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
$('modal-close').addEventListener('click',closeModal);
modal.addEventListener('click',event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();});
function viewOrders(){growth.viewRecords();}
function previewMint(event){
  event.preventDefault();const name=identity(),q=quote();
  if(!name){$('agent-name').focus();return;}if(!q){$('quantity').focus();return;}
  activeQuote={...q,identity:name,invitation:referrals.resolve(name)};state.completed=false;
  openModal('ECHO / MINT PREVIEW',`<h2 id="modal-title">核对你的创世份额。</h2><p><span id="preview-identity"></span> · ${q.quantity} 份演示 Mint</p><div class="modal-amount">${number(q.tokens)}<small>ECHO</small></div><dl class="quote-details"><div><dt>免费份数</dt><dd>${q.freeQuantity} 份</dd></div><div><dt>付费份数</dt><dd>${q.paidQuantity} 份</dd></div><div><dt>模拟支付</dt><dd>${formatBNB(q.costWei)} BNB</dd></div><div><dt>70% 流动性份额</dt><dd>${formatBNB(q.liquidityWei)} BNB</dd></div><div><dt>30% 项目收入份额</dt><dd>${formatBNB(q.treasuryWei)} BNB</dd></div></dl><button class="button button-ink" type="button" id="confirm-demo">确认模拟订单 <span>↗</span></button><p class="modal-note">免铸造费不免网络 Gas；正式签名前核对免费与付费份数。当前仅模拟，不会签名或支付。</p>`);
  $('preview-identity').textContent=name;$('confirm-demo').addEventListener('click',completeDemo,{once:true});
}
function completeDemo(){
  if(state.completed||!activeQuote)return;
  const q=activeQuote;
  let receipt;try{receipt=referrals.record(q);}catch(error){closeModal();updateQuote();toast(error.message);return;}
  state.completed=true;updateSupply();updateQuote();
  openModal('ECHO / DEMO COMPLETE',`<div class="result-mark" aria-hidden="true">↳</div><h2 id="modal-title">你的回响，已被记录。</h2><p>本次模拟了 ${q.quantity} 份 Mint，基础份额 ${number(q.tokens)} ECHO。邀请来源随首单一起记录。</p><button class="button button-ink" type="button" id="share-my-result">生成参与结果卡 ↗</button><button class="button button-ghost share-copy" type="button" id="view-order">查看参与记录 ↗</button><p class="modal-note">这不是链上回执。没有支付 BNB，也没有收到代币；身份额度、免费名额及模拟订单保存在本机，刷新后保留。</p>`);
  $('share-my-result').addEventListener('click',()=>growth.showCard(receipt.id));
  $('view-order').addEventListener('click',viewOrders);
}
function account(){
  const name=identity();if(!name){goTo('mint');$('agent-name').focus();return;}
  const source=referrals.resolve(name);
  openModal('ECHO / YOUR DEMO ID','<h2 id="modal-title"></h2><p>只读身份预览 · 尚未连接钱包或核验身份</p><dl class="quote-details"><div><dt>本机首单状态</dt><dd id="account-first"></dd></div><div><dt>邀请来源</dt><dd id="account-source"></dd></div><div><dt>真实资产或收益</dt><dd>未上线，无可领取资产</dd></div></dl><button class="button button-ink" type="button" id="my-orders">查看本机订单 ↗</button><p class="modal-note">本机记录不代表链上资产或真实参与资格。</p>');
  $('modal-title').textContent=name;$('account-first').textContent=source.firstOrder?'尚无模拟首单':'已有模拟首单';$('account-source').textContent=source.referrer||'无';$('my-orders').addEventListener('click',viewOrders);
}
function agentPrompt(){
  const name=identity(),q=quote();if(!name||!q){goTo('mint');(!name?$('agent-name'):$('quantity')).focus();toast('先填写有效名称并选择份数。');return;}
  const source=referrals.resolve(name);
  openModal('ECHO / AGENT BRIEF','<h2 id="modal-title">复制一次，交给 Agent。</h2><p>核对本次摘要后，把指令发送给自己的 Agent。</p><dl class="quote-details" id="agent-summary"></dl><button class="button button-ink" type="button" id="copy-brief">复制参与指令 ↗</button><p class="agent-copy-state" id="agent-copy-state" role="status">下一步：复制指令 → 发送给 Agent → 返回查询记录</p><details class="agent-instruction-details"><summary>查看完整指令</summary><textarea id="agent-brief" readonly aria-label="ECHO Agent 体验指令"></textarea></details><div class="agent-secondary"><button class="text-button" type="button" id="agent-edit">修改名称与份额 ↗</button><button class="text-button" type="button" id="agent-records">查询我的记录 ↗</button></div><p class="modal-note">ECHO 合约已部署，Mint 暂未开放，当前仍为交互演示，不会签名或支付。</p>');
  for(const [label,value]of [['公开名称 · 未核验',name],['模拟数量',q.quantity+' 份'],['身份累计上限',q.identityLimit+' 份'],['当前已铸',q.identityMinted+' 份'],['邀请增加付费额度',q.successfulInvites+' 份'],['免费份数',q.freeQuantity+' 份'],['付费份数',q.paidQuantity+' 份'],['模拟总费用',formatBNB(q.costWei)+' BNB'],['自动付费上限（开盘前）',formatBNB(DEMO.priceWei*BigInt(q.quantity))+' BNB'],['邀请来源',source.referrer||'无']]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('agent-summary').append(row);}
  $('agent-brief').value=buildAgentBrief({identity:name,quantity:q.quantity,remaining:DEMO.totalShares-referrals.totals().minted,eligibility:referrals.eligibility(name),referrer:source.referrer,firstOrder:source.firstOrder,baseUrl:location.href,language:getLanguage()});
  $('copy-brief').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('agent-brief').value);$('copy-brief').textContent='已复制，发送给 Agent ✓';$('agent-copy-state').textContent='切换到自己的 Agent 粘贴发送，完成后返回查询记录。';toast('指令已复制。');}catch{document.querySelector('.agent-instruction-details').open=true;$('agent-brief').focus();$('agent-brief').select();toast('请长按或使用复制快捷键复制。');}});
  $('agent-edit').addEventListener('click',()=>{closeModal();goTo('mint');$('agent-name').focus();});
  $('agent-records').addEventListener('click',()=>{closeModal();growth.showLocal(name);goTo('activity');});
}
async function copyAgentBrief(){
  const name=identity(),q=quote();if(!name||!q){agentPrompt();return;}const source=referrals.resolve(name);const brief=buildAgentBrief({identity:name,quantity:q.quantity,remaining:DEMO.totalShares-referrals.totals().minted,eligibility:referrals.eligibility(name),referrer:source.referrer,firstOrder:source.firstOrder,baseUrl:location.href,language:getLanguage()});
  try{await navigator.clipboard.writeText(brief);toast('已复制铸造指令，发送给你的 Agent。');}catch{agentPrompt();document.querySelector('.agent-instruction-details').open=true;$('agent-brief').focus();$('agent-brief').select();}
}
function rules(){
  openModal('ECHO / RULES DRAFT','<h2 id="modal-title">参与规则，公开在前。</h2><ol class="detail-list"><li>已确认：全站 1,000 份免费名额，每个 .ai 身份仅首份可免费；基础累计额度 10 份，免费份额计入总量，Gas 另付。</li><li>首免用完后，可在用户预先授权的付款及 Gas 上限内自动付费；未授权或超出上限时停止。</li><li>每直接邀请一个不同身份完成首次铸造，增加 1 份付费额度；免费首铸也算，同一身份仅计一次，不增加全站供应。</li><li>开盘前付费价 0.002 BNB / 份；开盘后数量固定、BNB 单价随市场报价调整。总上限 10,000 份，每份 1,000 ECHO。</li><li>累计铸造 5,000 份（含免费）自动建池，也可由管理员提前建池；建池后继续 Mint，项目 LP 销毁。</li><li>付费收入 70% 建池，30% 每笔即时转入项目地址。总供应量 20% 专门奖励，建池另配代币。</li><li>不设截止时间，不退款。买税 1%、常规卖税 2%，开盘后前 30 分钟卖税为 30%，由开盘时开始计时。</li><li>当前不执行真实支付或交易，不承诺固定收益。</li></ol><p class="modal-note">正式参与前，需要核验身份、合约、来源、金额与 Gas，并由你确认具体交易。</p>');
}

$('mint-form').addEventListener('submit',previewMint);
$('quantity').addEventListener('input',updateQuote);
$('agent-name').addEventListener('change',()=>identity());
$('agent-name').addEventListener('blur',()=>{const name=identity(true);if(name)$('agent-name').value=name.slice(0,-3);});
document.querySelectorAll('[data-quantity]').forEach(button=>button.addEventListener('click',()=>setQuantity(Number(button.dataset.quantity))));
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.action;
  if(action==='minus')setQuantity((Number($('quantity').value)||1)-1);
  if(action==='plus')setQuantity((Number($('quantity').value)||1)+1);
  if(action==='agent')interactions.entry();
  if(action==='copy-agent')copyAgentBrief();
  if(action==='account')account();
  if(action==='rules')rules();
}));
if('IntersectionObserver'in window){
  const observer=new IntersectionObserver(entries=>{$('mobile-mint-bar').classList.toggle('is-hidden',entries.some(entry=>entry.isIntersecting));},{threshold:.5});
  observer.observe($('mint-form').querySelector('[data-action=agent]'));
}
const languageUI=initLanguage();
document.addEventListener('echo:language',()=>{if(modal.open)closeModal();});
const referrals=initReferralUI({identity,toast,openModal,baseUrl:location.href});
const growth=initGrowth({identity,referrals,openModal,closeModal,goTo,toast,baseUrl:location.href});
const interactions=initInteractions({identity,quote,referrals,openModal,showBrief:agentPrompt,showAccount:account,toast});
document.addEventListener('echo:referral',()=>{updateSupply();updateQuote();});
$('agent-name').addEventListener('input',updateQuote);
updateQuote();updateSupply();
