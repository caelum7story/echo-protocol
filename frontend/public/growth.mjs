import {getLanguage,localize} from './i18n.mjs';
import {normalizeIdentity,quoteMint} from './model.mjs';
import {buildReferralLink} from './referral.mjs';
import {participationCard,cardShareText,drawParticipationCard} from './share-model.mjs';

export function initGrowth({identity,referrals,openModal,closeModal,goTo,toast,baseUrl}){
  const $=id=>document.getElementById(id);let mode='chain',filter='';
  async function copy(value,field){try{await navigator.clipboard.writeText(value);toast('已复制。');}catch{field?.focus();field?.select();toast('请长按或使用复制快捷键复制。');}}
  function showLocal(name=''){mode='preview';filter=name;$('activity-query').value=name;render();}
  function render(){
    $('activity-chain').setAttribute('aria-pressed',String(mode==='chain'));
    $('activity-preview').setAttribute('aria-pressed',String(mode==='preview'));
    $('activity-source').textContent=mode==='chain'?'链上数据 · 尚未接入正式合约':'本机模拟记录 · 身份未核验';
    const list=$('activity-list');list.replaceChildren();
    const orders=mode==='preview'?referrals.orders().filter(o=>!filter||o.identity===filter):[];
    $('activity-empty').hidden=orders.length>0;
    $('activity-empty-title').textContent=mode==='chain'?'正式合约确定后，在这里查看真实参与。':filter?'这个 .ai 名称还没有本机模拟记录。':'你的第一声回响，还没有开始。';
    $('activity-empty-note').textContent=mode==='chain'?'当前没有链上 Mint 记录接入，不展示虚构参与者。可切换到本机体验记录。':'返回 Mint 区完成一次模拟，结果会出现在这里。记录仅保存在这个浏览器。';
    for(const order of orders.slice(0,12)){
      const row=document.createElement('article');row.className='activity-row';
      const name=document.createElement('div'),badge=document.createElement('span'),handle=document.createElement('strong'),sub=document.createElement('small');
      name.className='activity-person';badge.className='activity-avatar';badge.textContent=order.identity[0].toUpperCase();handle.textContent=order.identity;sub.textContent='示例身份 · 未核验';const label=document.createElement('div');label.append(handle,sub);name.append(badge,label);
      const qty=document.createElement('div');qty.className='activity-amount';const q=quoteMint(order.quantity);qty.textContent=`${q.tokens.toLocaleString('zh-CN')} ECHO`;const source=document.createElement('small');source.textContent=`${q.quantity} 份模拟 · ${order.id}`;qty.append(source);
      const action=document.createElement('button');action.type='button';action.className='text-button';action.textContent='查看结果卡 ↗';action.addEventListener('click',()=>showCard(order.id));
      row.append(name,qty,action);list.append(row);
    }
  }
  function showInvite(){
    openModal('ECHO / INVITATION','<h2 id="modal-title">下一声回响，由你邀请。</h2><p>链接带上你的公开 .ai 名称，朋友打开即可看见分享人。</p><label class="share-field-label" for="share-name">你的公开 .ai 名称</label><input class="share-field" id="share-name" autocomplete="off" maxlength="67" spellcheck="false" aria-describedby="share-error"><p class="input-error" id="share-error" aria-live="polite"></p><label class="share-field-label" for="share-url">专属邀请链接</label><textarea id="share-url" readonly aria-label="专属邀请链接"></textarea><button class="button button-ink" id="share-native" type="button">分享邀请链接 ↗</button><button class="button button-ghost share-copy" id="share-copy" type="button">复制链接</button><div class="share-result-entry" id="share-result-entry"></div><p class="modal-note">目前仅你可见，公开站点后朋友才能访问。名称未经钱包核验；当前没有真实奖励。</p>');
    $('share-name').value=identity(true)||'';let link='';
    function sync(){
      let name='';try{name=normalizeIdentity($('share-name').value);link=buildReferralLink(baseUrl,name);$('share-url').value=link;$('share-error').textContent='';}catch{link='';$('share-url').value='';$('share-error').textContent='请输入有效的 .ai 名称。';}
      $('share-native').disabled=!link;$('share-copy').disabled=!link;
      const target=$('share-result-entry');target.replaceChildren();const order=referrals.orders().find(o=>o.identity===name);
      if(order){const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='生成我的参与结果卡 ↗';button.addEventListener('click',()=>showCard(order.id));target.append(button);}
      else{const note=document.createElement('p');note.textContent='完成一次模拟 Mint 后，可生成带参与份额的结果卡。';target.append(note);}
    }
    $('share-name').addEventListener('input',sync);sync();
    $('share-copy').addEventListener('click',()=>copy(link,$('share-url')));
    $('share-native').addEventListener('click',async()=>{if(!link)return;if(typeof navigator.share==='function'){try{await navigator.share({title:localize('ECHO · 我的邀请'),text:localize('体验 ECHO 的 Agent 参与流程。当前为私人演示，没有真实 Mint 或奖励。'),url:link});return;}catch(e){if(e.name==='AbortError')return;}}await copy(link,$('share-url'));});
  }
  function showCard(id){
    const order=referrals.orders().find(o=>o.id===id);if(!order){toast('没有找到这笔本机模拟订单。');return;}
    const card=participationCard(order,baseUrl,getLanguage());
    openModal('ECHO / PARTICIPATION CARD','<h2 id="modal-title">把你的回响，分享出去。</h2><div class="result-card-preview" id="result-card-preview"><div class="result-card-top"><b>ECHO</b><span>PARTICIPATION PREVIEW</span></div><span class="result-card-eyebrow">THE FIRST SIGNAL IS YOURS.</span><strong class="result-card-handle" id="card-handle"></strong><div class="result-card-allocation"><strong id="card-tokens"></strong><span>ECHO / 演示份额</span></div><span id="card-quantity"></span><div class="result-card-stamp">本机模拟参与 · 非链上凭证</div><small>没有支付 BNB，也未收到真实代币。</small><span class="result-card-ref" id="card-ref"></span></div><button class="button button-ink" id="card-share" type="button">分享结果图片 ↗</button><button class="button button-ghost share-copy" id="card-save" type="button">保存 PNG 图片 ↓</button><button class="text-button" id="card-copy" type="button">复制结果与邀请链接 ↗</button><textarea class="card-copy-field" id="card-copy-text" readonly aria-label="参与结果文字"></textarea><p class="input-error" id="card-error" role="status"></p><img id="card-export-image" class="card-export-image" alt="可长按保存的 ECHO 模拟参与结果卡" hidden><p class="modal-note">图片只包含公开名称、演示份额和邀请来源链接。私人站点公开后，朋友才能访问。</p>');
    $('card-handle').textContent=card.identity;$('card-tokens').textContent=card.tokens.toLocaleString('zh-CN');$('card-quantity').textContent=`${card.quantity} 份模拟 Mint / ${card.id}`;$('card-ref').textContent=`INVITATION / ${card.identity}`;$('card-copy-text').value=cardShareText(card);
    let busy=false,pictureURL=null;
    document.getElementById('modal').addEventListener('close',()=>{if(pictureURL)URL.revokeObjectURL(pictureURL);},{once:true});
    async function imageFile(){if(document.fonts?.ready)await document.fonts.ready;const canvas=drawParticipationCard(card,document);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请复制结果文字。')),'image/png'));return new File([blob],`echo-${card.id.toLowerCase()}.png`,{type:'image/png'});}
    async function exportCard(share){if(busy)return;busy=true;const shareButton=$('card-share'),saveButton=$('card-save'),error=$('card-error');shareButton.disabled=true;saveButton.disabled=true;error.textContent='正在生成图片…';try{const file=await imageFile();if(share&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:localize('ECHO · 我的回响'),text:cardShareText(card)});error.textContent='';}else{if(pictureURL)URL.revokeObjectURL(pictureURL);pictureURL=URL.createObjectURL(file);const image=$('card-export-image');image.src=pictureURL;image.hidden=false;const a=document.createElement('a');a.href=pictureURL;a.download=file.name;document.body.append(a);a.click();a.remove();error.textContent=share?'当前设备未提供图片分享，已生成 PNG；也可长按下方图片保存。':'PNG 已生成；若没有自动下载，可长按下方图片保存。';}}catch(e){error.textContent=e.name==='AbortError'?'已取消分享。':e.message||'图片暂不可用，请复制结果文字。';}finally{busy=false;shareButton.disabled=false;saveButton.disabled=false;}}
    $('card-share').addEventListener('click',()=>exportCard(true));$('card-save').addEventListener('click',()=>exportCard(false));$('card-copy').addEventListener('click',()=>copy(cardShareText(card),$('card-copy-text')));
  }
  $('activity-chain').addEventListener('click',()=>{mode='chain';render();});$('activity-preview').addEventListener('click',()=>{mode='preview';render();});
  $('activity-form').addEventListener('submit',e=>{e.preventDefault();try{filter=$('activity-query').value.trim()?normalizeIdentity($('activity-query').value):'';$('activity-query-error').textContent='';render();}catch(error){$('activity-query-error').textContent=error.message;}});
  $('activity-mine').addEventListener('click',()=>{const name=identity(true);if(!name){toast('先在 Mint 区填写 .ai 名称。');goTo('mint');return;}showLocal(name);});
  document.querySelectorAll('[data-action=share]').forEach(b=>b.addEventListener('click',showInvite));
  $('copy-invite-link').addEventListener('click',()=>copy($('my-invite-link').value,$('my-invite-link')));
  document.addEventListener('echo:referral',render);document.addEventListener('echo:language',render);render();
  return {render,showInvite,showCard,showLocal,viewRecords(){closeModal();showLocal();goTo('activity');}};
}
