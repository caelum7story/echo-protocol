import {formatEther} from './vendor/ethers.mjs';

export function mintChoices({state=null,identity=null,fresh=false}={}){
 const validState=fresh&&state&&Number.isInteger(state.totalMinted)&&state.totalMinted>=0&&state.totalMinted<=10000&&Number.isInteger(state.freeClaimed)&&state.freeClaimed>=0&&state.freeClaimed<=1000;
 const who=identity&&Number.isInteger(identity.minted)&&identity.minted>=0&&Number.isInteger(identity.remaining)&&identity.remaining>=0?identity:null;
 let limit=10;
 if(validState){limit=Math.min(limit,10000-state.totalMinted);if(!state.opened)limit=Math.min(limit,Math.max(0,5000-state.totalMinted));if(who)limit=Math.min(limit,who.remaining);}
 const quantities=limit>0?[...new Set([1,3,5,10].map(n=>Math.min(n,limit)))]:[1];
 let price=null;try{if(validState&&!state.opened)price=BigInt(state.pricing.preOpenPrice);}catch{}
 if(price!==null&&price<0n)price=null;
 return quantities.map(shares=>{
  const possibleFree=validState&&state.freeClaimed<1000&&(!who||who.minted===0)?1:0;
  return {shares,tokens:shares*1000,disabled:limit===0||!!(validState&&(!state.mintEnabled||state.paused||state.closed||state.retired)),
   minCost:price===null?null:price*BigInt(shares-possibleFree),
   maxCost:price===null?null:price*BigInt(shares-(who?possibleFree:0)),
   identityVerified:!!who&&!!validState};
 });
}

export function initMintChoices({getLanguage}){
 const t=(zh,en)=>getLanguage()==='en'?en:zh;
 const buttons=[...document.querySelectorAll('[data-quantity]')],row=document.querySelector('.quantity-row');
 const note=document.createElement('p');note.id='mint-choice-note';note.className='mint-choice-note';note.dataset.noTranslate='';note.setAttribute('role','status');row.after(note);
 for(const button of buttons){button.classList.add('mint-choice');button.dataset.noTranslate='';button.innerHTML='<strong></strong><span></span><small></small>';}
 return {render(snapshot){
  const options=mintChoices(snapshot),fmt=n=>new Intl.NumberFormat(getLanguage()==='en'?'en-US':'zh-CN').format(n);
  buttons.forEach((button,i)=>{const option=options[i];button.hidden=!option;if(!option){button.disabled=true;return;}
   button.dataset.quantity=String(option.shares);button.disabled=option.disabled;
   const price=option.minCost===null?t('查询后报价','Quote after query'):option.minCost===option.maxCost?formatEther(option.maxCost)+' BNB':formatEther(option.minCost)+'–'+formatEther(option.maxCost)+' BNB';
   const quantityLabel=option.shares+t(' 份',option.shares===1?' share':' shares');
   button.querySelector('strong').textContent=quantityLabel;button.querySelector('span').textContent=fmt(option.tokens)+' ECHO';button.querySelector('small').textContent=price;
   button.setAttribute('aria-label',quantityLabel+', '+fmt(option.tokens)+' ECHO, '+price);
  });
  const who=snapshot.identity;
  note.textContent=!snapshot.fresh?t('选择数量后查询身份与实时费用；本页不会扣费。','Choose shares, then query identity and live costs. This page does not charge your wallet.'):snapshot.state?.opened?t('开盘后以合约实时报价为准；选择份数后交给 Agent 核验。','After opening, use the live contract quote. Choose shares for your Agent to verify.'):who?t('以上按已读取的身份和单价估算；首免最多覆盖 1 份，其余需付费。钱包还需预留 Gas，签名前重新报价。','Estimates use the queried identity and price. At most one share can be free; the rest are paid. Keep BNB for gas and re-quote before signing.'):t('费用范围取决于首免资格；每个身份最多首份免费，其余付费。先查询 .ai 核对，Gas 另计。','The range depends on first-free eligibility. At most the first share is free; later shares are paid. Query your .ai identity; gas is separate.');
 }};
}
