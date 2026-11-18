import {REFERRAL_REWARD_POLICY} from './referral-rewards.mjs';

const count=value=>{
 if(typeof value==='string'&&!/^\d{1,4}$/.test(value.trim()))return null;
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=9999?n:null;
};
export function teamPreview({firstMints,paidIdentities}={}){
 const total=count(firstMints),paid=count(paidIdentities);
 if(total===null||paid===null)return {available:false,error:'INVALID_COUNT'};
 if(paid>total)return {available:false,error:'PAID_EXCEEDS_TOTAL'};
 return {available:true,firstMints:total,paidIdentities:paid,
  rewardEcho:total*REFERRAL_REWARD_POLICY.tokensPerSuccessfulInvite,
  extraPaidAllowance:total*REFERRAL_REWARD_POLICY.extraPaidMintAllowancePerInvite,
  teamPoints:paid};
}

export function initTeamPreview({getLanguage}){
 if(document.getElementById('team-preview'))return;
 const root=document.createElement('details');root.id='team-preview';root.className='team-preview';root.dataset.noTranslate='';
 root.innerHTML='<summary id="team-preview-title"></summary><p id="team-preview-intro"></p><div class="team-preview-fields"><label><span id="team-preview-total-label"></span><input id="team-preview-total" type="number" min="0" max="9999" step="1" inputmode="numeric" value="0" aria-describedby="team-preview-state"></label><label><span id="team-preview-paid-label"></span><input id="team-preview-paid" type="number" min="0" max="9999" step="1" inputmode="numeric" value="0" aria-describedby="team-preview-state"></label></div><dl class="team-preview-stats"><div><dt id="team-preview-reward-label"></dt><dd id="team-preview-reward">—</dd></div><div><dt id="team-preview-quota-label"></dt><dd id="team-preview-quota">—</dd></div><div><dt id="team-preview-score-label"></dt><dd id="team-preview-score">—</dd></div></dl><p id="team-preview-state" role="status" aria-live="polite"></p><p id="team-preview-note"></p>';
 document.querySelector('#growth-campaign .campaign-offers').after(root);
 const $=id=>document.getElementById(id),t=(zh,en)=>getLanguage()==='en'?en:zh;
 function render(){
  const text=(id,value)=>$(id).textContent=value;
  text('team-preview-title',t('试算邀请奖励与战队积分','Preview invite rewards & team points'));
  text('team-preview-intro',t('输入假设的有效直接邀请人数，区分首铸奖励与付费计分。','Try a number of qualifying direct referrals. First-mint rewards and paid-invite points are counted separately.'));
  text('team-preview-total-label',t('完成首次 Mint 的好友','Friends completing their first Mint'));
  text('team-preview-paid-label',t('其中完成首次付费的好友','Of those, first-paid Mint friends'));
  text('team-preview-reward-label',t('邀请奖励情景 · ECHO','Referral reward scenario · ECHO'));
  text('team-preview-quota-label',t('额外付费额度 · 份','Extra paid allowance · shares'));
  text('team-preview-score-label',t('战队积分情景 · 分','Team score scenario · points'));
  text('team-preview-note',t('每位有效首铸好友对应 200 ECHO 与 1 份额外付费额度，免费首铸也计入；战队只计不同好友的首次付费。实际名次和发放按公开规则核对，前三奖金另计。','Each qualifying first-mint friend represents 200 ECHO and one extra paid allowance; eligible free first mints count. Team points require distinct first-paid friends. Actual ranks and payments follow the public rules; top-three prizes are separate.'));
  const s=teamPreview({firstMints:$('team-preview-total').value,paidIdentities:$('team-preview-paid').value});
  const fmt=n=>new Intl.NumberFormat(getLanguage()==='en'?'en-US':'zh-CN').format(n);
  text('team-preview-reward',s.available?fmt(s.rewardEcho):'—');text('team-preview-quota',s.available?'+'+fmt(s.extraPaidAllowance):'—');text('team-preview-score',s.available?fmt(s.teamPoints):'—');
  root.dataset.valid=String(s.available);
  text('team-preview-state',s.available?t('仅为情景试算，不是链上成绩、已获奖金额或到账余额。','Scenario only: not an on-chain score, awarded amount or received balance.'):s.error==='PAID_EXCEEDS_TOTAL'?t('首次付费人数不能超过有效首铸好友总数。','First-paid friends cannot exceed the total first-mint friends.'):t('请输入 0–9,999 的整数人数。','Enter whole counts from 0 to 9,999.'));
 }
 $('team-preview-total').addEventListener('input',render);$('team-preview-paid').addEventListener('input',render);
 document.addEventListener('echo:language',render);render();
}
