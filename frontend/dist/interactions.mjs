import {formatBNB} from './model.mjs';

export function initInteractions({identity,quote,referrals,openModal,showBrief,showAccount,toast}) {
  const $=id=>document.getElementById(id);
  const menu=$('site-nav'),toggle=$('menu-toggle');
  const closeMenu=()=>{menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','打开导航菜单');};
  toggle.addEventListener('click',()=>{
    const open=!menu.classList.contains('is-open');menu.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
  });
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && menu.classList.contains('is-open')){closeMenu();toggle.focus();}});
  document.addEventListener('click',e=>{if(!menu.contains(e.target) && !toggle.contains(e.target))closeMenu();});

  function sync() {
    const name=identity(true),q=quote(true),source=name ? referrals.resolve(name) : null;
    $('desk-identity').textContent=name || '填写你的 .ai 名称';
    $('desk-identity-state').textContent=name ? '示例身份 · 尚未连接钱包' : '仅用于预览，未进行身份核验';
    $('desk-order-state').textContent=source?.firstOrder===false ? '本机已有模拟首单' : '本机尚无模拟首单';
    $('mobile-cost').textContent=q ? `${q.quantity} 份 · ${formatBNB(q.costWei)} BNB` : '请检查 Mint 份数';
    $('mobile-receive').textContent=q ? `${q.tokens.toLocaleString('zh-CN')} ECHO · 演示` : '输入 1–10 的整数';
    $('mobile-agent').disabled=!q;
    $('mint-form').querySelector('[data-action=agent]').disabled=!q;
  }

  function entry() {
    closeMenu();showBrief();
  }

  document.querySelectorAll('[data-action="entry"]').forEach(button=>button.addEventListener('click',entry));
  const tabs=[...document.querySelectorAll('[data-rule-tab]')];
  const mobileTabs=window.matchMedia('(max-width: 760px)');
  const orientTabs=()=>document.querySelector('[role=tablist]').setAttribute('aria-orientation',mobileTabs.matches?'horizontal':'vertical');
  orientTabs();mobileTabs.addEventListener('change',orientTabs);
  function selectTab(tab,focus=false) {
    for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active ? 0 : -1;$(item.getAttribute('aria-controls')).hidden=!active;}
    if(focus)tab.focus();
  }
  for(const tab of tabs){
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',e=>{const i=tabs.indexOf(tab);let next;
      const forward=mobileTabs.matches?'ArrowRight':'ArrowDown',backward=mobileTabs.matches?'ArrowLeft':'ArrowUp';
      if(e.key===forward)next=tabs[(i+1)%tabs.length];if(e.key===backward)next=tabs[(i+tabs.length-1)%tabs.length];
      if(e.key==='Home')next=tabs[0];if(e.key==='End')next=tabs[tabs.length-1];if(next){e.preventDefault();selectTab(next,true);}
    });
  }
  if(tabs.length)selectTab(tabs[0]);
  $('agent-name').addEventListener('input',sync);
  document.addEventListener('echo:quote',sync);document.addEventListener('echo:referral',sync);
  sync();return {sync,entry};
}
