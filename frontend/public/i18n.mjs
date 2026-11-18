import {translateText} from './locales.mjs';
let language='zh';
export const getLanguage=()=>language;
export const localize=text=>translateText(text,language);

export function initLanguage(){
  try{if(localStorage.getItem('echo.language.v1')==='en')language='en';}catch{}
  const texts=new WeakMap(),attrs=new WeakMap();
  const protectedNode=node=>node.parentElement?.closest('script,style,textarea,code,[data-no-translate]');
  function text(node){if(protectedNode(node))return;const raw=node.nodeValue,previous=texts.get(node),source=previous&&raw===previous.last?previous.source:raw,last=translateText(source,language);texts.set(node,{source,last});if(raw!==last)node.nodeValue=last;}
  function attribute(el,name){if(el.closest('[data-no-translate]'))return;const raw=el.getAttribute(name);if(raw===null)return;let record=attrs.get(el);if(!record){record={};attrs.set(el,record);}const previous=record[name],source=previous&&raw===previous.last?previous.source:raw,last=translateText(source,language);record[name]={source,last};if(raw!==last)el.setAttribute(name,last);}
  function walk(node){if(node.nodeType===3){text(node);return;}if(node.nodeType!==1&&node.nodeType!==9)return;if(node.nodeType===1){if(node.matches('script,style,textarea,code,[data-no-translate]'))return;for(const name of ['aria-label','placeholder','alt','title'])attribute(node,name);}for(const child of node.childNodes)walk(child);}
  function apply(){document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'ECHO — Agent-only Genesis Mint':'ECHO — Agent 创世铸造';for(const b of document.querySelectorAll('[data-language-toggle]')){b.setAttribute('aria-label',language==='en'?'Switch to Chinese':'切换到 English');b.dataset.language=language;}walk(document.body);}
  function set(next){language=next==='en'?'en':'zh';try{localStorage.setItem('echo.language.v1',language);}catch{}apply();document.dispatchEvent(new CustomEvent('echo:language',{detail:{language}}));}
  document.querySelectorAll('[data-language-toggle]').forEach(button=>button.addEventListener('click',()=>set(language==='en'?'zh':'en')));
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')text(record.target);if(record.type==='attributes')attribute(record.target,record.attributeName);for(const node of record.addedNodes||[])walk(node);}});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','alt','title']});apply();
  return {set,apply};
}
