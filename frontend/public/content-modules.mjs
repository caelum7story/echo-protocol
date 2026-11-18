export const CONTENT_MODULES=Object.freeze([
 {key:'home',anchor:'top',selector:'.landing-hero',zh:'首页',en:'Home'},
 {key:'mint',anchor:'mint',selector:'#mint',zh:'铸造',en:'Mint'},
 {key:'invite',anchor:'invite',selector:'#invite',zh:'邀请奖励',en:'Rewards'}
]);
export const PRIMARY_CONTENT_NAV=Object.freeze([
 {key:'home',href:'#top',zh:'首页',en:'Home'},
 {key:'mint',href:'#mint',zh:'铸造',en:'Mint'},
 {key:'launch',href:'/launch/',zh:'Launch',en:'Launch'},
 {key:'invite',href:'#invite',zh:'邀请奖励',en:'Rewards'}
]);
export function cleanContentAnchor(value=''){
  try{const id=decodeURIComponent(String(value).replace(/^#/,''));return !id?'top':/^[a-z][a-z0-9-]*$/i.test(id)?id:null;}catch{return null;}
}
export function contentModuleForAnchor(value=''){
  const id=cleanContentAnchor(value);
  const aliases={home:'home',teams:'invite',team:'invite','growth-campaign':'invite','team-preview':'invite',activity:'mint',rules:'mint',mechanism:'mint','my-participation':'mint','launch-overview':'mint','flow-title':'mint'};
  return CONTENT_MODULES.find(m=>m.anchor===id)?.key||(Object.hasOwn(aliases,id)?aliases[id]:null);
}
let controller=null,active=null;
export const activeContentModule=()=>active;
export function navigateToContent(id){return controller?.navigate(id,{scroll:true,history:true});}

export function initContentModules({getLanguage,getIdentity=()=>'',onIdentityQuery=async()=>({ok:false}),onChange=()=>{}}){
  const t=(zh,en)=>getLanguage()==='en'?en:zh;
  const labels=[];
  const label=(node,zh,en)=>{labels.push({node,zh,en});node.textContent=t(zh,en);return node;};
  const fold=(parent,zh,en,nodes,cls='module-fold')=>{const details=document.createElement('details');details.className=cls;const summary=label(document.createElement('summary'),zh,en);summary.dataset.noTranslate='';details.append(summary,...nodes.filter(Boolean));parent.append(details);return details;};
  const header=document.querySelector('.site-header');
  const groups=CONTENT_MODULES.map(m=>({...m,root:document.querySelector(m.selector)}));
  if(groups.some(m=>!m.root))throw Error('CONTENT_MODULE_MISSING');
  // Put the actual Mint form before longer read-only information. Keep all live nodes.
  const mintWrap=document.querySelector('#mint > .wrap');
  fold(mintWrap,'铸造进度与预估开盘价','Mint progress & opening estimate',[
    document.querySelector('.supply'),document.querySelector('#launch-overview'),document.querySelector('.opening-estimate-card')
  ]);
  fold(mintWrap,'首免与铸造额度','Free allocation & Mint limits',[
    document.querySelector('.mint-specs'),document.querySelector('.free-mint-status')
  ]);
  fold(mintWrap,'我的参与记录与额度','My participation & quota',[document.querySelector('#my-participation')]);
  const rebate=document.querySelector('.team-rebate-details');
  if(rebate)document.querySelector('#invite > .wrap').append(rebate);
  // Keep instructions available inside Mint without adding another full page.
  const flow=document.querySelector('.participation-section');
  if(flow)fold(mintWrap,'查看 Agent 参与步骤','How to participate with your Agent',[flow],'module-flow');
  fold(mintWrap,'铸造记录','Mint records',[document.querySelector('#activity')],'module-fold module-records');
  fold(mintWrap,'铸造规则','Mint rules',[document.querySelector('#mechanism')],'module-fold module-rules');
  fold(document.querySelector('#invite > .wrap'),'战队系统','Team system',[document.querySelector('#growth-campaign')],'module-fold module-teams');
  const nav=document.createElement('nav');nav.className='content-module-nav';nav.setAttribute('aria-label',t('内容模块','Content modules'));
  const rail=document.createElement('div');rail.className='content-module-rail wrap';nav.append(rail);
  const main=document.createElement('div');main.className='module-primary';rail.append(main);
  for(const m of groups)m.root.dataset.modulePanel=m.key;
  for(const m of PRIMARY_CONTENT_NAV){const a=label(document.createElement('a'),m.zh,m.en);a.href=m.href;a.dataset.contentModule=m.key;a.dataset.noTranslate='';main.append(a);}
  header.after(nav);document.body.classList.add('modules-ready');
  const identityForms=[];
  for(const key of ['teams','invite']){
    const form=document.createElement('form');form.className='module-identity-form';form.dataset.noTranslate='';
    const caption=label(document.createElement('label'),'你的官方 .ai 身份','Your official .ai identity');caption.htmlFor='module-identity-'+key;
    const row=document.createElement('div');row.className='module-identity-row';const input=document.createElement('input');input.id=caption.htmlFor;input.type='text';input.maxLength=67;input.placeholder='yourname.ai';input.autocomplete='off';input.spellcheck=false;input.value=getIdentity();
    const button=label(document.createElement('button'),'核验身份','Check identity');button.type='submit';
    const status=document.createElement('p');status.id=input.id+'-status';status.setAttribute('role','status');input.setAttribute('aria-describedby',status.id);
    status.textContent=t('先核验身份，再生成你的邀请链接。','Verify your identity, then create your invitation link.');row.append(input,button);form.append(caption,row,status);
    if(key==='teams')document.querySelector('.team-module-actions').before(form);else (document.querySelector('#invite-public-query')||document.querySelector('.invitation-copy')).append(form);
    identityForms.push({key,input,status,button,form});
    let request=0;
    input.addEventListener('input',()=>{++request;form.dataset.verified='false';status.textContent=t('点击核验，将公开查询该身份。','Tap Check identity to query this public identity.');});
    form.addEventListener('submit',async e=>{e.preventDefault();const current=++request;button.disabled=true;status.textContent=t('正在核验官方身份…','Checking official identity…');try{const result=await onIdentityQuery(input.value);if(current===request){status.textContent=result.message||t('查询暂不可用，请重试。','Query unavailable. Please retry.');form.dataset.verified=String(!!result.ok);}}catch{if(current===request)status.textContent=t('查询暂不可用，请重试。','Query unavailable. Please retry.');}finally{button.disabled=false;}});
  }
  const headerSize=()=>document.documentElement.style.setProperty('--module-header-height',header.getBoundingClientRect().height+'px');
  headerSize();const observer=new ResizeObserver(headerSize);observer.observe(header);
  function reveal(value,{scroll=false,history=false}={}){
    const id=cleanContentAnchor(value)||'top',target=document.getElementById(id);
    const key=contentModuleForAnchor(id)||groups.find(m=>target&&m.root.contains(target))?.key||'home';
    const selected=groups.find(m=>m.key===key),previous=active;active=key;
    for(const m of groups)m.root.hidden=m.key!==key;
    document.body.dataset.contentModule=key;
    for(const a of rail.querySelectorAll('[data-content-module]')){const current=a.dataset.contentModule===key;if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    for(const item of identityForms)if((item.key==='teams'?'invite':item.key)===key&&document.activeElement!==item.input&&item.input.value!==getIdentity()){item.input.value=getIdentity();item.form.dataset.verified='false';item.status.textContent=t('先核验身份，再生成你的邀请链接。','Verify your identity, then create your invitation link.');}
    if(history){const url=new URL(location.href);url.hash='#'+id;if(url.href!==location.href)window.history.pushState(null,'',url);}
    const visibleTarget=target&&selected.root.contains(target)?target:selected.root;
    for(let node=visibleTarget;node&&node!==selected.root;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    if(scroll){if(key==='home')window.scrollTo({top:0,behavior:'instant'});else visibleTarget.scrollIntoView({block:'start',behavior:'instant'});}
    if(previous!==key){onChange(key);document.dispatchEvent(new CustomEvent('echo:module-change',{detail:{key}}));}
    return key;
  }
  controller={navigate:reveal};
  document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const id=cleanContentAnchor(a.getAttribute('href'));if(!id)return;e.preventDefault();reveal(id,{scroll:true,history:true});});
  const fromHistory=()=>reveal(location.hash,{scroll:true});window.addEventListener('hashchange',fromHistory);window.addEventListener('popstate',fromHistory);
  document.addEventListener('echo:language',()=>{nav.setAttribute('aria-label',t('内容模块','Content modules'));for(const {node,zh,en}of labels)node.textContent=t(zh,en);for(const item of identityForms)item.status.textContent=item.form.dataset.verified==='true'?t('身份已核验，可以生成邀请。','Identity verified. You can create your invitation.'):t('先核验身份，再生成你的邀请链接。','Verify your identity, then create your invitation link.');});
  reveal(location.hash,{scroll:!!location.hash});
  return controller;
}
