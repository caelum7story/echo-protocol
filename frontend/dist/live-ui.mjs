import {connectClient,DEPLOYMENT,quantity,normalizeHandle,formatEther} from './chain.mjs';
import {buildLiveBrief,OFFICIAL_ORIGIN} from './live-brief.mjs';
import {initLanguage,getLanguage} from './i18n.mjs';
import {openingEstimate} from './opening-estimate.mjs';
import {launchOverview} from './launch-overview.mjs';
import {referralRewardSummary} from './referral-rewards.mjs';
import {initGrowthCampaign} from './growth-campaign-ui.mjs';
import {initTeamPreview} from './team-preview.mjs';
import {initMintChoices} from './mint-choices.mjs';
import {liveMintStatus} from './live-status.mjs';
import {createReceiptLookup} from './receipt-lookup.mjs';
import {receiptErrorPresentation,receiptExplorerLink} from './receipt-errors.mjs';
import {initContentModules,navigateToContent,activeContentModule} from './content-modules.mjs';
import {invitationFor,invitationText,xInvitation,rememberedIdentity,rememberIdentity,forgetIdentity,drawInvitationPoster,mintJourney} from './engagement.mjs';

const $=id=>document.getElementById(id),t=(zh,en)=>getLanguage()==='en'?en:zh;
const number=n=>new Intl.NumberFormat(getLanguage()==='en'?'en-US':'zh-CN').format(n);
const model={client:null,state:null,stateFresh:false,quote:null,identity:null,referrer:null,rows:[],cursor:null,activityLoaded:false,activityStatus:{phase:'idle'},copied:false,receipt:null};
let quoteRequest=0,activityRequest=0,inputTimer,toastTimer,lastFocus,posterObjectUrl=null,modalGeneration=0;
const incoming=new URL(location.href).searchParams;let inbound=null;
try{if(incoming.has('ref'))inbound=normalizeHandle(incoming.get('ref'))+'.ai';}catch{}
const errorText=e=>{
 const code=e.shortMessage||e.message||String(e),messages={INVALID_IDENTITY:['请输入 1–64 位字母或数字的官方 .ai 名称。','Enter a valid official .ai name using 1–64 letters or digits.'],IDENTITY_NOT_FOUND:['未找到这个官方 .ai 身份。','This official .ai identity was not found.'],INVALID_QUANTITY:['请选择 1–10 的整数份数。','Select 1–10 whole shares.'],SELF_REFERRAL:['不能使用自己或同钱包的身份作为邀请来源。','Self-referrals and referrals from the same wallet are unavailable.'],MINT_CLOSED:['Mint 尚未开放。','Mint is not open.'],ORACLE_NOT_READY:['市场报价尚未就绪，请等待预言机观察更新。','Market pricing awaits a healthy oracle observation.'],IDENTITY_QUOTA_EXCEEDED:['超过此身份的剩余铸造额度。','The identity has insufficient remaining quota.'],GLOBAL_QUOTA_EXCEEDED:['超过全站剩余份额。','Insufficient shares remain.'],INVALID_TRANSACTION_HASH:['请输入完整交易哈希。','Enter a complete transaction hash.'],WRONG_TRANSACTION_CONTRACT:['这不是 ECHO Mint 合约的交易。','This transaction is not for the ECHO Mint contract.']};
 if(messages[code])return t(...messages[code]);if(code.startsWith('PHASE_BOUNDARY:'))return t('本次跨过开盘门槛，请先选择 '+code.split(':')[1]+' 份，剩余部分开盘后重新报价。','This crosses pool opening. First select '+code.split(':')[1]+' shares, then obtain a new quote for the remainder.');
 return t('查询暂不可用，请稍后重试。','The query is temporarily unavailable. Please retry.');
};
function text(id,value){const node=$(id);if(node)node.textContent=value;}
function toast(message){clearTimeout(toastTimer);text('toast',message);$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function goTo(id){navigateToContent(id);}
function modal(kicker,html){++modalGeneration;if(posterObjectUrl){URL.revokeObjectURL(posterObjectUrl);posterObjectUrl=null;}lastFocus=document.activeElement;text('modal-kicker',kicker);$('modal-body').innerHTML=html;if(!$('modal').open)$('modal').showModal();document.body.style.overflow='hidden';}
const close=()=>$('modal').close();
$('modal-close').onclick=close;$('modal').addEventListener('close',()=>{++modalGeneration;document.body.style.overflow='';if(posterObjectUrl){URL.revokeObjectURL(posterObjectUrl);posterObjectUrl=null;}lastFocus?.isConnected&&lastFocus.focus({preventScroll:true});});
$('modal').addEventListener('click',e=>{if(e.target!==$('modal'))return;const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
async function copy(value,field){try{await navigator.clipboard.writeText(value);toast(t('已复制。','Copied.'));return true;}catch{field?.focus();field?.select();toast(t('请长按复制。','Select and copy the text.'));return false;}}
function readShares(){return quantity($('quantity').value);}
function selectShares(value){$('quantity').value=String(value);model.copied=false;model.receipt=null;renderJourney();clearTimeout(inputTimer);refreshQuote();}
function selectedName(){return $('agent-name').value.trim();}
function effectiveReferrer(){return model.referrer?.locked?model.referrer.name:model.referrer?.name||inbound;}
const currentMintStatus=()=>liveMintStatus(model.state,{fresh:model.stateFresh,language:getLanguage()});
function isOpen(){return currentMintStatus().open;}
function renderOpeningEstimate(){
 const s=model.stateFresh?model.state:null,e=openingEstimate(s);
 const label=e.phase==='opened'?t('已开盘 · 估算已结束','Pool open · Estimate ended'):t('预估开盘价','Estimated opening price');
 text('hero-opening-label',label);text('opening-estimate-title',label);
 text('hero-opening-value',e.phase==='estimated'?'≈ '+formatEther(e.perTokenWei)+' BNB / ECHO':e.phase==='opened'?t('以交易池价格为准','Refer to the trading pool'):'—');
 text('opening-estimate-token',e.phase==='estimated'?formatEther(e.perTokenWei):'—');
 text('opening-estimate-share',e.phase==='estimated'?'1,000 ECHO ≈ '+formatEther(e.perShareWei)+' BNB':e.phase==='opened'?t('已开放交易，不再展示开盘前估算。','Trading is open; the pre-opening estimate no longer applies.'):t('等待有效建池数据，暂不估算。','Awaiting valid liquidity data before estimating.'));
 const source=e.basis==='accumulated'?t('按已累计建池资金','From accumulated liquidity funding'):e.basis==='parameters'?t('按当前发行参数','From current launch parameters'):t('以链上状态为准','Refer to on-chain state');
 text('opening-estimate-source',source);
 text('hero-opening-note',e.basis==='parameters'?t('尚无付费建池资金；按当前参数估算。','No paid liquidity funding yet; parameter-based estimate.'):t('建池比例估算，非成交报价。','Liquidity-ratio estimate, not an executable quote.'));
 text('opening-estimate-basis',e.basis==='parameters'?t('尚无付费建池资金；按当前付费价、70% 配资与每付费份 700 ECHO 配币推算。','No paid liquidity funding yet. Estimated from the current paid Mint price, 70% funding and 700 ECHO liquidity allocation per paid share.'):e.basis==='accumulated'?t('按链上已累计待建池 BNB ÷ 对应配币计算；不把免费份额计入建池资金。','Pending on-chain liquidity BNB divided by its token allocation. Free shares do not fund liquidity.'):t('当前未提供有效的开盘前估算。','A valid pre-opening estimate is currently unavailable.'));
 text('opening-estimate-formula',e.phase==='estimated'?formatEther(e.liquidityBnbWei)+' BNB ÷ '+number(e.liquidityTokensWei/10n**18n)+' ECHO'+(s?.block?t(' · 数据区块 ',' · Data block ')+number(s.block):''):t('请以链上状态和实际交易池为准。','Refer to on-chain state and the actual pool.'));
}
function renderLaunchOverview(){
 const s=launchOverview(model.state,{fresh:model.stateFresh}),panel=$('launch-overview');
 panel.dataset.fresh=String(s.fresh);panel.dataset.phase=s.available?s.phase:'loading';
 const labels={minting:t('铸造开放中','Mint is open'),opened:t('交易池已开盘','Trading pool is open'),paused:t('Mint 暂停中','Mint is paused'),closed:t('Mint 已关闭','Mint is closed'),retired:t('Mint 已停用','Mint is retired')};
 text('launch-stage-status',!s.available?t('等待读取链上数据','Awaiting on-chain data'):!s.fresh?t('上次读取 · 等待刷新','Previous reading · Refresh needed'):labels[s.phase]);
 text('launch-free-count',s.available?number(s.freeClaimed):'—');text('launch-paid-count',s.available?number(s.totalPaid):'—');
 text('launch-funding-label',s.opened?t('交易池状态','Trading pool status'):t('待建池资金','Pending liquidity funding'));
 text('launch-funding-value',s.available?s.opened?t('已开盘','Open'):formatEther(s.fundingWei):'—');text('launch-funding-unit',s.opened?'BNB Chain':'BNB');
 text('opening-distance',!s.available?'—':s.opened?t('已开放交易','Trading is open'):!s.active?t('铸造当前未开放','Mint is not currently open'):t('距自动建池还差 ','To the automatic opening: ')+number(s.openingRemaining)+t(' 份',' shares'));
 const track=$('opening-progress-track');track.hidden=!!s.opened;track.setAttribute('aria-valuenow',String(s.available?s.openingValue:0));track.firstElementChild.style.width=(s.available?s.openingValue/s.openingTarget*100:0)+'%';
 const current=s.available?(s.opened?2:s.active?0:-1):-1;document.querySelectorAll('[data-launch-step]').forEach((el,i)=>{el.dataset.state=i===current?'current':i<current?'done':'next';if(i===current)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 text('launch-funding-note',!s.available?t('免费、付费和建池资金将分别读取。','Free allocations, paid allocations and liquidity funding are read separately.'):s.opened?t('交易池已建立；后续付费 Mint 由 Agent 核验市场报价。','The pool is open. Your Agent verifies market pricing for later paid mints.'):s.totalPaid===0?t('免费份额计入开池门槛；建池 BNB 来自付费铸造。','Free shares count towards the opening threshold. Liquidity BNB comes from paid mints.'):t('这里显示链上实际待建池 BNB，不将免费份额折算为资金。','This is actual pending liquidity BNB. Free shares are not counted as funding.'));
 text('launch-data-source',s.available?(s.fresh?t('链上读取 · 区块 ','On-chain reading · Block '):t('上次成功读取 · 区块 ','Last successful reading · Block '))+number(s.block||0):t('数据未就绪时不显示模拟数量。','No simulated quantities are shown while data is unavailable.'));
}
function renderState(){
 const s=model.state,status=currentMintStatus(),active=status.open;renderOpeningEstimate();
 text('hero-free-remaining',s?number(Math.max(0,1000-s.freeClaimed)):'—');
 text('hero-price-label',s?.opened?t('开盘后付费价','Post-open paid price'):t('开盘前付费价','Pre-open paid price'));
 text('hero-current-price',s?.opened?t('市场报价','Market-linked'):s?formatEther(s.pricing.preOpenPrice):'—');
 text('hero-price-unit',s?.opened?t('由 Agent 实时核验','Rechecked by your Agent'):t('BNB / 份','BNB / share')); 
 text('live-status',status.message);
 text('chain-status',status.label);
 text('hero-mint-status',status.message);
 text('mint-contract-note',!status.fresh?t('先核验最新状态，再由 Agent 查询费用。','Verify current state before your Agent requests pricing.'):active?t('正式合约已接入，交易由你的 Agent 完成。','Live contracts connected. Your Agent handles the transaction.'):status.message);
 text('live-block',status.block!==null?(status.fresh?t('已核验区块 ','Checked block '):t('上次读取区块 ','Previous block '))+number(status.block):'—');
 text('minted-count',s?number(s.totalMinted):'—');text('remaining-count',s?t('剩余 ','Remaining ')+number(10000-s.totalMinted)+t(' 份',' shares'):'—');
 $('supply-progress').setAttribute('aria-valuenow',String(s?.totalMinted||0));$('supply-progress').firstElementChild.style.width=(s?s.totalMinted/100:0)+'%';
 text('free-remaining',s?t('免费剩余 ','Free remaining: ')+number(1000-s.freeClaimed)+' / 1,000'+t(' 份',' shares'):'—');
 text('opening-progress',s?(s.opened?t('流动性池已开盘 · 付费 Mint 使用实时市场报价','Pool is open · Paid Mint uses a live market quote'):t('开盘门槛 · 链上 ','Opening threshold · On-chain ')+number(s.totalMinted)+' / 5,000'+t(' 份（含免费）',' shares (including free)')):'—');
 text('paid-unit-price',s?formatEther(s.pricing.preOpenPrice)+' BNB / '+t('份（开盘前）','share (pre-open)'):'—');
 text('mint-unit-price',s?.opened?t('按市场报价','Market-linked'):s?formatEther(s.pricing.preOpenPrice)+' BNB':'—');
 renderLaunchOverview();
 renderQuote();
 if($('agent-brief')){$('agent-brief').value=brief();text('agent-freshness',status.message);text('agent-live-status',status.label);text('agent-summary-referrer',effectiveReferrer()||t('无','None'));}
}
function renderQuote(){
 mintChoiceUi.render({state:model.state,identity:model.identity,fresh:model.stateFresh});
 let n;try{n=readShares();}catch{n=null;}
 const q=model.stateFresh?model.quote:null,who=model.identity;
 text('quote-tokens',n?number(n*1000):'—');text('mobile-receive',n?number(n*1000)+' ECHO':t('请选择份数','Choose shares'));
 text('quote-free',q?.available?q.free+t(' 份',' shares'):'—');text('quote-paid',q?.available?q.paid+t(' 份',' shares'):'—');text('quote-cost',q?.available?formatEther(q.cost)+' BNB':'—');
 text('mobile-cost',q?.available?n+t(' 份 · ',' shares · ')+formatEther(q.cost)+' BNB':!model.stateFresh?t('Mint 状态待核验','Mint state unverified'):isOpen()?t('输入 .ai 查询报价','Enter .ai for a quote'):currentMintStatus().label);
 text('participation-name',who?who.name:t('输入 .ai 名称，查询你的参与记录。','Enter a .ai name to view its participation.'));
 text('participation-tokens',who?number(who.minted*1000):'—');
 $('forget-identity').disabled=!selectedName();
 text('identity-minted',who?who.minted+' / '+who.allowance+t(' 份',' shares'):'—');text('identity-invites',who?number(who.invites):'—');text('identity-remaining',who?who.remaining+t(' 份',' shares'):'—');
 text('identity-free-state',who?(who.minted>0?t('此身份已完成首铸；后续为付费份额。','This identity has already minted; further shares are paid.'):model.state?.freeClaimed<1000?t('此身份首份可免铸造费，Gas 另付。','The first share is free of Mint fees; gas is separate.'):t('全站首免已用完，需要付费。','The global free pool is exhausted. Paid Mint applies.')):t('输入官方 .ai 名称查询真实额度。','Enter an official .ai name to query its quota.'));
 text('desk-identity',who?.name||t('尚未查询身份','No identity queried'));text('desk-identity-state',who?t('官方链上身份已找到 · 仅公开查询','Official on-chain identity found · Public read only'):t('网页不连接参与钱包','The page does not connect participant wallets'));
 text('desk-order-state',who?t('累计已铸 ','Total minted: ')+who.minted+t(' 份',' shares'):'—');text('identity-wallet',who?.wallet||'—');
 text('auto-paid-cap',n&&model.stateFresh&&model.state&&!model.state.opened?t('开盘前所选份数付款上限：','Payment ceiling for selected shares (pre-open): ')+formatEther(model.state.pricing.preOpenPrice*BigInt(n))+' BNB'+t('；Gas 单独确认。','; confirm gas separately.'):t('实际付款与 Gas 以 Agent 的实时核验为准。','The Agent must verify actual payment and gas.'));
 text('quote-note',!model.stateFresh?t('最新链上状态待核验；旧报价不作为当前费用，请刷新或交给 Agent 重新查询。','Current chain state is unverified. Do not use an old quote as the current cost; refresh or ask your Agent to re-query.'):q?.available?t('此报价来自合约；Agent 签名前会重新核验，不会在本页扣费。','This quote comes from the contract and must be refreshed before signing. This page does not charge your wallet.'):isOpen()?t('输入官方 .ai 名称查询真实额度和报价，或交给 Agent 读取。','Enter your official .ai name for quota and pricing, or ask your Agent to read it.'):t('Mint 尚未开放；可以先复制 Agent 指令，开放后由 Agent 重新核验。','Mint is not open. You can copy the Agent brief now; your Agent must recheck after opening.'));
 const reward=referralRewardSummary({successfulInvites:who?.invites,opened:!!model.state?.opened});
 text('my-referral-count',reward.available?number(reward.successfulInvites):'—');
 text('invite-reward-total',reward.available?number(reward.accruedTokens):'—');
 $('invite-reward-card').dataset.fresh=String(model.stateFresh);
 text('invite-reward-status',!reward.available?t('查询身份后显示','Query your identity first'):!model.stateFresh?t('上次读取 · 请刷新核对','Previous reading · Refresh to check'):reward.phase==='awaiting-pool-opening'?t('待开盘后核对发放','Reconciled after pool opening'):t('已开盘 · 由项目核对发放','Pool open · Project reconciliation'));
 document.querySelectorAll('[data-quantity]').forEach(b=>{const on=Number(b.dataset.quantity)===n;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
 document.querySelector('[data-action=minus]').disabled=!n||n<=1;document.querySelector('[data-action=plus]').disabled=!n||n>=10;
 $('referral-banner').hidden=!inbound&&!model.referrer?.name&&!model.referrer?.locked;
 text('referral-label',model.referrer?.locked?t('首铸邀请记录','First Mint referral record'):t('来自朋友的邀请','Invitation from a friend'));
 text('referral-name',effectiveReferrer()||t('无','None'));text('referral-message',model.referrer?.locked?(model.referrer.name?t('该身份已首铸，原邀请记录保持不变。','This identity already minted; its original referral is retained.'):t('首铸未记录邀请人，此身份之后不能补加。','The first Mint recorded no inviter. Later links cannot add one.')):t('邀请人须为不同官方身份，首单成功后记录。','A different official identity is required. Attribution is recorded on a successful first mint.'));
 const name=who?.name;const link=name?invitationFor(name):'';text('share-identity-label',name||t('输入你的 .ai 名称','Enter your .ai name'));$('my-invite-link').value=link;$('copy-invite-link').disabled=!link;
 const module=activeContentModule(),inviting=module==='teams'||module==='invite';
 if(inviting){text('mobile-cost',module==='teams'?t('战队榜 · 50,000 ECHO','Team pool · 50,000 ECHO'):t('有效邀请 · 200 ECHO','Valid referral · 200 ECHO'));text('mobile-receive',t('开盘后核对发放','Reconciled after pool opening'));}
 text('mobile-agent',inviting?t('邀请好友 ↗','Invite ↗'):t('Agent 指令 ↗','Agent brief ↗'));document.querySelector('.mobile-share').hidden=inviting;
}
async function refreshQuote(){
 const request=++quoteRequest;model.quote=null;try{if(model.identity?.name!==normalizeHandle(selectedName())+'.ai')model.identity=null;}catch{model.identity=null;}model.referrer=null;renderQuote();text('identity-error','');text('quantity-error','');
 let n;try{n=readShares();}catch(e){text('quantity-error',errorText(e));return;}
 if(!selectedName()||!model.client)return;
 text('identity-error',t('正在核验官方身份与额度…','Checking official identity and quota…'));
 try{const q=await model.client.quote(selectedName(),n,inbound);if(request!==quoteRequest)return;model.quote=q;model.state=q.state;model.stateFresh=true;model.identity=q.identity;model.referrer=q.referrer;try{rememberIdentity(localStorage,q.identity.name);}catch{}text('identity-error','');renderState();}catch(e){if(request!==quoteRequest)return;text('identity-error',errorText(e));if(['IDENTITY_QUOTA_EXCEEDED','GLOBAL_QUOTA_EXCEEDED','ORACLE_NOT_READY','SELF_REFERRAL'].includes(e.message)||e.message?.startsWith('PHASE_BOUNDARY:')){try{const who=await model.client.identity(selectedName(),model.state);if(request!==quoteRequest)return;model.identity=who;try{rememberIdentity(localStorage,who.name);}catch{}}catch{}}renderQuote();}
}
async function refreshState(){
 try{model.client||=await connectClient();model.state=await model.client.state();model.stateFresh=true;renderState();await refreshQuote();}catch(e){model.stateFresh=false;model.quote=null;renderState();}
}
function brief(){
 let name=selectedName();try{if(name)name=normalizeHandle(name);}catch{throw Error('INVALID_IDENTITY');}
 return buildLiveBrief({name,shares:readShares(),referrer:effectiveReferrer(),pricingVersion:model.stateFresh?model.state?.pricingVersion??null:null,preOpenCeilingWei:model.stateFresh&&model.state&&!model.state.opened?(model.state.pricing.preOpenPrice*BigInt(readShares())).toString():null,language:getLanguage()});
}
function showBrief(){
 let value;try{value=brief();}catch(e){toast(errorText(e));goTo('mint');return;}
 const status=currentMintStatus();modal('ECHO / AGENT MINT',`<h2 id="modal-title">${t('发送给你的 Agent。','Send to your Agent.')}</h2><p id="agent-freshness">${!status.fresh?t('网页尚未核验最新状态，请先让 Agent 查询开放情况和实时费用。','The page has not verified current state. Ask your Agent to check availability and live costs first.'):isOpen()?t('Agent 会重新核验身份、额度和费用，再按你的限额授权准备交易。','Your Agent must recheck identity, quota and costs, then prepare a transaction within your consent.'):t('Mint 目前关闭。Agent 读取状态后会停止，不会扣费。','Mint is currently closed. Your Agent must stop after checking the status; no payment is made.')}</p><dl id="agent-summary" class="quote-details"></dl><div id="agent-journey"></div><button id="brief-verify" class="text-button" type="button">${t('拿到交易哈希？核验到账 ↗','Have a transaction hash? Verify delivery ↗')}</button><button id="copy-brief" class="button button-ink" type="button">${t('复制 Agent 指令 ↗','Copy Agent brief ↗')}</button><p id="agent-copy-state" role="status"></p><details><summary>${t('查看完整指令','Review full brief')}</summary><textarea id="agent-brief" readonly aria-label="Agent prompt"></textarea></details><p class="modal-note">${t('本页不连接钱包、不请求签名。真实交易由你的 Agent 与钱包完成。','This page does not connect wallets or request signatures. Your Agent and wallet handle the actual transaction.')}</p>`);
 for(const [label,value]of [[t('身份','Identity'),model.identity?.name||t('由 Agent 读取','Read by Agent')],[t('所选份数','Selected shares'),readShares()],[t('每份代币','Tokens per share'),'1,000 ECHO'],[t('Mint 状态','Mint status'),status.label],[t('邀请来源','Referrer'),effectiveReferrer()||t('无','None')]]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;if(label===t('Mint 状态','Mint status'))dd.id='agent-live-status';if(label===t('邀请来源','Referrer'))dd.id='agent-summary-referrer';row.append(dt,dd);$('agent-summary').append(row);}
 $('agent-brief').value=value;renderJourney();$('brief-verify').onclick=verifyReturn;$('copy-brief').onclick=async()=>{value=brief();$('agent-brief').value=value;if(await copy(value,$('agent-brief'))){markBriefCopied();text('agent-copy-state',t('已复制。切换到自己的 Agent 粘贴发送，再在钱包确认。','Copied. Paste into your Agent, then confirm in your wallet.'));}else $('agent-brief').parentElement.open=true;};
}
function journeyHTML(){
 const j=mintJourney(model);return '<ol class="mint-journey">'+[
  [t('复制铸造指令','Copy the Mint brief'),j.copied?t('指令已复制，尚不代表已发送或铸造。','Copied. Sending and minting are not yet confirmed.'):t('将指令复制到剪贴板。','Copy the brief to your clipboard.'),j.copied?'is-done':j.step===1?'is-current':''],
  [t('交给 Agent，在钱包确认','Send to your Agent; confirm in your wallet'),t('切换到你的 Agent 粘贴发送，核对费用后确认。','Paste into your Agent and review the costs before confirming.'),j.step===2?'is-current':''],
  [t('返回官网，核验到账','Return here to verify delivery'),j.confirmed?t('成功回执和同笔代币到账事件已核对。','Successful receipt and matching token delivery checked.'):j.pending?t('交易待确认，尚未确认到账。','Transaction pending. Delivery is not confirmed.'):j.failed?t('交易失败，未确认铸造成功。','Transaction failed. Mint was not successful.'):t('拿到交易哈希后，回官网查询真实结果。','Return with the transaction hash to check the actual result.'),j.confirmed?'is-done':'']
 ].map(([title,note,cls],i)=>'<li class="'+cls+'"><span>'+String(i+1).padStart(2,'0')+'</span><div><strong>'+title+'</strong><small>'+note+'</small></div></li>').join('')+'</ol>';
}
function renderJourney(){
 const j=mintJourney(model);$('mint-journey-panel').hidden=!j.copied&&!model.receipt;
 for(const id of ['mint-journey','agent-journey'])if($(id))$(id).innerHTML=journeyHTML();
 text('journey-note',j.confirmed?t('已核验真实到账，可在参与记录查看交易。','Delivery verified. View the transaction in participation records.'):t('本页无法知道你是否已发送给 Agent；到账以真实回执为准。','This page cannot detect whether you sent the brief. Delivery requires a real receipt.'));
}
function markBriefCopied(){model.copied=true;renderJourney();}
function verifyReturn(){lastFocus=$('activity-query');close();goTo('activity');$('activity-query').focus();toast(t('粘贴 Agent 返回的交易哈希，核验真实到账。','Paste the transaction hash returned by your Agent to verify delivery.'));}
async function showInvite(){
 if(!model.identity){toast(t('先输入并查询你的官方 .ai 名称。','First enter and query your official .ai name.'));goTo('mint');$('agent-name').focus();return;}
 const name=model.identity.name,language=getLanguage(),link=invitationFor(name);let posterFile=null;
 modal('ECHO / PERSONAL INVITATION',`<h2 id="modal-title">${t('下一声回响，由你邀请。','Invite the next echo.')}</h2><p class="share-invite-owner" id="invite-owner"></p><div id="share-poster-container" aria-busy="true"></div><p class="poster-feedback" id="poster-feedback" role="status">${t('正在制作你的银色雕塑邀请海报…','Creating your silver-sculpture invitation…')}</p><div class="share-action-grid"><button id="share-native" type="button" class="button button-ink">${t('手机系统分享 ↗','Share from your phone ↗')}</button><button id="save-poster" type="button" class="button button-ghost" disabled>${t('保存邀请海报 ↓','Save invitation poster ↓')}</button><a id="share-x" class="button button-ghost" target="_blank" rel="noopener noreferrer">${t('分享到 X ↗','Share on X ↗')}</a><button id="share-copy" type="button" class="button button-ghost">${t('复制邀请链接 ↗','Copy invitation link ↗')}</button></div><textarea class="share-url-compact" id="share-url" readonly aria-label="Invitation URL"></textarea><p class="modal-note">${t('每个有效受邀新身份首铸，邀请者增加 1 份付费额度，另应计 200 ECHO，开盘后由项目钱包核对发放。海报仅含公开名称和邀请链接，不是持仓凭证。','An eligible invited first mint unlocks one paid share and accrues 200 ECHO for the inviter, reconciled and transferred by the project wallet after pool opening. The poster contains a public name and invitation link, not proof of holdings.')}</p>`);
 const generation=modalGeneration;const current=()=>generation===modalGeneration&&$('modal').open;
 text('invite-owner',name);$('share-url').value=link;$('share-x').href=xInvitation(name,language);$('share-copy').onclick=()=>copy(link,$('share-url'));
 $('share-native').onclick=async()=>{
  const payload={title:'ECHO / '+name,text:invitationText(name,language),url:link};
  if(typeof navigator.share==='function'){try{if(posterFile&&navigator.canShare?.({files:[posterFile]}))await navigator.share({...payload,files:[posterFile]});else await navigator.share(payload);return;}catch(e){if(e.name==='AbortError')return;}}
  await copy(link,$('share-url'));text('poster-feedback',t('当前浏览器未提供系统分享，邀请链接已准备好。','System sharing is unavailable here; your invitation link is ready.'));
 };
 try{
  const canvas=await drawInvitationPoster(name,language);if(!current()||!$('share-poster-container'))return;
  canvas.className='share-poster-preview';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',t('带银色雕塑、公开身份和邀请二维码的 ECHO 海报','ECHO poster with the silver sculpture, public identity and invitation QR code'));$('share-poster-container').append(canvas);$('share-poster-container').setAttribute('aria-busy','false');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('POSTER_EXPORT_FAILED')),'image/png'));if(!current()||!$('save-poster'))return;
  const filename='ECHO-'+normalizeHandle(name)+'-invitation.png';posterFile=new File([blob],filename,{type:'image/png'});posterObjectUrl=URL.createObjectURL(blob);$('save-poster').disabled=false;
  $('save-poster').onclick=()=>{const a=document.createElement('a');a.href=posterObjectUrl;a.download=filename;document.body.append(a);a.click();a.remove();text('poster-feedback',t('已准备下载；手机也可使用系统分享保存图片。','Download prepared. On your phone, you can also save the image through system sharing.'));};
  text('poster-feedback',t('海报已生成。扫码会打开你的专属邀请。','Poster ready. Its QR code opens your personal invitation.'));
 }catch{if(current()){text('poster-feedback',t('海报暂时无法生成，仍可复制链接或分享到 X。','Poster unavailable. You can still copy the link or share on X.'));$('share-poster-container')?.setAttribute('aria-busy','false');}}
}

function renderActivityStatus(){
 const s=model.activityStatus;
 text('activity-source',s.phase==='ready'?t('链上区块 ','On-chain blocks ')+number(s.fromBlock)+' — '+number(s.toBlock):s.phase==='loading'?t('正在查询链上 Mint 事件…','Reading on-chain Mint events…'):s.phase==='error'?t('链上记录查询失败，请重试。','Chain record query failed. Please retry.'):t('尚未取得查询结果。','No query result yet.'));
 text('activity-query-error',s.phase==='error'?errorText(s.error):'');
 $('activity-older').disabled=s.phase==='loading';$('activity-list').setAttribute('aria-busy',String(s.phase==='loading'));
 text('activity-empty-title',s.phase==='error'?t('本次查询未完成。','The query did not complete.'):s.phase==='loading'?t('正在查询链上记录…','Reading on-chain records…'):s.phase==='ready'?t('查询区间内尚无 Mint 记录。','No Mint records in this queried range.'):t('尚未取得查询结果。','No query result yet.'));
 text('activity-empty-note',s.phase==='error'?t('查询失败不代表没有记录。','A failed query does not mean there are no records.'):s.phase==='loading'?t('等待读取真实链上事件。','Waiting for real on-chain events.'):model.cursor?t('可继续查询更早的区块。','You can continue to earlier blocks.'):t('只展示合约真实事件，不生成模拟参与者。','Only real contract events are displayed. No simulated participants are generated.'));
}
function renderRows(){
 const list=$('activity-list');list.replaceChildren();$('activity-empty').hidden=model.rows.length>0;
 for(const row of model.rows){const article=document.createElement('article');article.className='activity-row';const person=document.createElement('div');person.className='activity-person';const label=document.createElement('div'),name=document.createElement('strong'),stamp=document.createElement('small');name.textContent=row.name||row.wallet;stamp.textContent=t('区块 ','Block ')+number(row.block);label.append(name,stamp);person.append(label);const amount=document.createElement('div');amount.className='activity-amount';amount.textContent=number(Number(BigInt(row.tokens)/10n**18n))+' ECHO';const cost=document.createElement('small');cost.textContent=row.shares+t(' 份 · ',' shares · ')+formatEther(row.costWei)+' BNB';amount.append(cost);const button=document.createElement('button');button.className='text-button';button.type='button';button.textContent=t('查看交易 ↗','View transaction ↗');button.onclick=()=>showReceipt(row.hash);article.append(person,amount,button);list.append(article);}
 $('activity-older').hidden=!model.cursor;renderActivityStatus();
}
async function loadActivity(older=false){
 if(!model.client)return;const value=$('activity-query').value.trim();
 if(/^0x[0-9a-f]{64}$/i.test(value)){await showReceipt(value);return;}
 const request=++activityRequest;if(!older){model.rows=[];model.cursor=null;}
 let name=value;try{if(value)name=normalizeHandle(value);}catch(error){model.activityStatus={phase:'error',error};renderRows();return;}
 model.activityStatus={phase:'loading'};renderRows();
 try{const result=await model.client.activity({name:name||null,beforeBlock:older?model.cursor?.block:null,beforeIndex:older?model.cursor?.index:null});if(request!==activityRequest)return;const map=new Map(model.rows.map(r=>[r.hash+':'+r.index,r]));for(const row of result.events)map.set(row.hash+':'+row.index,row);model.rows=[...map.values()];model.cursor=result.nextCursor;model.activityLoaded=true;model.activityStatus={phase:'ready',fromBlock:result.fromBlock,toBlock:result.toBlock};renderRows();}catch(error){if(request!==activityRequest)return;model.activityStatus={phase:'error',error};renderRows();}
}
const lookupReceipt=createReceiptLookup({
 readReceipt:hash=>model.client.receipt(hash),readIdentity:name=>model.client.identity(name),getIdentityName:selectedName,
 getView:()=>modalGeneration,isViewCurrent:view=>view===modalGeneration&&$('modal').open,
 onStart:()=>{model.receipt=null;renderJourney();},
 onIdentity:who=>{$('agent-name').value=who.handle;model.identity=who;try{rememberIdentity(localStorage,who.name);}catch{}renderQuote();},
 onResult:renderReceipt,onError:renderReceiptError
});
function showReceipt(hash){
 modal('ECHO / TRANSACTION',`<h2 id="modal-title">${t('核验铸造交易。','Verify a Mint transaction.')}</h2><p id="receipt-state" role="status">${t('正在核验回执和到账事件…','Checking receipt and token-delivery events…')}</p><dl id="receipt-details" class="quote-details"></dl><p id="receipt-link"></p>`);
 return lookupReceipt(hash);
}
function renderReceiptError(error,hash){
 const problem=receiptErrorPresentation(error,getLanguage());text('receipt-state',problem.message);
 const details=$('receipt-details'),actions=$('receipt-link');if(!details||!actions)return;
 details.replaceChildren();actions.replaceChildren();actions.className='receipt-error-actions';
 const href=receiptExplorerLink(hash);
 if(href){
  const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');row.className='receipt-hash-row';label.textContent=t('本次查询哈希','Queried hash');value.textContent=hash;value.className='transaction-hash';row.append(label,value);details.append(row);
 }
 if(problem.retryable){const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent=t('重新核验 ↻','Retry verification ↻');retry.onclick=()=>showReceipt(hash);actions.append(retry);}
 if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('在 BscScan 核对 ↗','Check on BscScan ↗');actions.append(link);}
}
function renderReceipt(r,hash){
 model.receipt=r;renderJourney();text('receipt-state',r.status==='confirmed'?t('Mint 成功，已核对同笔代币到账事件。','Mint succeeded; matching token delivery was verified.'):r.status==='pending'?t('交易等待确认，尚不能确认到账。','Transaction pending. Delivery is not yet confirmed.'):r.status==='failed'?t('交易失败，未确认铸造成功。','Transaction failed. Mint was not successful.'):t('未查到交易，请核对哈希或稍后重试。','Transaction not found. Check the hash or retry later.'));
  for(const [label,value]of [[t('交易哈希','Transaction hash'),hash],...(r.status==='confirmed'?[[t('官方身份','Official identity'),r.name||r.identityId],[t('数量','Shares'),r.shares],[t('收到代币','Tokens received'),number(Number(BigInt(r.tokens)/10n**18n))+' ECHO'],[t('Mint 付款','Mint payment'),formatEther(r.costWei)+' BNB'],[t('确认区块','Confirmed block'),r.block]]:[])]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('receipt-details')?.append(row);}
  const a=document.createElement('a');a.href='https://bscscan.com/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';a.textContent=t('在 BscScan 查看 ↗','View on BscScan ↗');$('receipt-link')?.append(a);
}
function initNavigation(){
 const menu=$('site-nav'),toggle=$('menu-toggle');const hide=()=>{menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');};toggle.onclick=()=>{const on=!menu.classList.contains('is-open');menu.classList.toggle('is-open',on);toggle.setAttribute('aria-expanded',String(on));};menu.querySelectorAll('a').forEach(a=>a.onclick=hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 const tabs=[...document.querySelectorAll('[data-rule-tab]')],mobile=matchMedia('(max-width:760px)');
 const orient=()=>document.querySelector('[role=tablist]').setAttribute('aria-orientation',mobile.matches?'horizontal':'vertical');orient();mobile.addEventListener('change',orient);
 const select=tab=>{for(const other of tabs){const on=other===tab;other.setAttribute('aria-selected',String(on));other.tabIndex=on?0:-1;$(other.getAttribute('aria-controls')).hidden=!on;}};
 for(const tab of tabs){tab.onclick=()=>select(tab);tab.onkeydown=e=>{const i=tabs.indexOf(tab),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):e.key===(mobile.matches?'ArrowRight':'ArrowDown')?tabs[(i+1)%tabs.length]:e.key===(mobile.matches?'ArrowLeft':'ArrowUp')?tabs[(i+tabs.length-1)%tabs.length]:null;if(next){e.preventDefault();select(next);next.focus();}};}
}
initLanguage();initNavigation();
const mintChoiceUi=initMintChoices({getLanguage});
const growthCampaign=initGrowthCampaign({getClient:()=>model.client,getLanguage});
initTeamPreview({getLanguage});
initContentModules({getLanguage,getIdentity:selectedName,onIdentityQuery:async value=>{
 $('agent-name').value=value.trim();clearTimeout(inputTimer);++quoteRequest;model.identity=null;model.quote=null;model.copied=false;model.receipt=null;renderQuote();renderJourney();
 try{model.client||=await connectClient();await refreshQuote();}catch(e){return {ok:false,message:errorText(e)};}
 let matches=false;try{matches=model.identity?.name===normalizeHandle(value)+'.ai';}catch{}
 return {ok:matches,message:matches?t('已核验 '+model.identity.name+'，可以生成邀请。','Verified '+model.identity.name+'. You can create your invitation.'):$('identity-error').textContent||t('查询暂不可用，请重试。','Query unavailable. Please retry.')};
},onChange:module=>{renderQuote();if(!model.client)return;if(module==='activity'&&!model.activityLoaded)loadActivity();if(module==='teams'&&!growthCampaign.hasReport())growthCampaign.load();}});
document.querySelectorAll('[data-action=entry],[data-action=agent]').forEach(b=>b.onclick=showBrief);
$('mobile-agent').onclick=()=>['teams','invite'].includes(activeContentModule())?showInvite():showBrief();
document.querySelectorAll('[data-action=copy-agent]').forEach(b=>b.onclick=async()=>{try{const value=brief();if(await copy(value)){markBriefCopied();showBrief();}else showBrief();}catch(e){toast(errorText(e));}});
document.querySelectorAll('[data-action=share]').forEach(b=>b.onclick=showInvite);
document.querySelectorAll('[data-action=rules]').forEach(b=>b.onclick=()=>goTo('mechanism'));
document.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>selectShares(b.dataset.quantity));
for(const [action,step]of [['minus',-1],['plus',1]])document.querySelector('[data-action='+action+']').onclick=()=>selectShares(Math.max(1,Math.min(10,Number($('quantity').value)+step)));
$('mint-form').onsubmit=e=>{e.preventDefault();clearTimeout(inputTimer);refreshQuote();};
$('agent-name').oninput=()=>{model.copied=false;model.receipt=null;renderJourney();++quoteRequest;model.quote=null;model.identity=null;renderQuote();clearTimeout(inputTimer);inputTimer=setTimeout(refreshQuote,650);};$('quantity').oninput=()=>selectShares($('quantity').value);
$('participation-refresh').onclick=()=>{if(!selectedName()){goTo('mint');$('agent-name').focus();return;}refreshState();};
$('participation-history').onclick=()=>{$('activity-query').value=model.identity?.name||selectedName();goTo('activity');loadActivity();};
$('forget-identity').onclick=()=>{try{forgetIdentity(localStorage);}catch{}++quoteRequest;$('agent-name').value='';model.identity=null;model.quote=null;model.referrer=null;model.copied=false;model.receipt=null;renderQuote();renderJourney();toast(t('已清除本机记住的公开身份。','Remembered public identity cleared on this device.'));};
document.querySelectorAll('[data-action=verify-return]').forEach(b=>b.onclick=verifyReturn);
$('refresh-chain').onclick=refreshState;$('copy-invite-link').onclick=()=>copy($('my-invite-link').value,$('my-invite-link'));
$('activity-form').onsubmit=e=>{e.preventDefault();loadActivity();};$('activity-chain').onclick=()=>loadActivity();$('activity-older').onclick=()=>loadActivity(true);$('activity-mine').onclick=()=>{$('activity-query').value=model.identity?.name||selectedName();loadActivity();};
document.addEventListener('echo:language',()=>{renderState();renderRows();renderJourney();});
try{const remembered=rememberedIdentity(localStorage);if(remembered)$('agent-name').value=remembered;}catch{}
if(incoming.get('identity')){try{$('agent-name').value=normalizeHandle(incoming.get('identity'));}catch{}}
renderState();refreshState().then(()=>{if(activeContentModule()==='activity')loadActivity();if(activeContentModule()==='teams')growthCampaign.load();const tx=incoming.get('tx');if(tx&&/^0x[0-9a-f]{64}$/i.test(tx)){if(activeContentModule()!=='activity')navigateToContent('activity');showReceipt(tx);}});
const timer=setInterval(()=>{if(!document.hidden)refreshState();},30000);window.addEventListener('pagehide',()=>{clearInterval(timer);model.client?.destroy();});
