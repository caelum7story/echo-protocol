import {readGrowthReport} from './growth-campaign-chain.mjs';
export function initGrowthCampaign({getClient,getLanguage}){
  const $=id=>document.getElementById(id),t=(zh,en)=>getLanguage()==='en'?en:zh;
  let report=null,busy=false,failed=false;
  function render(){
    $('campaign-refresh').disabled=busy;
    $('campaign-source').textContent=failed?t('本次查询失败；已有结果仅为上次读取，请重试。','Query failed. Any existing result is a previous reading; please retry.'):report?t('核对至区块 ','Checked through block ')+report.snapshotBlock+t('；最新 20 个区块暂未计入。','; the latest 20 blocks are not yet included.'):t('点击查询，读取真实付费订单和战队成绩。','Query actual paid orders and team scores.');
    $('campaign-settlement').textContent=report?.settled?t('已开盘 · 榜单成绩已结算，奖励由项目核对发放。','Pool open · Scores are final; rewards await project reconciliation.'):t('开盘时结算一次；当前名次不代表已获奖或已到账。','Settles once at pool opening; current ranks are not final awards or proof of payment.');
    const list=$('campaign-leaderboard');list.replaceChildren();
    if(!report||report.leaderboard.length===0){const p=document.createElement('p');p.textContent=!report?t('榜单等待读取。','Leaderboard awaiting query.'):t('截至核对区块，尚无符合条件的付费邀请战队。','No qualifying paid-invite team through the checked block.');list.append(p);}
    else for(const team of report.leaderboard.slice(0,10)){
      const row=document.createElement('div');row.className='campaign-team-row';
      const rank=document.createElement('b'),name=document.createElement('strong'),score=document.createElement('span'),prize=document.createElement('small');
      rank.textContent=String(team.rank).padStart(2,'0');name.textContent=team.name||t('身份 #','Identity #')+team.identityId;
      score.textContent=team.score+t(' 个有效付费身份',' qualifying paid identities');
      prize.textContent=(team.prizeEcho>0n?(report.settled?t('应计奖励：','Accrued prize: '):t('当前名次对应：','Current-rank allocation: '))+team.prizeEcho+' ECHO':t('未进入前三名','Outside the top three'));
      row.append(rank,name,score,prize);list.append(row);
    }
    if(!busy)$('campaign-progress').textContent=report?.budgetStopped?t('返还预算已停止新增整单资格；此前应计资格保留。','No new whole-order rebate qualifications; existing accruals are retained.'):report?t('榜单与返还资格按链上记录核对，实际到账以转账回执为准。','Standings and rebate qualifications follow on-chain records. A successful transfer receipt is required to confirm payment.') :'';
  }
  const load=async()=>{
    if(busy)return;
    busy=true;failed=false;render();$('campaign-progress').textContent=t('正在读取链上订单…','Reading on-chain orders…');
    try{const client=getClient();if(!client)throw Error('CLIENT_NOT_READY');report=await readGrowthReport(client,{onProgress:p=>{$('campaign-progress').textContent=t('正在核对区块 ','Checking blocks ')+p.fromBlock+'–'+p.toBlock;}});}
    catch{failed=true;}finally{busy=false;render();}
  };
  $('campaign-refresh').onclick=load;
  document.addEventListener('echo:language',render);render();
  return {load,hasReport:()=>!!report};
}
