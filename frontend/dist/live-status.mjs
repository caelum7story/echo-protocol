export function liveMintStatus(state,{fresh=false,language='zh'}={}){
 const en=language==='en',t=(zh,english)=>en?english:zh;
 if(!state||!fresh)return {fresh:false,open:false,label:t('待核验','Unverified'),message:state?t('上次读取 · 请刷新核验最新 Mint 状态','Previous reading · Refresh to verify current Mint status'):t('尚未取得链上状态 · 请刷新或交给 Agent 核验','Chain state unavailable · Refresh or ask your Agent to verify'),block:state?.block??null};
 const open=!!state.mintEnabled&&!state.paused&&!state.closed&&!state.retired&&state.totalMinted<10000;
 const label=open?t('开放中','Open'):state.retired?t('已停用','Retired'):state.closed||state.totalMinted>=10000?t('已结束','Ended'):state.paused?t('暂停中','Paused'):t('未开放','Not open');
 return {fresh:true,open,label,message:open?t('Mint 已开放 · 链上状态已核验','Mint is open · On-chain state checked'):t('Mint 状态已核验 · ','Mint state checked · ')+label,block:state.block??null};
}
