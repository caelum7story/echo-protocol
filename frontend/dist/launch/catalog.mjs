import {newDraft,RULES} from './core.mjs';
const DAY=86400000;
export const EXAMPLES=[
 {id:'example-aurum',type:'nft',name:'Aurum Editions',symbol:'AURM',category:'art',cover:'./covers/aurum-studio.svg',
  zh:'以十二件金色作品，体验一次完整的 NFT 发行。',en:'Twelve golden editions. Explore an NFT launch from subscription to delivery.',scenario:'raising'},
 {id:'example-orbit',type:'token',name:'Orbit Tools',symbol:'ORBT',category:'tools',cover:'./covers/orbit-observatory.svg',
  zh:'从固定价认购，到建池、派发与交易规则。',en:'A fixed-price token launch, from subscription to liquidity and distribution.',scenario:'raising'},
 {id:'example-atelier',type:'nft',name:'Atelier Archive',symbol:'ATLR',category:'culture',cover:'./covers/atelier-collective.svg',
  zh:'看看未售罄的 NFT 项目如何退回认购本金。',en:'Explore the full-principal refund path when an NFT launch does not sell out.',scenario:'failed'},
 {id:'example-signal',type:'token',name:'Signal Collective',symbol:'SGNL',category:'community',cover:'./covers/aurum-studio.svg',
  zh:'体验建池后的待派发、已到账与自助领取兜底。',en:'Explore pending distribution, delivery and the self-claim fallback after liquidity.',scenario:'succeeded'}
];
export function exampleProject(id,now=Date.now()){
 const x=EXAMPLES.find(p=>p.id===id);if(!x)return null;
 const raw={...newDraft(x.type,now),name:x.name,symbol:x.symbol,category:x.category,cover:x.cover,
  tagline:x.zh,description:x.type==='nft'
   ?'此项目仅供本地交互演示。NFT 图像、编号、认购、失败退款与成功领取均为示例，不对应真实资产或项目。'
   :'此项目仅供本地交互演示。展示固定价格托管认购、最低募集额、建池、派发和卖出税规则，不对应真实资产或交易。',
  startsAt:new Date(now-DAY).toISOString(),nftSupply:'12',price:x.type==='nft'?'0.005':'0.00000001',minimumRaise:'1'};
 raw.metadataText=JSON.stringify(Array.from({length:12},(_,i)=>({name:`${x.name} #${i+1}`,image:x.cover,
  description:'ECHO Launch local example. Not a minted NFT.',attributes:[{trait_type:'Edition',value:i+1}]})),null,2);
 return {id:x.id,raw,example:true,scenario:x.scenario,copy:x};
}
export const SCENARIOS=['scheduled','raising','paused','exit-closed','pool-pending','succeeded','failed','pool-failed','cancelled'];
export function scenarioProject(project,scenario=project.scenario??'raising',now=Date.now()){
 const raw={...project.raw};let start=now-DAY,sold=raw.type==='nft'?BigInt(raw.nftSupply)/3n:120000000n;
 const state={soldUnits:sold.toString(),paused:false};
 if(scenario==='scheduled'){start=now+DAY;state.soldUnits='0';}
 if(scenario==='paused'){state.paused=true;state.pausedAt=now-3600000;}
 if(scenario==='exit-closed')start=now-RULES.durationSeconds*1000+600000;
 if(['failed','pool-pending','pool-failed'].includes(scenario))start=now-RULES.durationSeconds*1000-3600000;
 if(scenario==='failed')state.soldUnits=raw.type==='nft'?(BigInt(raw.nftSupply)/3n).toString():'20000000';
 if(scenario==='pool-pending')state.closedAt=now-3600000;
 if(scenario==='pool-failed'){start=now-RULES.durationSeconds*1000-RULES.poolGraceSeconds*1000-3600000;state.closedAt=now-RULES.poolGraceSeconds*1000-3600000;}
 if(scenario==='succeeded'){
  state.soldUnits=raw.type==='nft'?raw.nftSupply:'200000000';
  if(raw.type==='token'){start=now-RULES.durationSeconds*1000-3600000;state.poolCreated=true;state.closedAt=now-3600000;state.poolCreatedAt=now-1800000;}
 }
 if(scenario==='cancelled')state.cancelled=true;
 raw.startsAt=new Date(start).toISOString();
 return {...project,raw,state,scenario};
}
