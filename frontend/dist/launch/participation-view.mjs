import {economics,integer,formatBnb,parseBnb} from './core.mjs';
export function subscriptionSummary(raw,quantity){
 const q=integer(quantity),e=economics(raw),paymentWei=q*e.priceWei;
 const hundredths=(q*10000n+e.publicUnits/2n)/e.publicUnits;
 const percent=q*10000n<e.publicUnits?'<0.01':`${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;
 return {quantity:q,paymentWei,publicUnits:e.publicUnits,percent};
}
export function subscriptionButtonLabel(raw,quantity,h){
 const {t,n,b,esc}=h;
 try{const s=subscriptionSummary(raw,quantity);return `<span>${t('认购','Subscribe')} ${n(s.quantity)} ${t('份',s.quantity===1n?'unit':'units')}</span><small>${b(s.paymentWei)} BNB · ${t('占公开额度','of public allocation')} ${esc(s.percent)}%</small>`;}
 catch{return `<span>${t('请填写认购份数','Enter subscription units')}</span><small>— BNB · —%</small>`;}
}
export function participationOverview(raw,e,h){
 const {t,esc,n,b}=h;
 return `<div class="participation-overview" role="group" aria-label="${t('发行数据','Launch figures')}"><div class="metrics"><div><span>${t('固定单价','Fixed unit price')}</span><strong>${b(e.priceWei)} <small>BNB</small></strong></div><div><span>${raw.type==='nft'?t('终身发行上限','Lifetime cap'):t('初始统一发行量','Uniform initial supply')}</span><strong>${n(e.totalSupply)} <small>${raw.type==='nft'?'NFT':esc(raw.symbol)||t('代币','Token')}</small></strong></div><div><span>${t('认购本金 · 示例','Active principal · Demo')}</span><strong>${b(e.raisedWei)} <small>BNB</small></strong></div><div><span>${raw.type==='nft'?t('成功条件','Success condition'):t('最低募集额','Minimum raise')}</span><strong>${raw.type==='nft'?t('全部售罄','Sell out'):b(e.minimumWei)+' BNB'}</strong></div></div><div class="progress large"><span style="width:${e.progressBps/100}%"></span></div><div class="between muted"><span>${n(e.soldUnits)} / ${n(e.publicUnits)} ${t('公开认购份额','public units')}</span><span>${(e.progressBps/100).toFixed(1)}%</span></div></div>`;
}
export function priceSummary(raw,h){
 const {t}=h;
 try{const price=parseBnb(raw.price);if(price<=0n)throw Error('POSITIVE_PRICE');return raw.type==='token'?t(`每 100 万份 ${formatBnb(price*1000000n)} BNB`,`1,000,000 units: ${formatBnb(price*1000000n)} BNB`):t(`每份 ${formatBnb(price)} BNB`,`Per unit: ${formatBnb(price)} BNB`);}
 catch{return t('待设置认购价格','Set a subscription price');}
}
