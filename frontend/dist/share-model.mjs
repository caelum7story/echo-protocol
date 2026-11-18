import {normalizeIdentity,quoteRecordedMint,formatBNB} from './model.mjs';
import {buildReferralLink} from './referral.mjs';

export function participationCard(order,baseUrl,language='zh'){
  if(!order||!/^DEMO-\d+$/.test(order.id))throw new Error('只能为已有模拟订单生成结果卡。');
  const identity=normalizeIdentity(order.identity),q=quoteRecordedMint(order);
  return Object.freeze({kind:'preview',language:language==='en'?'en':'zh',id:order.id,identity,quantity:q.quantity,tokens:q.tokens,
    cost:`${formatBNB(q.costWei)} BNB`,link:buildReferralLink(baseUrl,identity),
    label:language==='en'?'Local demo · Not an on-chain receipt':'本机模拟参与 · 非链上凭证'});
}

export function cardShareText(card){
  if(card.kind!=='preview')throw new Error('未知卡片类型。');
  if(card.language==='en')return `${card.identity} · ECHO participation preview\n${card.quantity} simulated Mint ${card.quantity===1?'share':'shares'} / ${card.tokens.toLocaleString('en-US')} ECHO demo allocation\n${card.label}\n${card.link}`;
  return `${card.identity} · ECHO 参与体验\n${card.quantity} 份模拟 Mint / ${card.tokens.toLocaleString('zh-CN')} ECHO 演示份额\n${card.label}\n${card.link}`;
}

// This is a dynamic UI receipt, drawn from public text, not an edited artwork.
export function drawParticipationCard(card,document){
  const en=card.language==='en';
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;
  const c=canvas.getContext('2d');if(!c)throw new Error('当前浏览器无法生成图片，请复制结果文字。');
  const bg=c.createLinearGradient(0,0,1200,1500);bg.addColorStop(0,'#38260f');bg.addColorStop(.55,'#110d08');bg.addColorStop(1,'#2c1e0d');c.fillStyle=bg;c.fillRect(0,0,1200,1500);
  c.strokeStyle='#ad9056';c.lineWidth=1;c.strokeRect(48,48,1104,1404);
  const text=(value,x,y,size,color='#e8e0cf',font='sans-serif')=>{c.fillStyle=color;c.font=`${size}px ${font}`;c.fillText(value,x,y);};
  const foil=c.createLinearGradient(90,0,900,0);foil.addColorStop(0,'#bd8b36');foil.addColorStop(.35,'#ffe7a6');foil.addColorStop(.72,'#d4a24b');foil.addColorStop(1,'#fff0c2');
  text('ECHO',90,205,130,foil,'"Echo Display",Georgia,serif');
  text('GENESIS / PARTICIPATION PREVIEW',94,260,20,'#cfbe9c','monospace');
  c.strokeStyle='#ad9055';c.beginPath();c.moveTo(94,310);c.lineTo(1106,310);c.stroke();
  text('THE FIRST SIGNAL IS YOURS.',94,390,21,'#d3c3a4','monospace');
  let nameSize=card.identity.length>22?48:76;c.font=`${nameSize}px sans-serif`;
  while(c.measureText(card.identity).width>1000&&nameSize>20){nameSize-=2;c.font=`${nameSize}px sans-serif`;}
  text(card.identity,90,510,nameSize,'#faf9f6');text(en?'My signal, recorded with ECHO.':'我在 ECHO 留下了一声回响。',94,585,29,'#d8caaf');
  text(card.tokens.toLocaleString('zh-CN'),87,815,165,foil,'"Echo Display",Georgia,serif');
  text(en?'ECHO / DEMO ALLOCATION':'ECHO / 演示份额',94,905,26,'#d1c1a0');text(en?`${card.quantity} simulated Mint shares`:`${card.quantity} 份模拟 Mint`,94,970,29,'#e6ddcb');
  c.strokeStyle='#ad9055';c.beginPath();c.moveTo(94,1015);c.lineTo(1106,1015);c.stroke();
  text(en?'LOCAL DEMO / NOT AN ON-CHAIN RECEIPT':'本机模拟参与 · 非链上凭证',94,1091,30,'#f4f0e7');text(en?'No BNB spent. No real tokens received.':'没有支付 BNB，也未收到真实代币。',94,1142,25,'#d1c1a0');
  text(en?'OPEN MY INVITATION':'打开我的邀请链接 / INVITATION',94,1232,21,'#d1c1a0');
  const url=new URL(card.link);text(url.host,94,1286,30,'#f0eadf');text(`?ref=${card.identity}`,94,1330,23,'#dbceb4','monospace');
  text(en?'PRIVATE PREVIEW / PUBLIC ACCESS NOT ENABLED':'私人预览 · 公开站点后朋友才能访问',94,1402,22,'#cab792');
  return canvas;
}
