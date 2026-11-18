import {formatBnb} from './core.mjs';
import {checkParticipantProof,participantView} from './participant-view.mjs';
import {checkHistoryProgress,historyProgressView,checkNftItems,nftItemsView} from './runtime-detail.mjs';
const address=value=>/^0x[0-9a-fA-F]{40}$/.test(value??''),hash=value=>/^0x[0-9a-fA-F]{64}$/.test(value??'');
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<(1n<<256n);
const fail=()=>{throw Error('RUNTIME_RESPONSE_INVALID');};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=value=>value.slice(0,8)+'…'+value.slice(-6);
export function checkRuntimeObservation(result,project,wallet){
  const s=result?.state,head=result?.index?.head;
 if(result?.schema!=='echo-launch-indexed-state/v1'||result.financialExecutionAllowed!==false||result.quoteAuthority!==false||result.executionReady!==false||
  s?.chainId!==31337||s.localTestOnly!==true||s.historical!==true||s.executionReady!==false||s.quoteAuthority!==false||s.provenanceVerified!==true||
  !address(s.project)||s.project.toLowerCase()!==project.toLowerCase()||![1,2].includes(s.kind)||!hash(s.blockHash)||s.blockHash!==head?.hash||s.blockNumber!==head?.number||
  !Number.isFinite(Date.parse(result.observedAt))||!Number.isSafeInteger(s.blockTimestamp)||s.blockTimestamp<0||!['scheduled','open','paused','awaiting-finalize','awaiting-liquidity','succeeded','cancelled','refundable','closed'].includes(s.phase)||
  !['capacity','activeUnits','activePrincipal','unitPrice','totalBnbCredit'].every(k=>uint(s.base?.[k]))||BigInt(s.base.capacity)===0n||BigInt(s.base.activeUnits)>BigInt(s.base.capacity)||!uint(s.heldBnbWei)||
  wallet&&(!address(s.who?.wallet)||s.who.wallet.toLowerCase()!==wallet.toLowerCase()||!uint(s.who.creditWei)))fail();
 for(const key of ['subscriptionsOpen','refundEligible'])if(s.base[key]!==undefined&&typeof s.base[key]!=='boolean')fail();
 for(const key of ['startsAt','endsAt','closeTime','pausedAt'])if(s.base[key]!==undefined&&(!uint(s.base[key])||BigInt(s.base[key])>8640000000000n))fail();
 if(s.kind===2&&s.extra?.earlyExitOpen!==undefined&&typeof s.extra.earlyExitOpen!=='boolean')fail();
 if(wallet){if(result.participant===null){checkHistoryProgress(result.participantHistory,s,wallet);if(result.participantHistory.complete)fail();}
  else{checkParticipantProof(result.participant,s,wallet);if(result.participantHistory){checkHistoryProgress(result.participantHistory,s,wallet);if(!result.participantHistory.complete)fail();}}}
 return result;
}
export function createRuntimeReader({origin=globalThis.location?.origin,fetchImpl=globalThis.fetch}={}){
 const url=new URL(origin);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('LOCAL_READER_ONLY');
 const controllers=new Set();
 async function read(route,params={}){
  const target=new URL('/launch-api/'+route,url);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!=='')target.searchParams.set(key,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);controllers.add(controller);
  try{
   const response=await fetchImpl(target,{signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   if(!response.ok)throw Error('RUNTIME_UNAVAILABLE');if(!response.headers.get('content-type')?.startsWith('application/json'))fail();
   const reader=response.body.getReader(),chunks=[];let length=0;
   for(;;){const item=await reader.read();if(item.done)break;length+=item.value.length;if(length>1024*1024){await reader.cancel();throw Error('RUNTIME_RESPONSE_TOO_LARGE');}chunks.push(item.value);}
   const all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(all));
  }finally{clearTimeout(timer);controllers.delete(controller);}
 }
 return {
  cancel(){for(const controller of controllers)controller.abort();controllers.clear();},
  async status(){const value=await read('status');if(value.schema!=='echo-launch-read-service/v1'||value.chainId!==31337||value.localTestOnly!==true||value.readOnly!==true||value.executionReady!==false)fail();
   if(value.rehearsal&&(!address(value.rehearsal.sampleWallet)||!Array.isArray(value.rehearsal.cases)||value.rehearsal.cases.length>50||value.rehearsal.cases.some(c=>!address(c.address)||typeof c.zh!=='string'||typeof c.en!=='string'||c.zh.length>100||c.en.length>100)))fail();return value;},
  async projects(){const value=await read('projects');if(value.status?.chainId!==31337||value.status.financialExecutionAllowed!==false||!Array.isArray(value.projects)||value.projects.length>50||value.projects.some(p=>!address(p.address)||![1,2].includes(p.kind)))fail();return value;},
  async state(project,wallet){if(!address(project)||wallet&&!address(wallet))throw Error('RUNTIME_ADDRESS');return checkRuntimeObservation(await read('state',{address:project,wallet}),project,wallet);},
  async history(observation,wallet,cursor){const s=observation.state;if(!address(wallet)||!/^([a-f0-9]{48})\.(0|[1-9][0-9]{0,9})$/.test(cursor??''))fail();
   const value=await read('history',{address:s.project,wallet,cursor,limit:50});if(value.schema!=='echo-launch-history-page/v1')fail();checkHistoryProgress(value.progress,s,wallet);
   const [id,revision]=cursor.split('.');if(value.progress.scanId!==id||!value.progress.complete&&value.progress.cursor!==id+'.'+(Number(revision)+1))fail();
   if(value.progress.complete){checkRuntimeObservation(value.observation,s.project,wallet);if(value.observation.state.blockNumber!==s.blockNumber||value.observation.state.blockHash!==s.blockHash)fail();const verified=value.observation.participant.verifiedHistory;
    if(verified?.scanId!==id||verified.eventCount!==value.progress.totalEvents)fail();}else if(value.observation!==null)fail();return value;},
  async nftItems(observation,wallet,cursor){const s=observation.state;if(!address(wallet)||cursor!==undefined&&!/^[A-Za-z0-9_-]{1,1000}$/.test(cursor))throw Error('RUNTIME_ADDRESS');const value=checkNftItems(await read('nft-items',{address:s.project,wallet,block:s.blockNumber,hash:s.blockHash,cursor,limit:20}),s,wallet);if(cursor&&value.nextCursor===cursor)fail();return value;},
  async events(project){if(!address(project))throw Error('RUNTIME_ADDRESS');const value=await read('events',{address:project,limit:50});if(!Array.isArray(value.events)||value.events.length>50||value.events.some(e=>!hash(e.tx_hash)||e.address?.toLowerCase()!==project.toLowerCase()))fail();return value;}
 };
}
export function runtimeReadPage(lang='zh'){
 const t=(zh,en)=>lang==='en'?en:zh;
 return `<div class="page-title"><span class="eyebrow">READ-ONLY REHEARSAL</span><h1>${t('从真实回执，<br>核对项目状态。','Project state.<br>Read from actual receipts.')}</h1><p>${t('读取本地 EVM 测试链上的注册项目。它与示例卡片、浏览器演示记录和 BNB 主网分开，不连接你的钱包。','Read registered projects on a local EVM test chain. Separate from illustrative cards, browser demo records and BNB mainnet. No wallet connection.')}</p></div><section id="runtime-reader" class="panel runtime-reader" aria-live="polite"></section>`;
}
export function runtimeObservationView(model,lang='zh'){
 const t=(zh,en)=>lang==='en'?en:zh,phase={scheduled:t('尚未开始','Scheduled'),open:t('认购中','Subscriptions open'),paused:t('认购暂停','Paused'),'awaiting-finalize':t('待结算','Awaiting finalization'),'awaiting-liquidity':t('等待建池','Awaiting liquidity'),succeeded:t('发行成功','Succeeded'),cancelled:t('已取消','Cancelled'),refundable:t('可退款','Refundable'),closed:t('已关闭','Closed')};
 let html=`<div class="section-heading"><h2>${t('只读核对','Read-only check')}</h2><span class="tag">LOCAL EVM · 31337</span></div><p>${t('无签名、无付款；显示的是已确认区块快照，执行前须由 Agent 重新读取实时状态。','No signing or payment. This is a confirmed-block snapshot; your Agent must read fresh state before execution.')}</p>`;
 html+=`<div class="runtime-controls"><label class="field">${t('已注册项目','Registered project')}<select data-runtime-project ${!model.projects?.length?'disabled':''}>${(model.projects??[]).map(p=>`<option value="${esc(p.address)}" ${p.address===model.project?'selected':''} ${p.interpreted?'':'disabled'}>${esc(model.service?.rehearsal?.cases?.find(c=>c.address.toLowerCase()===p.address.toLowerCase())?.[lang==='en'?'en':'zh']??((p.kind===1?'NFT':'TOKEN')+' · '+short(p.address)))}${p.interpreted?'':t(' · 模板未核对',' · Unreviewed template')}</option>`).join('')||`<option>${t('等待读取','Waiting for data')}</option>`}</select></label><label class="field">${t('原认购钱包 · 可选','Original subscribing wallet · Optional')}<input data-runtime-wallet value="${esc(model.wallet??'')}" placeholder="0x…" autocomplete="off" spellcheck="false" maxlength="42"></label><button class="secondary" type="button" data-runtime-refresh>${t('重新核对','Refresh check')}</button></div>`;
 if(model.loading)return html+`<p role="status">${t('正在读取链上状态…','Reading chain state…')}</p>`;
 if(model.service?.rehearsal)html+=`<p><button type="button" class="text-link" data-runtime-sample>${t('使用本地演练钱包','Use local rehearsal wallet')}</button><small> · ${t('只查询测试地址，不连接或认证真实钱包','Test address lookup only; no real wallet connection or authentication')}</small></p>`;
 if(model.error==='RUNTIME_ADDRESS')return html+`<div class="notice warning" role="alert">${t('钱包地址格式无效。请输入 0x 开头的 40 位十六进制地址，或使用本地演练钱包；未展示旧查询结果。','Invalid wallet format. Enter 40 hexadecimal digits after 0x, or use the local rehearsal wallet. Previous results are hidden.')}</div>`;
 if(model.error)return html+`<div class="notice warning" role="alert">${t('只读环境暂不可用或数据未通过核对。未将旧快照标为最新，也未用零值代替缺失数据。可重试，或返回示例继续体验。','The read-only environment is unavailable or its data failed verification. Old observations are not marked current and missing data is not replaced with zero. Retry or return to the examples.')}</div>`;
 if(!model.observation)return html+`<p>${t('当前没有已核对模板的注册项目。','No registered project with a checked template is available.')}</p>`;
 const s=model.observation.state,unit=s.kind===1?'NFT':t('枚代币','tokens'),progress=BigInt(s.base.activeUnits)>0n&&BigInt(s.base.activeUnits)*10000n/BigInt(s.base.capacity)===0n?'<0.01%':(Number(BigInt(s.base.activeUnits)*10000n/BigInt(s.base.capacity))/100).toFixed(2)+'%';
 const fact=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
 html+=`<dl class="facts">${fact(t('读取时间 · UTC','Read time · UTC'),esc(new Date(model.observation.observedAt).toISOString()))}</dl>`;
 html+=`<dl class="facts runtime-facts">${fact(t('项目地址','Project'),`<code>${esc(s.project)}</code>`)}${fact(t('区块 / 确认策略','Block / confirmation policy'),esc(s.blockNumber)+' / '+esc(model.observation.index.confirmationsRequired))}${fact(t('读取区块哈希','Observed block hash'),`<code>${esc(s.blockHash)}</code>`)}${fact(t('状态','Phase'),esc(phase[s.phase]))}${fact(t('有效认购 / 公开总量','Active subscriptions / public allocation'),esc(s.base.activeUnits)+' / '+esc(s.base.capacity)+' '+unit)}${fact(t('认购进度','Allocation progress'),esc(progress))}${fact(t('有效认购本金','Active subscription principal'),formatBnb(BigInt(s.base.activePrincipal))+' BNB')}${fact(t('合约持有 BNB','BNB held by contract'),formatBnb(BigInt(s.heldBnbWei))+' BNB')}${fact(t('已记账待提取 BNB','Total recorded BNB credits'),formatBnb(BigInt(s.base.totalBnbCredit))+' BNB')}${s.who?fact(t('该钱包可提取 BNB 记账额','Wallet BNB credit'),formatBnb(BigInt(s.who.creditWei))+' BNB'):''}</dl><p class="muted">${t('记账额不等于已转入钱包；已注册也不等于审计或 NFT 内容审核通过。','A credit is not a completed transfer. Registration is not an audit or NFT content approval.')}</p>`;
 const availability=value=>value===true?t('开放','Open'):value===false?t('关闭','Closed'):t('未核验','Not verified');
 const utc=value=>uint(value)&&BigInt(value)<=8640000000000n?esc(new Date(Number(value)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC')):t('未核验','Not verified');
 html+=`<section class="runtime-lifecycle"><h2 tabindex="-1">${t('参与和退出条件','Participation and exit conditions')}</h2><p>${t('以下条件来自同一已确认区块。认购开放不代表提前退出仍开放；快照不保证下一块可以成交。','These conditions share the confirmed block above. Open subscriptions do not imply an open early-exit window. A snapshot does not guarantee execution in the next block.')}</p><dl class="facts runtime-facts">${fact(t('新增认购','New subscriptions'),availability(s.base.subscriptionsOpen))}${fact(t('全额退款条件','Full-principal refund eligibility'),s.base.refundEligible===true?t('当前满足；付款仍需核验','Currently eligible; payment still needs verification'):s.base.refundEligible===false?t('当前未满足','Not currently eligible'):t('未核验','Not verified'))}${s.kind===2?fact(t('提前退出窗口','Early-exit window'),availability(s.extra?.earlyExitOpen)):''}${fact(t('固定开始时间','Fixed start'),utc(s.base.startsAt))}${fact(t('固定截止时间','Fixed deadline'),utc(s.base.endsAt))}${s.kind===2?fact(t('截止或售罄时间','Deadline or sellout time'),utc(s.base.closeTime)):''}</dl><p class="muted">${s.kind===2?t('主动退出仅支持当前全部份额，收 5% 平台费；截止前 15 分钟或售罄时关闭，以先到者为准。募集失败、取消或建池宽限到期的本金退款不收此费。达标后结束认购，建池最多重试 48 小时。','Voluntary exit covers the entire active position with a 5% platform fee. It closes 15 minutes before the deadline or at sellout, whichever comes first. Failed raises, cancellation and expired pool grace refund principal without that fee. After a successful raise closes, pool creation has at most 48 hours.'):t('NFT 售罄后结算；未售罄到期或取消，退认购本金。退款记账与实际支付分别核验，Gas 不退。','NFT settlement requires sellout. Unsold expiry or cancellation refunds subscription principal. Refund credit and actual payment are verified separately; gas is not refunded.')}</p></section>`;
 if(model.events?.length)html+=`<details><summary>${t('项目事件与本地交易哈希','Project events and local transaction hashes')}</summary><div class="runtime-events">${model.events.map(e=>`<article><strong>${esc(e.name)}</strong><small>${t('区块','Block')} ${esc(e.block_number)}</small><code>${esc(e.tx_hash)}</code></article>`).join('')}</div></details>`;
 if(model.observation.participant)html+=participantView(model.observation.participant,s,lang);
 if(model.observation.participantHistory&&!model.observation.participantHistory.complete)html+=historyProgressView(model.observation.participantHistory,{lang,busy:model.historyBusy,error:model.historyError});
 if(s.kind===1&&model.wallet)html+=nftItemsView(model,s,lang);
 return html;
}
export function mountRuntimeReader(element,{lang='zh',reader}={}){
 let alive=true,epoch=0,model={projects:[],project:'',wallet:'',loading:true};
 const draw=()=>{if(alive)element.innerHTML=runtimeObservationView(model,lang);};
 try{reader??=createRuntimeReader();}catch{model={...model,loading:false,error:true};draw();return ()=>{alive=false;};}
 async function refresh(){
  const generation=++epoch;reader.cancel();model={...model,loading:true,error:false,observation:null,events:[],historyBusy:false,historyError:false,nftItems:[],nftLoaded:false,nftCursor:null,nftBusy:false,nftError:false,nftPageIndex:0,nftPageCursors:[null]};draw();
  try{
   const service=await reader.status();if(!alive||generation!==epoch)return;model.service=service;
   const list=await reader.projects();if(!alive||generation!==epoch)return;model.projects=list.projects;
   if(!list.projects.some(p=>p.address===model.project&&p.interpreted))model.project=list.projects.find(p=>p.interpreted)?.address??'';
   if(model.project){const observation=await reader.state(model.project,model.wallet||undefined);if(!alive||generation!==epoch)return;
    const events=await reader.events(model.project);if(!alive||generation!==epoch)return;model.observation=observation;model.events=events.events;}
   model.loading=false;draw();
  }catch(error){if(alive&&generation===epoch){model={...model,loading:false,error:error?.message??'RUNTIME_UNAVAILABLE',observation:null,events:[]};draw();}}
 }
 async function continueHistory(){
  if(model.historyBusy||!model.observation?.participantHistory||model.observation.participantHistory.complete)return;
  const generation=epoch;model.historyBusy=true;model.historyError=false;draw();
  try{for(let i=0;i<20;i++){
   const before=model.observation.participantHistory,next=await reader.history(model.observation,model.wallet,before.cursor);if(!alive||generation!==epoch)return;
   if(next.progress.processedEvents<before.processedEvents||next.progress.totalEvents!==before.totalEvents)fail();
   model.observation=next.observation??{...model.observation,participantHistory:next.progress};draw();if(next.progress.complete)break;
  }}catch{if(alive&&generation===epoch)model.historyError=true;}
  finally{if(alive&&generation===epoch){model.historyBusy=false;draw();}}
 }
 async function loadNfts(previous=false){
  if(model.nftBusy||!model.observation)return;const generation=epoch;model.nftBusy=true;model.nftError=false;draw();
  const index=previous?Math.max(0,model.nftPageIndex-1):model.nftLoaded?model.nftPageIndex+1:0,cursor=previous?model.nftPageCursors[index]:model.nftLoaded?model.nftCursor:null;
  try{const page=await reader.nftItems(model.observation,model.wallet,cursor??undefined);if(!alive||generation!==epoch)return;
   if(!previous&&model.nftLoaded&&page.items.length&&model.nftItems.length&&BigInt(page.items[0].tokenId)<=BigInt(model.nftItems.at(-1).tokenId))fail();
   model.nftItems=page.items;model.nftCursor=page.nextCursor;model.nftLoaded=true;model.nftPageIndex=index;model.nftPageCursors[index]=cursor;
  }catch{if(alive&&generation===epoch){model.nftError=true;model.nftItems=[];model.nftLoaded=false;model.nftCursor=null;}}
  finally{if(alive&&generation===epoch){model.nftBusy=false;draw();if(model.nftLoaded&&!model.nftError){const heading=element.querySelector('.nft-item-proof h2');heading?.focus?.();heading?.scrollIntoView?.({block:'start'});}}}
 }
 element.onclick=event=>{if(event.target.closest('[data-runtime-sample]')&&model.service?.rehearsal){model.wallet=model.service.rehearsal.sampleWallet;refresh();}
  else if(event.target.closest('[data-runtime-refresh]')){model.wallet=element.querySelector('[data-runtime-wallet]')?.value.trim()??'';refresh();}
  else if(event.target.closest('[data-runtime-history]')||event.target.closest('[data-runtime-nfts]')||event.target.closest('[data-runtime-nft-prev]')){
   const wallet=element.querySelector('[data-runtime-wallet]')?.value.trim()??'';if(wallet!==model.wallet){model.wallet=wallet;refresh();return;}
   if(event.target.closest('[data-runtime-history]'))continueHistory();else loadNfts(!!event.target.closest('[data-runtime-nft-prev]'));}};
 element.onchange=event=>{if(event.target.matches('[data-runtime-project]')){model.project=event.target.value;model.wallet=element.querySelector('[data-runtime-wallet]')?.value.trim()??'';refresh();}};
 refresh();return ()=>{alive=false;epoch++;reader.cancel();element.onclick=null;element.onchange=null;};
}
