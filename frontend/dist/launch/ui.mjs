import {RULES,SCHEMA,newDraft,normalizeDraft,validateDraft,parseMetadata,economics,projectPhase,quoteSubscription,quoteTimeState,verifyQuote,validatePosition,exitQuote,deliveryStatus,parseBnb,formatBnb,formatCount,normalizeIdentity,imageSrc,stringify,makeManifest,importManifest} from './core.mjs';
import {manifestFileName} from './core.mjs';
import {participationOverview,subscriptionButtonLabel,priceSummary} from './participation-view.mjs';
import {subscriptionAmountInput,subscriptionCostRows,subscriptionFromBudget,subscriptionMaximum,makeSubscriptionReview,subscriptionReviewFilename} from './subscription-input.mjs';
import {makeReviewPackage,reviewPackageFilename} from './review-package.mjs';
import {completeAgentCommand,agentReviewMaterial} from './agent-command.mjs';
import {EXAMPLES,SCENARIOS,exampleProject,scenarioProject} from './catalog.mjs';
import {readStore,writeStore,makeId,STORE_KEY} from './local-store.mjs';
import {buildBackup,prepareBackupImport,mergeBackupImport,MAX_BACKUP_BYTES} from './recovery.mjs';
import {createAsyncScope,runScopedTask,readDraftFile} from './async-input.mjs';
import {captureAgentExport,buildAgentExport} from './agent-export.mjs';
import {positionReviewControl,agentPacketDialog} from './agent-export-view.mjs';
import {MAX_MANIFEST_BYTES,compactJsonText,manifestBudget,backupBudget,byteLabel} from './file-budget.mjs';
import {makeBackupParts,prepareRecoveryFiles} from './backup-parts.mjs';
import {backupPartsDialog,recoveryTransportNote} from './backup-parts-view.mjs';
import {operatingRecord,illustrativeOperatingInputs,evaluateOperatingPlan,operatingManifest} from './operating.mjs';
import {operatingPage,operatingResults,costError} from './operating-view.mjs';
import {sealSnapshot,verifySealedRecord,sealCheckCurrent,inspectManifestFile} from './integrity.mjs';
import {sealStatusText,sealPanel,fileInspectionPage} from './integrity-view.mjs';
import {reviewSession,samplePosition,subscribePosition,exitPosition,deliverPosition,positionEvidence,nftRanges,settlementEvidence} from './delivery.mjs';
import {nftLedgerPanel,nftPositionPanel} from './delivery-view.mjs';
import {draftProgress,preserveWorkingDraft,closeWorkingForm,setArchived,organizationFields} from './workspace-list.mjs';
import {workspaceListPage} from './workspace-list-view.mjs';
import {runtimeReadPage,mountRuntimeReader} from './runtime-read.mjs';
let unmountRuntime=()=>{};

const app=document.querySelector('#app'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('storage');},setItem(){throw Error('storage');}};}
const loaded=readStore(storage);let store=loaded.data,storageError=loaded.error,persistedRaw=loaded.sourceRaw,
 storageBlockReason=loaded.writeBlocked?loaded.error:null,pendingRecovery=null,pendingRecoveryContext=null;
const sealChecks=new Map();let sealAuditEpoch=0,manifestInspection=null;
let lang=store.language,source='examples',filter='all',search='',draft=store.working?.raw??null,
 step=store.working?.step??0,editingId=store.working?.id??null,formErrors={},quote=null,quoteChecked=false,renderedProjectPhase=null;
let draftEdited=store.working?store.working.edited!==false:false;
const workspaceFilters={status:'current',type:'all',search:'',sort:'updated'};
const asyncInputs=createAsyncScope();let inputFeedback={};
let reviewPacket=null,packetSerial=0,copyEpoch=0,agentSelection='example-aurum';
let handoffCheck=null,backupExport=null;
let storeEpoch=0;
const t=(zh,en)=>lang==='en'?en:zh;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>formatCount(v,lang==='en'?'en-US':'zh-CN');
const b=v=>formatBnb(v);
const link=(url,label,cls='')=>`<a class="${cls}" href="${esc(url)}">${label}</a>`;
const btn=(action,label,cls='secondary',extra='')=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const tag=(label,cls='')=>`<span class="tag ${cls}">${label}</span>`;
const note=(text,cls='')=>`<div class="notice ${cls}">${text}</div>`;
const title=(eyebrow,heading,desc='')=>`<div class="page-title"><span class="eyebrow">${eyebrow}</span><h1>${heading}</h1>${desc?`<p>${desc}</p>`:''}</div>`;
const typeLabel=type=>type==='nft'?t('NFT 系列','NFT collection'):t('代币发行','Token launch');
const category=c=>({art:t('艺术与收藏','Art & collectibles'),tools:t('Agent 工具','Agent tools'),community:t('社区','Community'),culture:t('文化与创作','Culture & creation')}[c]??c);
const phaseText=p=>({scheduled:t('尚未开始','Upcoming'),raising:t('认购中','Subscribing'),paused:t('认购暂停','Subscriptions paused'),'pool-pending':t('等待建池','Awaiting liquidity'),succeeded:t('发行成功','Launch succeeded'),failed:t('未达成功条件','Unsuccessful'),'pool-failed':t('建池超时','Liquidity timed out'),cancelled:t('已取消','Cancelled')}[p]??p);
const scenarioText=p=>({'exit-closed':t('退出窗口已关闭','Exit window closed'),...Object.fromEntries(['scheduled','raising','paused','pool-pending','succeeded','failed','pool-failed','cancelled'].map(x=>[x,phaseText(x)]))}[p]);
const when=v=>new Date(v).toLocaleString(lang==='en'?'en-GB':'zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
const fieldErrors={REVIEW_PACKAGE_SIZE:['完整审核包超出 32 MiB 本地处理上限。','The complete review package exceeds the 32 MiB local processing limit.'],NAME:['名称需 2–48 字。','Use 2–48 characters.'],COVER_REQUIRED:['请添加项目封面。','Add a project cover.'],IMAGE_URL:['请使用 HTTPS、IPFS、Arweave 图片，或上传 JPG/PNG/WebP。','Use an HTTPS, IPFS or Arweave image, or upload a JPG/PNG/WebP.'],HTTPS_URL:['请填写不带账号密码的 HTTPS 地址。','Use an HTTPS URL without credentials.'],X_URL:['请填写 x.com 或 twitter.com 的 HTTPS 链接。','Use an HTTPS x.com or twitter.com URL.'],ADDRESS:['地址应为 0x 开头的 40 位十六进制地址。','Use a 40-digit hexadecimal address after 0x.'],ZERO_ADDRESS:['收款地址不能为零地址。','A zero recipient is not allowed.'],INTEGER:['请输入大于 0 的整数。','Enter a positive whole number.'],BNB_DECIMAL:['请输入普通 BNB 小数，最多 18 位小数。','Use a decimal BNB amount with at most 18 places.'],POSITIVE_PRICE:['价格必须大于 0。','Price must be greater than zero.'],POSITIVE_MINIMUM:['最低募集额必须大于 0。','The minimum raise must be positive.'],UNREACHABLE_MINIMUM:['最低募集额不能大于全部售罄可募集金额。','The minimum cannot exceed the maximum raise.'],START_TIME:['请选择有效的开始时间。','Choose a valid start time.'],FUTURE_START:['请把开始时间设在未来。','The start time must be in the future.'],METADATA_COUNT:['元数据条数必须等于 NFT 总量。','Provide one metadata entry per NFT.'],METADATA_JSON:['元数据必须是有效的 JSON 数组。','Use a valid JSON array.'],METADATA_SIZE:['NFT 资料超出 8 MiB 本地处理上限。','NFT metadata exceeds the 8 MiB local processing limit.'],METADATA_NAME:['每个 NFT 都需要名称，最长 100 字。','Each NFT needs a name of up to 100 characters.'],METADATA_IMAGE:['每个 NFT 都需要有效图片。','Each NFT needs a valid image.'],METADATA_ATTRIBUTES:['属性必须有 trait_type 和文本、数字或布尔值。','Attributes need a trait_type and a text, number or boolean value.'],IDENTITY_CAP:['超出该身份公开认购额度 4% 的净认购上限。','This exceeds the identity’s 4% public-allocation cap.'],SOLD_OUT_QUANTITY:['数量超过当前剩余份额。','Quantity exceeds remaining supply.'],NOT_RAISING:['当前状态不能新增认购，请刷新状态。','Subscriptions are unavailable in this state. Refresh the status.'],IDENTITY_FORMAT:['请输入有效的 .ai 名称，例如 demo.ai。','Enter an .ai name, such as demo.ai.'],EXIT_CLOSED:['提前退出已关闭；请等候结算结果。','Early exit is closed. Await settlement.'],NFT_NO_EARLY_EXIT:['NFT 不支持主动提前退出。','NFT subscriptions do not support early exit.'],NO_POSITION:['此身份没有可操作的演示认购。','This identity has no active demo position.']};
function errorText(code){return fieldErrors[code]?t(...fieldErrors[code]):t('操作未完成，请检查输入后重试。','The action could not finish. Check the inputs and retry.');}
Object.assign(fieldErrors,{
 BACKUP_PART_COUNT:['分包数量无效；单次最多选择 128 个文件。','Invalid part count. Select at most 128 files.'],
 BACKUP_PART_SIZE:['每个备份文件最多 16 MiB，所选文件合计最多 96 MiB。','Each backup file may be at most 16 MiB; selected files together may be at most 96 MiB.'],
 BACKUP_PART_SCHEMA:['分包格式或编号无效，请保留原文件并重新选择同组备份。','Invalid part format or index. Keep the originals and select the same backup group again.'],
 BACKUP_PART_MIXED:['所选文件来自不同备份组，或混入了普通备份。请只选择同一组文件。','The selection mixes backup groups or includes a normal backup. Select one group only.'],
 BACKUP_PART_DIGEST:['分包内容或整组校验不一致，未恢复任何内容。请检查文件是否完整。','A part or whole-group digest differs. Nothing was restored. Check that the files are complete.'],
 BACKUP_PART_CONFLICT:['同一分包编号存在不同内容，已停止恢复。','The same part index contains conflicting data. Recovery stopped.'],
 BACKUP_PART_MISSING:['分包不完整，请一次选齐同组所有文件。','Parts are missing. Select every file from the same group.'],
 BACKUP_PACK_SIZE:['整组原始数据超过 64 MiB 本地重组上限。可保留完整原始备份，再按项目分组导出。','The original group exceeds the 64 MiB local reassembly limit. Preserve the raw backup and export projects in smaller groups.'],
 BACKUP_PACK_LIMIT:['整组最多处理 4,096 份草稿、50,000 条记录和 4,096 份测算。原数据未修改。','A group supports at most 4,096 drafts, 50,000 records and 4,096 cost plans. Original data is unchanged.'],
 METADATA_SIZE:['NFT 资料超出 8 MiB 本地处理上限，请精简描述或图片链接。','NFT metadata exceeds the 8 MiB local processing limit. Shorten descriptions or image links.'],
 METADATA_UPLOAD_SIZE:['上传的原始 NFT JSON 不能超过 2 MiB。完整发行方案请使用导入方案入口。','Raw NFT JSON uploads must be at most 2 MiB. Complete launch plans use Import plan JSON.'],
 'image-type':['封面只支持 JPG、PNG 或 WebP。','Covers support JPG, PNG or WebP.'],
 'image-size':['图片为空、超过 2 MB，或无法压缩到本地保存大小。','The image is empty, over 2 MB, or cannot fit the local compressed limit.'],
 'image-read':['无法读取这张图片，请检查文件后重试。','This image could not be decoded. Check the file and retry.'],
 ASYNC_CONTEXT:['页面或草稿已变化，请重新选择文件或核对定稿。','The page or draft changed. Select the file or review the seal again.'],
 EXPORT_CONTEXT:['项目、身份或场景已变化，请重新准备审核快照。','Project, identity or scenario changed. Prepare a new review snapshot.'],
 ARCHIVED_EDIT:['此方案已归档，请先恢复或复制为新草稿。','This plan is archived. Restore it or copy it to a new draft first.'],
 NFT_RANGE_INVALID:['NFT 编号必须是发行上限内的有效整数范围。','NFT IDs must be valid integer ranges within the supply cap.'],
 NFT_RANGE_COUNT:['NFT 编号数量与认购数量不一致，未执行操作。','NFT ID count differs from the subscription quantity. No action was recorded.'],
 NFT_RANGE_OVERLAP:['多笔认购使用了重复的 NFT 编号，请先备份并复核演示。','NFT reservations overlap. Back up and review the demo first.'],
 NFT_LEDGER_TOTAL:['累计预留、有效认购和退款编号未对齐。','Lifetime reservations, active units and refunded IDs do not reconcile.'],
 NFT_LEDGER_RANGE:['预留编号超出已记录的分配区间。','Reserved IDs exceed the recorded allocation interval.'],
 NFT_REFUND_EVIDENCE:['退款数量、金额和 NFT 编号记录不一致。','Refund quantity, principal and NFT IDs do not match.'],
 NFT_LEGACY_REFUND_EVIDENCE:['旧演示退款缺少编号记录，未编造补全。可先备份，再归档载入新演示。','A legacy demo refund lacks ID evidence. None was invented. Back it up before archiving/loading a fresh demo.'],
 POSITION_TOTAL_CONFLICT:['各身份认购合计与项目进度不一致。','Identity position totals do not reconcile with project progress.'],
 POSITION_IDENTITY_CONFLICT:['演示身份的格式或名称存在冲突。','Demo identity names or formats conflict.'],
 POSITION_EXISTS:['该身份已有演示认购，请切换场景后再载入示例。','This identity already has a demo position. Change scenario before loading another.'],
 SAMPLE_ALREADY_REFUNDED:['此身份已记录退款。请切换并归档原演示后再体验，不能重复退款。','This identity already has a refund record. Archive/change the demo scenario to explore again; duplicate refunds are blocked.'],
 BNB_RANGE:['金额超出受支持范围；请使用有效的普通 BNB 小数。','Amount exceeds the supported range. Use a valid decimal BNB amount.'],
 RAISE_RANGE:['单价乘以全部公开额度超出支持范围，请降低单价。','Price times the full public allocation exceeds the supported range. Lower the price.'],
 SEAL_UNVERIFIED:['定稿内容尚未比对通过。请在项目管理中复核；原方案已保留。','The local seal has not passed its content check. Review it in the workspace. The original plan is preserved.'],
 IMPORT_JSON:['文件不是有效的 JSON。请保留原文件并检查下载是否完整。','This is not valid JSON. Keep the original and check that the download completed.'],
 IMPORT_SCHEMA:['需要当前 v2 的完整发行方案 JSON。摘要、备份和测算请使用各自入口。','Use a current v2 complete launch manifest. Summaries, backups and cost plans use their own entry points.'],
 QUOTE_CHANGED:['报价参数或项目状态已变化，请重新计算并确认。','Quote parameters or project state changed. Recalculate and confirm.'],
 QUOTE_EXPIRED:['本地报价已过期，或设备时钟发生变化，请重新计算。','The local quote expired or the device clock changed. Recalculate.'],
 NO_SAMPLE_POSITION:['当前场景没有可载入的认购，请切换至认购中体验。','This scenario has no sample position. Switch to Subscribing to explore.'],
 REVIEW_SCHEMA:['方案版本不匹配，请重新导出当前版本的完整 JSON。','The plan version does not match. Export a current complete JSON file.'],
 REVIEW_AUTHORITY:['方案含不适用的执行或权限字段，已停止生成指令。','Inapplicable execution or authority fields were found. Brief generation stopped.'],
 BACKUP_SIZE:['备份不能超过 16 MB。原始文件未被修改。','Backups must be under 16 MB. The original file is unchanged.'],
 BACKUP_JSON:['这不是可读取的 JSON 备份。请保留原文件并检查下载是否完整。','This is not readable backup JSON. Keep the original and check the download completed.'],
 BACKUP_SCHEMA:['请使用 ECHO Launch v2 的本地备份；单个方案请用“导入方案 JSON”。','Use an ECHO Launch v2 local backup. For a single plan, use Import plan JSON.'],
 BACKUP_LIMIT:['该备份条目过多。单次支持 500 份草稿、504 份测算和 5,000 条记录，请分批恢复。','This backup has too many entries. Recover up to 500 drafts, 504 cost plans and 5,000 records at a time.'],
 IMPORT_SIZE:['完整方案超过 12 MiB 处理上限；本地备份请使用“恢复本地备份”。','Complete plans must be at most 12 MiB. Use Restore local backup for a browser backup.']
});
function persist(){
 storeEpoch++;
 store.language=lang;
 if(storageBlockReason)storageError=storageBlockReason;
 else{
  storageError=writeStore(storage,store,{expectedRaw:persistedRaw});
  if(!storageError)persistedRaw=JSON.stringify(store);
  else if(storageError==='storage-conflict')storageBlockReason=storageError;
 }
 const status=document.getElementById('storage-status');if(status)status.innerHTML=storageNotice();
 return !storageError;
}
function storageNotice(){
 if(!storageError)return '';
 const reason=storageError==='storage-conflict'
  ?t('另一个标签页更新了工作区。为避免覆盖，当前页面已停止保存；请先备份当前内容，再重新打开读取已保存版本。','Another tab updated this workspace. Saving is stopped to avoid overwriting it. Back up this page before reopening the saved version.')
  :['storage-corrupt','storage-incompatible','storage-partial'].includes(storageError)
   ?t('已保存的数据无法完整读取，原始内容未被覆盖。当前修改只保留在本页面；请下载恢复备份。','Saved data could not be read completely. The original remains untouched. Current edits stay in this page only; download a recovery backup.')
   :storageError==='storage-quota'
    ?t('浏览器存储空间不足，修改尚未成功保存。请下载备份，保留此页面，再处理浏览器空间。','Browser storage is full. Changes are not saved. Download a backup and keep this page open before freeing browser storage.')
    :t('浏览器暂时不能读写本地存储。当前内容仍可操作，请导出备份后再刷新。','Browser storage is currently unavailable. You can keep working; export a backup before refreshing.');
 return note(`${reason}<div class="actions recovery-actions">${btn('backup',t('下载恢复备份','Download recovery backup'),'secondary')}${btn('retry-storage',t('重新检查存储','Check storage again'),'text-link')}</div>`,'warning');
}
function restoreDialog(plan){const c=plan.counts;return `${recoveryTransportNote(plan.transport,operatingHelpers())}<p>${t('先查看恢复内容，再合并到当前工作区。已有方案、草稿与演示持仓不会被覆盖。','Review the recovery plan before merging. Existing plans, drafts and demo positions are preserved.')}</p><dl class="facts"><div><dt>${t('新增待审核草稿','New review drafts')}</dt><dd>${c.newDrafts}</dd></div><div><dt>${t('其中归档方案','Of these: archived plans')}</dt><dd>${c.newArchivedDrafts}</dd></div><div><dt>${t('相同内容已存在 · 跳过','Identical plans already exist · Skipped')}</dt><dd>${c.duplicateDrafts}</dd></div><div><dt>${t('可恢复演示记录','Recoverable local records')}</dt><dd>${c.newEvents}</dd></div><div><dt>${t('可恢复运营测算 · 假设数据','Recoverable operating assumptions')}</dt><dd>${c.newOperatingPlans}</dd></div><div><dt>${t('已有测算保留 · 跳过','Existing cost plans preserved · Skipped')}</dt><dd>${c.duplicateOperatingPlans}</dd></div><div><dt>${t('重复记录 · 跳过','Duplicate records · Skipped')}</dt><dd>${c.duplicateEvents}</dd></div><div><dt>${t('无法识别的条目 · 跳过','Unrecognized entries · Skipped')}</dt><dd>${c.invalidDrafts+c.invalidEvents+c.invalidOperatingPlans}</dd></div></dl>${plan.drafts.length?`<h3>${t('将恢复的草稿','Drafts to recover')}</h3><ul class="restore-draft-names">${plan.drafts.slice(0,8).map(d=>`<li>${esc(d.raw.name||t('未命名草稿','Untitled draft'))} · ${typeLabel(d.raw.type)}</li>`).join('')}</ul>${plan.drafts.length>8?`<p>${t('另有','Plus')} ${plan.drafts.length-8} ${t('份草稿','more drafts')}</p>`:''}`:''}${note(t('恢复的方案一律作为未定稿草稿，按当前规则重新审核。不会信任文件中的合约地址、审计标记或执行权限；演示记录不是链上回执。','Recovered plans are always unsealed drafts for review under current rules. Imported addresses, audit flags and execution authority are not trusted. Demo records are not chain receipts.'))}<p class="muted">${t('演示持仓与场景不自动恢复；旧版存储原文保留在备份文件中，不覆盖本机旧数据。','Demo positions/scenarios are not automatically restored. Legacy storage remains in the backup file; existing legacy data is not overwritten.')}</p><label class="checkbox"><input id="restore-history" type="checkbox" checked>${t('同时恢复本地演示记录','Also restore local demo history')}</label><label class="checkbox"><input id="restore-operating" type="checkbox" checked>${t('同时恢复运营测算假设，保留已有测算','Also restore operating assumptions; preserve existing plans')}</label>${btn('restore-merge',t('合并恢复 · 保留现有内容','Merge recovery · Preserve current content'),'primary full')}`;}
function activityProjectRoute(e){const d=store.drafts.find(d=>d.id===e.projectId);return '#/'+(d&&!d.sealed?'manage/':'project/')+encodeURIComponent(e.projectId);}
function detailNavigation(type){return `<nav class="detail-nav" aria-label="${t('项目模块','Project sections')}">${[
 ['launch-participate',t('参与','Participate')],['launch-overview',t('概览','Overview')],
 ['launch-rules',t('发行规则','Terms')],['launch-assets',type==='nft'?t('作品与交付','Items & delivery'):t('流动性','Liquidity')]
 ].map(([id,label])=>btn('jump-section',label,'section-link',`data-target="${id}"`)).join('')}</nav>`;}
function notify(message){toast.textContent=message;toast.hidden=false;setTimeout(()=>toast.hidden=true,4500);}
function asyncInputNotice(){
 const pending=asyncInputs.entries().filter(x=>['cover','metadata','seal'].includes(x.channel));
 const messages=pending.map(x=>`<p>${x.channel==='seal'?t('正在核对定稿内容，请稍候。','Checking the local seal. Please wait.'):t('正在读取','Reading')+' '+esc(x.name)}</p>`);
 if(!messages.length)return '';
 return note(messages.join('')+(pending.length?btn('cancel-input',t('取消读取 / 核对','Cancel reading / checking'),'text-link'):''));
}
function fileInputFeedback(kind){
 const pending=asyncInputs.entries().find(x=>x.channel===kind),item=inputFeedback[kind];
 if(pending)return `<span class="file-read-feedback">${t('正在读取','Reading')} ${esc(pending.name)}</span>`;
 if(item?.owner!==draft||item.route!==location.hash)return '';
 return `<span class="file-read-feedback ${item.error?'file-read-error':''}">${esc(item.name)} · ${item.error?esc(errorText(item.error))+' '+t('文件未应用，原内容保留。','File not applied. Original content preserved.'):t('已在本地读取并应用。','Read and applied locally.')}</span>`;
}
function externalFileNotice(){const pending=asyncInputs.entries().filter(x=>['verify-file','restore-file','import-file'].includes(x.channel));return pending.length?note(pending.map(x=>`<p>${t('正在读取并检查','Reading and checking')} ${esc(x.name)}</p>`).join('')+btn('cancel-input',t('取消读取','Cancel reading'),'text-link')):'';}
function updateAsyncControls(){
 const status=app.querySelector('#async-input-status');if(status)status.innerHTML=asyncInputNotice();
 for(const kind of ['cover','metadata']){const feedback=app.querySelector('#'+kind+'-read-feedback');if(feedback)feedback.innerHTML=fileInputFeedback(kind);}
 const busy=asyncInputs.pending('cover')||asyncInputs.pending('metadata')||asyncInputs.pending('seal')||asyncInputs.pending('handoff');
 for(const button of app.querySelectorAll('[data-action="next"],[data-action="seal"]')){button.disabled=busy;button.setAttribute('aria-busy',String(busy));}
}
function cancelDraftInput(field){
 asyncInputs.cancel('handoff');handoffCheck=null;
 if(field==='cover'){asyncInputs.cancel('cover');delete inputFeedback.cover;}
 if(['metadataText','nftSupply'].includes(field)){asyncInputs.cancel('metadata');delete inputFeedback.metadata;}
 asyncInputs.cancel('seal');updateAsyncControls();
}
async function applyDraftFile(file,kind){
 if(!draft||route()[0]!=='create')return;
 const owner=draft,raw=structuredClone(owner),field=kind==='cover'?'cover':'metadataText';
 const context=()=>[location.hash,draft,step,draft?.[field],kind==='metadata'?draft?.nftSupply:null];
 const task=asyncInputs.begin(kind,context,{name:file.name});delete inputFeedback[kind];updateAsyncControls();
 const result=await runScopedTask(asyncInputs,task,()=>readDraftFile(file,{kind,raw}),{
  commit:patch=>{Object.assign(owner,patch);draftEdited=true;delete formErrors[field];saveWorking();inputFeedback[kind]={owner,route:location.hash,name:file.name};},
  onError:error=>{inputFeedback[kind]={owner,route:location.hash,name:file.name,error:error.message};}
 });
 if(result.status!=='discarded')render();
}
function route(){return location.hash.replace(/^#\/?/,'').split('/').map(x=>{try{return decodeURIComponent(x);}catch{return '';}});}
function go(path){quote=null;quoteChecked=false;if(location.hash==='#/'+path)render();else location.hash='/'+path;}
function localSealCheck(record){const check=sealChecks.get(record.id);return check&&check.snapshot!==sealSnapshot(record)?{...check,status:'changed'}:check;}
async function checkLocalSeal(record){const check=await verifySealedRecord(record);if(check.snapshot===sealSnapshot(record))sealChecks.set(record.id,check);return check;}
async function auditSealedPlans(){
 const epoch=++sealAuditEpoch;
 for(const d of store.drafts.filter(d=>d.sealed)){if(epoch!==sealAuditEpoch)return;await checkLocalSeal(d);}
 if(epoch===sealAuditEpoch&&['projects','project','manage','agent'].includes(route()[0]||'projects'))render();
}
function project(id){const x=exampleProject(id);if(x)return x;const d=store.drafts.find(x=>x.id===id&&x.sealed);if(d&&!sealCheckCurrent(d,localSealCheck(d)))throw Error('SEAL_UNVERIFIED');return d?{id:d.id,raw:d.raw,example:false,record:d}:null;}
function planningProject(id){const x=exampleProject(id);if(x)return x;const d=store.drafts.find(d=>d.id===id);return d?{id:d.id,raw:d.raw,example:false}:null;}
const operatingHelpers=()=>({t,esc,b,n,note,title,tag,link,btn});
function costsPage(id){
 const projects=[...EXAMPLES.map(x=>exampleProject(x.id)),...store.drafts.map(d=>({id:d.id,raw:d.raw,example:false}))];
 const p=id?planningProject(id):planningProject('example-orbit');if(!p)return missing();
 return operatingPage({project:p,projects,record:store.operatingPlans[p.id]},operatingHelpers());
}
function updateOperatingInput(el){
 const [,id]=route(),p=planningProject(id||'example-orbit');if(!p)return;
 const rec=operatingRecord(store.operatingPlans[p.id],p.raw.type);rec.inputs[el.dataset.operatingField]=el.value;
 rec.source='manual-unverified';rec.updatedAt=new Date().toISOString();store.operatingPlans[p.id]=operatingRecord(rec,p.raw.type);persist();
 if(el.dataset.operatingField==='mode'){render();app.querySelector('#cost-mode')?.focus();return;}
 app.querySelector('#operating-results').innerHTML=operatingResults(p,rec,operatingHelpers());
 const errors=evaluateOperatingPlan(p.raw,rec.inputs).errors;
 for(const field of app.querySelectorAll('[data-operating-field]')){const key=field.dataset.operatingField,output=app.querySelector('#cost-error-'+key);if(errors[key])field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');if(output)output.textContent=errors[key]?costError(errors[key],t):'';}
}
function sessionFor(p){
 if(!store.sessions[p.id]){
  const v=p.example?scenarioProject(p):{...p,state:{soldUnits:'0'},scenario:'actual'};
  store.sessions[p.id]={raw:v.raw,state:v.state,scenario:v.scenario,identity:'demo.ai',positions:{}};persist();
 }
 return store.sessions[p.id];
}
function current(p){
 const s=sessionFor(p);
 if(!s||typeof s!=='object'||!s.raw||!s.state||typeof s.state!=='object'||Array.isArray(s.state)||!s.positions||typeof s.positions!=='object'||Array.isArray(s.positions))throw Error('STATE_SNAPSHOT');
 const raw=normalizeDraft(s.raw),base=normalizeDraft(p.raw);
 if(!['actual',...SCENARIOS].includes(s.scenario)||raw.type!==base.type)throw Error('STATE_SNAPSHOT');
 for(const key of Object.keys(base))if(key!=='startsAt'&&raw[key]!==base[key])throw Error('STATE_CONFIG');
 if(s.scenario==='actual'&&raw.startsAt!==base.startsAt)throw Error('STATE_CONFIG');
 reviewSession(raw,s);return {...p,raw,state:s.state,scenario:s.scenario};
}
function identityFor(s){try{return normalizeIdentity(s.identity??'demo.ai');}catch{return 'demo.ai';}}
function positionFor(s){return s.positions[identityFor(s)]??{units:'0',principalWei:'0',delivered:false,refunded:false};}
function addEvent(p,kind,data={}){const s=sessionFor(p),event={id:makeId('demo'),projectId:p.id,projectName:p.raw.name,identity:identityFor(s),scenario:s.scenario,kind,createdAt:new Date().toISOString(),chainId:56,transactionHash:null,verification:'local-only',...data};store.events.push(event);persist();return event;}
function safeEcon(raw,sold=0){try{return economics(raw,{soldUnits:sold});}catch{return null;}}
function header(active){return `<header class="header"><a class="brand" href="#/projects" aria-label="ECHO Launch"><img src="../assets/echo-sculpture-mark.webp" alt="ECHO 银色雕塑"><span>ECHO<small>LAUNCH</small></span></a><nav aria-label="${t('主导航','Main navigation')}">${[['projects',t('探索项目','Explore')],['create',t('创建发行','Create')],['manage',t('项目管理','Workspace')],['activity',t('我的记录','My activity')],['agent','Agent']].map(([r,l])=>link('#/'+(r==='create'?'create/nft':r),l,active===r?'active':'')).join('')}</nav>${btn('language',lang==='zh'?'中 / EN':'EN / 中','language','aria-label="Switch language / 切换语言"')}</header><div class="preview-bar"><i></i>${t('本地体验版 · 无真实收款或链上交易','LOCAL PREVIEW · No payments or on-chain transactions')}<span>BNB CHAIN · 56</span></div>`;}
function footer(){return `<footer><div class="brand-small">ECHO LAUNCH <span>FROM SIGNAL TO LAUNCH.</span></div><div>${link('#/rules',t('发行规则','Launch rules'))} ${link('#/agent',t('Agent 指南','Agent guide'))}<span>${t('合约未部署 · 模板未审计','Contracts not deployed · Templates not audited')}</span></div></footer>`;}
function render(){
 unmountRuntime();unmountRuntime=()=>{};
 renderedProjectPhase=null;
 const [page='',id='']=route();document.documentElement.lang=lang==='zh'?'zh-CN':'en';
 const active=page==='project'?'projects':page==='costs'?'manage':page==='verify'?'agent':page||'projects';
 try{let content;
  if(page==='project')content=detail(id);
  else if(page==='create')content=createPage(id==='token'?'token':'nft');
  else if(page==='manage')content=managePage(id);
  else if(page==='costs')content=costsPage(id);
  else if(page==='activity')content=activityPage();
  else if(page==='agent')content=agentPage()+`<section class="panel"><h2>${t('先核对完整文件','Check the complete file first')}</h2><p>${t('重新计算导出文件的内容指纹，检查它是否与当前模板一致。','Recompute the exported file fingerprint and check its current-template consistency.')}</p>${link('#/verify',t('校验方案 JSON ↗','Check manifest JSON ↗'),'button secondary')}</section>`;
  else if(page==='verify')content=fileInspectionPage(manifestInspection,operatingHelpers());
  else if(page==='rules')content=rulesPage();
  else if(page==='runtime')content=runtimeReadPage(lang);
  else content=market();
  if(['','projects','agent'].includes(page))content=`<div class="runtime-entry">${link('#/runtime',t('核对本地测试链项目与回执 ↗','Check local-chain projects and receipts ↗'),'text-link')}</div>`+content;
  const chrome=page==='runtime'?header(active).replace('BNB CHAIN · 56','LOCAL EVM · 31337'):header(active);
  app.innerHTML=chrome+`<main id="main" tabindex="-1"><div id="storage-status" aria-live="polite">${storageNotice()}</div><div id="async-file-status" role="status" aria-live="polite">${externalFileNotice()}</div><div id="async-export-status" role="status" aria-live="polite"></div>${content}</main>`+(page==='runtime'?footer().replace('合约未部署 · 模板未审计','仅本地测试部署 · 模板未审计').replace('Contracts not deployed · Templates not audited','Local test deployments only · Templates not audited'):footer());
  bindImages();updateExportStatus();startFilePreflight();
  if(page==='runtime')unmountRuntime=mountRuntimeReader(document.getElementById('runtime-reader'),{lang});
 }catch(e){app.innerHTML=header(active)+`<main id="main">${title('LOCAL PREVIEW',t('这个页面暂时无法读取','This page could not be loaded'),t('本地数据可能不完整。已保存的方案保留；可以返回管理页导出备份。','Some local data may be incomplete. Saved drafts are preserved. Return to the workspace to export a backup.'))}${note(esc(e.message),'warning')}${link('#/manage',t('进入管理页','Open workspace'),'button')}</main>`+footer();}
}
function bindImages(){app.querySelectorAll('img[data-fallback]').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.parentElement.classList.add('image-unavailable');},{once:true}));}
function market(){
 const excludedSeals=store.drafts.filter(d=>d.sealed&&!d.archivedAt&&!sealCheckCurrent(d,localSealCheck(d))).length;
 const locals=store.drafts.filter(d=>d.sealed&&!d.archivedAt&&sealCheckCurrent(d,localSealCheck(d))).map(d=>({id:d.id,raw:d.raw,record:d,example:false}));
 const projects=source==='examples'?EXAMPLES.map(x=>exampleProject(x.id)):source==='local'?locals:[];
 const shown=projects.filter(p=>(filter==='all'||p.raw.type===filter)&&(!search||`${p.raw.name} ${p.raw.symbol} ${p.raw.tagline}`.toLowerCase().includes(search.toLowerCase())));
 return `<section class="hero"><div><span class="eyebrow">THE NEXT SIGNAL STARTS HERE</span><h1>${t('让创作，<br>有一个起点。','Every idea deserves<br>a launch. ')}</h1><p>${t('一个面向 Agent 的 NFT 与代币发射台。<br>先读清规则，再参与下一次发行。','An Agent-native home for NFT and token launches.<br>Read the rules. Find your next signal.')}</p><div class="actions">${link('#/create/nft',t('创建发行','Create a launch'),'button')}${link('#/rules',t('了解发行规则 ↗','Read the rules ↗'),'text-link')}</div><div class="hero-facts"><span>${t('NFT · 售罄成立','NFT · Sellout to succeed')}</span><span>${t('代币 · 固定价托管','Token · Fixed-price escrow')}</span><span>AGENT-ONLY</span></div></div><div class="hero-art"><img src="../assets/echo-sculpture-v4.webp" alt="${t('ECHO 银色雕塑','ECHO silver sculpture')}"><span>FORM / SIGNAL / VALUE</span></div></section>
 <section class="market" aria-labelledby="market-title"><div class="section-heading"><div><span class="eyebrow">DISCOVER</span><h2 id="market-title">${t('发现下一束回响','Discover the next signal')}</h2></div><p>${t('真实发行接入前，先完整体验流程。','Explore the complete flow before live issuance is connected.')}</p></div>
 <div class="source-tabs" role="group" aria-label="${t('项目来源','Project source')}">${[['examples',t('体验示例','Examples'),4],['local',t('本地定稿','Local launches'),locals.length],['live',t('真实项目','Live projects'),0]].map(([v,l,c])=>btn('source',`${l} <small>${c}</small>`,source===v?'selected':'',`data-value="${v}" aria-pressed="${source===v}"`)).join('')}</div>
 ${note(source==='examples'?t('下列名称、图像、进度与认购均为演示数据，不是真实募集中项目。','All names, artwork, progress and subscriptions below are illustrative. These are not live launches.'):source==='local'?t('仅在本浏览器保存的方案，不在链上，也未公开发布。','Plans saved in this browser only. They are not on-chain or publicly listed.'):t('尚未接入真实发行合约，目前没有可认购的真实项目。','Live issuance contracts are not connected. There are no live subscriptions available.'))}
 ${source==='local'&&excludedSeals?note(t(`${excludedSeals} 份定稿尚未通过本地内容核对，未列入参与列表。请到项目管理复核。`,`${excludedSeals} sealed plans have not passed local content checks and are excluded from participation. Review them in the workspace.`),'warning'):''}<div class="filter-row"><div class="segments">${[['all',t('全部','All')],['nft','NFT'],['token',t('代币','Tokens')]].map(([v,l])=>btn('filter',l,filter===v?'selected':'',`data-value="${v}" aria-pressed="${filter===v}"`)).join('')}</div><label class="search"><span class="sr-only">${t('搜索名称或代号','Search name or symbol')}</span><input id="search" type="search" placeholder="${t('搜索名称或代号','Search name or symbol')}" value="${esc(search)}"></label></div>
 <div class="project-grid" id="project-results">${shown.length?shown.map(card).join(''):`<div class="empty"><span>↗</span><h3>${t('这里等待一个新的开始','A new beginning belongs here')}</h3><p>${search?t('没有匹配的项目。试试其他关键词。','No matching projects. Try another keyword.'):t('你可以先创建本地方案，或者查看示例。','Create a local plan or explore an example.')}</p>${link('#/create/nft',t('创建本地方案','Create a local plan'),'button')}</div>`}</div></section>`;
}
function card(p){try{return projectCard(p);}catch{return unavailableCard(p);}}
function projectCard(p){const v=current(p),e=economics(v.raw,{soldUnits:v.state.soldUnits}),phase=projectPhase(v.raw,v.state),c=p.copy;
 return `<article class="project-card"><a class="card-link" href="#/project/${encodeURIComponent(p.id)}"><div class="card-image"><img data-fallback src="${esc(imageSrc(p.raw.cover,{demo:true}))}" alt="${esc(p.raw.name)}"><span class="card-label">${p.example?t('流程示例','FLOW EXAMPLE'):t('本地方案','LOCAL PLAN')}</span>${tag(typeLabel(p.raw.type))}</div><div class="card-body"><div class="card-meta"><span>${category(p.raw.category)}</span><span>$${esc(p.raw.symbol)}</span></div><h3>${esc(p.raw.name)}</h3><p>${esc(c?t(c.zh,c.en):p.raw.tagline)}</p><div class="card-status"><span class="status-dot ${phase}"></span>${phaseText(phase)}<span class="price">${b(e.priceWei)} BNB / ${p.raw.type==='nft'?t('枚','NFT'):t('枚代币','token')}</span></div><div class="progress"><span style="width:${e.progressBps/100}%"></span></div><div class="card-bottom"><span>${n(e.soldUnits)} / ${n(e.publicUnits)} ${t('示例份额','demo units')}</span><span>${t('查看项目 ↗','Explore ↗')}</span></div></div></a></article>`;
}
function detail(id){const d=store.drafts.find(d=>d.id===id&&d.sealed);if(d&&!sealCheckCurrent(d,localSealCheck(d)))return `${title('LOCAL PLAN REVIEW',t('这份定稿，需要先复核。','Review this local seal first.'),esc(d.raw.name))}${sealPanel(d,localSealCheck(d),operatingHelpers())}${link('#/manage/'+encodeURIComponent(id),t('返回项目管理','Back to project workspace'),'button secondary')}`;const p=project(id);if(!p)return missing();let v,s,e,phase,pos,delivery;
 try{v=current(p);s=sessionFor(p);e=economics(v.raw,{soldUnits:v.state.soldUnits});phase=projectPhase(v.raw,v.state);pos=positionFor(s);validatePosition(v.raw,v.state,pos,phase);delivery=deliveryStatus(v.raw,phase,pos);}
 catch(error){return stateIssuePage(p,error);}
 renderedProjectPhase={id,phase};
 const end=Date.parse(v.raw.startsAt)+RULES.durationSeconds*1000;
 return `<div class="breadcrumbs">${link('#/projects',t('项目市场','Explore'))}<span>/</span>${esc(p.raw.name)}</div>
 <section class="detail-hero"><div class="detail-art"><img data-fallback src="${esc(imageSrc(p.raw.cover,{demo:true}))}" alt="${esc(p.raw.name)}">${tag(p.example?t('完整流程示例 · 非真实发行','Flow example · Not a live launch'):t('本地定稿 · 未上链','Local plan · Not on-chain'))}</div><div><div class="inline-tags">${tag(typeLabel(v.raw.type))}${tag('AGENT-ONLY')}${tag(phaseText(phase),'phase')}</div><h1>${esc(p.raw.name)}</h1><p class="lead">${esc(p.copy?t(p.copy.zh,p.copy.en):p.raw.tagline)}</p><p class="muted">$${esc(p.raw.symbol)} · ${category(p.raw.category)} · BNB Chain 56</p><div class="actions">${btn('manifest',t('交给 Agent 核对项目','Review project with Agent'),'secondary',`data-id="${esc(id)}"`)}${link('#/rules',t('规则说明 ↗','Rules ↗'),'text-link')}${!p.example?link('#/manage/'+encodeURIComponent(id),t('项目管理 ↗','Manage project ↗'),'text-link'):''}</div></div></section>
 ${detailNavigation(v.raw.type)}<div class="detail-layout"><div class="detail-main"><section class="panel detail-section" id="launch-overview" tabindex="-1"><div class="section-heading"><h2>${t('发行概览','Launch overview')}</h2>${tag(t('演示状态','Demo state'))}</div><dl class="facts"><div><dt>${t('开始时间','Starts')}</dt><dd>${when(v.raw.startsAt)}</dd></div><div><dt>${t('截止时间 · 固定 7 天','Ends · Fixed 7 days')}</dt><dd>${when(end)}</dd></div><div><dt>${t('身份累计上限','Cumulative identity cap')}</dt><dd>${v.raw.type==='nft'?t('不设累计上限','No cumulative cap'):`${n(RULES.tokenIdentityCap)} ${esc(v.raw.symbol)} · ${t('公开额度的 4%','4% of public allocation')}`}</dd></div><div><dt>${t('领取与退款期限','Claims & refunds')}</dt><dd>${t('永不过期 · Gas 不退','No expiry · Gas excluded')}</dd></div></dl></section>
 <section class="panel detail-section" id="launch-rules" tabindex="-1"><h2>${t('钱怎么分，失败怎么办','Fund flow & failure handling')}</h2>${v.raw.type==='nft'?nftRules():tokenRules()}<details><summary>${t('查看当前演示的资金计算','View this demo’s fund calculation')}</summary>${fundTable(v.raw,e)}${note(t('此计算仅在发行成功时适用；失败退款路径不会扣成功发行服务费。','These splits apply only to a successful launch. Failed launches do not pay a success fee.'))}</details></section>
 ${v.raw.type==='nft'?nftLedgerPanel(v.raw,s,operatingHelpers())+metadataSection(v.raw):liquiditySection(v.raw,e,phase)}
 <section class="panel"><h2>${t('项目说明','About this project')}</h2><p class="preserve">${esc(p.example?t('这是一份 ECHO Launch 交互示例，不对应真实募资、合约或资产。它展示参与规则和完整状态路径，所有进度均可通过演示场景切换。','This ECHO Launch interaction example does not represent real fundraising, a contract or an asset. All progress is illustrative and can be changed using the demo scenario selector.'):v.raw.description)}</p><div class="actions">${v.raw.website?`<a class="text-link" rel="noopener noreferrer" target="_blank" href="${esc(v.raw.website)}">${t('项目官网 · 未核验 ↗','Project website · Unverified ↗')}</a>`:''}${v.raw.x?`<a class="text-link" rel="noopener noreferrer" target="_blank" href="${esc(v.raw.x)}">X ↗</a>`:''}</div></section></div>
 <aside class="participation"><section class="panel participation-box detail-section" id="launch-participate" tabindex="-1"><span class="eyebrow">PARTICIPATE</span><h2>${t('体验认购流程','Explore subscription')}</h2>${note(t('只记录在此浏览器，不连接钱包、不签名、不收款。','Recorded in this browser only. No wallet connection, signature or payment.'))}
 ${participationOverview(v.raw,e,operatingHelpers())}
 ${phase==='raising'?`${v.raw.type==='token'?subscriptionAmountInput(v.raw,v.state,pos.units,id,operatingHelpers()):`<label class="field">${t('认购份数','Subscription units')}<input id="quantity" inputmode="numeric" autocomplete="off" value="1" placeholder="${t('输入认购份数','Enter subscription units')}" aria-label="${t('认购份数','Subscription units')}"><small>${t('1 份 = 1 枚 NFT','1 unit = 1 NFT')} · ${t('剩余','Remaining')}: ${n(e.remaining)}</small></label>${btn('subscription-review',subscriptionButtonLabel(v.raw,'1',operatingHelpers()),'primary full purchase-summary',`id="subscription-preview" data-id="${esc(id)}"`)}`}<div id="quote-output" aria-live="polite">${quoteBlock(p)}</div>`:note(`${phaseText(phase)} · ${phase==='scheduled'?t('开始后才可新增认购。','Subscriptions open at the start time.'):t('当前不接受新增认购。','New subscriptions are unavailable.')}`,'warning')}
 ${positionPanel(p,v,pos,phase,delivery)}
 <details class="demo-tools"><summary>${t('切换流程演示场景','Change demo scenario')}</summary><p>${t('切换会重置本项目的演示持仓，不会影响发行方案。','Changing scenario resets this project’s demo position, not its launch plan.')}</p><label class="field">${t('演示状态','Scenario')}<select id="scenario" data-id="${esc(id)}">${(v.raw.type==='nft'?['scheduled','raising','paused','succeeded','failed','cancelled']:['scheduled','raising','paused','exit-closed','pool-pending','succeeded','failed','pool-failed','cancelled']).map(x=>`<option value="${x}" ${s.scenario===x?'selected':''}>${scenarioText(x)}</option>`).join('')}</select></label>${btn('seed',t('载入一笔示例认购','Load a sample position'),'secondary full',`data-id="${esc(id)}"`)}</details></section><p class="aside-help">${t('任何正式交易都必须先读取最新链上状态、报价、模拟，再由用户确认。当前尚未接入。','A live transaction would require fresh chain reads, a quote, simulation and user confirmation. Live execution is not connected.')}</p></aside></div>`;
}
function missing(){return `${title('ECHO LAUNCH',t('未找到这个项目','Project not found'),t('本地方案仅保存在创建它的浏览器。','Local plans are stored only in the browser that created them.'))}${link('#/projects',t('返回项目市场','Back to explore'),'button')}`;}
function stateIssuePage(p,error){return `${title('LOCAL STATE CHECK',esc(p.raw.name),t('演示数据不完整或互相矛盾，已停止认购、退款和交付操作。','Demo data is incomplete or contradictory. Subscription, refund and delivery actions are stopped.'))}${note(t('不能把缺少的建池时间或异常持仓当作成功凭证。发行方案保持原样；原演示可先备份，再归档并重新载入。','Missing liquidity timing or an inconsistent position cannot establish success. The launch plan remains unchanged. Back up the original demo, then archive it and reload.'),'warning')}<section class="panel"><dl class="facts"><div><dt>${t('检查结果','Check result')}</dt><dd class="mono">${esc(fieldErrors[error.message]?errorText(error.message):error.message)}</dd></div><div><dt>${t('真实交易','Real transaction')}</dt><dd>${t('没有发送交易','No transaction submitted')}</dd></div></dl><div class="actions">${btn('backup',t('先下载恢复备份','Download recovery backup'),'secondary')}${btn('rebuild-demo',t('归档原演示并重新载入','Archive demo & reload'),'primary',`data-id="${esc(p.id)}"`)}${link('#/projects',t('返回项目市场','Back to explore'),'text-link')}</div></section>`;}
function unavailableCard(p){return `<article class="project-card"><a class="card-link" href="#/project/${encodeURIComponent(p.id)}"><div class="card-image"><img data-fallback src="${esc(imageSrc(p.raw.cover,{demo:true}))}" alt="${esc(p.raw.name)}"><span class="card-label">${t('演示状态待检查','DEMO STATE NEEDS REVIEW')}</span>${tag(typeLabel(p.raw.type))}</div><div class="card-body"><span class="eyebrow">LOCAL PREVIEW</span><h3>${esc(p.raw.name)}</h3><p>${t('状态数据未通过检查，进度和操作暂不展示。原演示保留，可归档后重新载入。','State validation failed. Progress and actions are unavailable. Archive and reload while preserving the original demo.')}</p><span class="text-link">${t('查看检查结果 →','Review state →')}</span></div></a></article>`;}
function nftRules(){return `<ol class="rule-list"><li><strong>${t('认购本金先托管','Principal stays in escrow')}</strong><p>${t('7 天内全部售罄才成功，成功后领取按认购顺序预留的 NFT。','The collection must sell out within 7 days. Successful subscribers then claim their reserved, sequential NFT IDs.')}</p></li><li><strong>${t('未售罄，全额退本金','Not sold out? Full principal refund')}</strong><p>${t('到期未售罄，用户自助退款，Gas 不退；不设主动提前退出。','If unsold at expiry, subscribers can refund their principal, excluding Gas. No voluntary early exit.')}</p></li><li><strong>${t('90% 项目方 · 10% 平台','90% creator · 10% platform')}</strong><p>${t('仅成功时分账；不另收发行费，不设二级版税。图像与属性开始收款前锁定。项目开放创建，无平台内容审批；参与前须独立核验完整内容及可用性。','Split only on success. No extra launch fee or secondary royalty. Art and attributes are fixed before collection begins. Creation is permissionless, without platform content approval. Independently verify complete content and availability before participating.')}</p></li></ol>`;}
function tokenRules(){return `<ol class="rule-list"><li><strong>${t('先达最低额，再到期或售罄结算','Reach the minimum; settle at expiry or sellout')}</strong><p>${t('达到最低募集额后继续认购，项目方不能提前结束。7 天期满未达标，全额退本金，不收平台费。','Subscriptions continue after the minimum. The creator cannot close early. Below the minimum at 7-day expiry: full principal refund, no platform fee.')}</p></li><li><strong>${t('80% 建池 · 15% 项目方 · 5% 平台','80% liquidity · 15% creator · 5% platform')}</strong><p>${t('按成功募集本金分配，5% 是全部发行服务费。建池失败可重试 48 小时，超时全额退款；建池前不分账。','Split successful active principal. The 5% is the entire launch fee. Liquidity can retry for 48 hours; timeout means a full refund. No splits before liquidity succeeds.')}</p></li><li><strong>${t('提前退出：一次全部退出，退 95%','Early exit: the full position, 95% refunded')}</strong><p>${t('平台费按本金 5% 向下取整至 wei，剩余退用户，Gas 不退。截止前 15 分钟或售罄时关闭，以先到者为准；退出释放身份额度。','The 5% fee floors to wei; the remaining principal is refunded. Gas is excluded. Closes 15 minutes before the deadline or at sellout, whichever is earlier. Exit releases the identity quota.')}</p></li></ol>`;}
function fundTable(raw,e){return `<dl class="facts"><div><dt>${t('成功募集本金','Successful principal')}</dt><dd>${b(e.raisedWei)} BNB</dd></div>${raw.type==='token'?`<div><dt>${t('流动性 · 80%','Liquidity · 80%')}</dt><dd>${b(e.liquidityWei)} BNB</dd></div>`:''}<div><dt>${t('项目方','Creator')} · ${raw.type==='nft'?'90%':'15%'}</dt><dd>${b(e.creatorWei)} BNB</dd></div><div><dt>${t('平台','Platform')} · ${raw.type==='nft'?'10%':'5%'}</dt><dd>${b(e.platformWei)} BNB</dd></div><div><dt>${t('已计入上述分账的整数尾差','Rounding already included above')}</dt><dd>${b(e.roundingAllocatedWei)} BNB · ${raw.type==='token'?t('计入平台','Included in platform'):t('计入项目方','Included in creator')}</dd></div></dl><small class="muted">${t('BNB 按整数 wei 计算，无待分配余额。代币先取整 80% 建池和 15% 项目方，余数给平台；NFT 先取整 10% 平台费，其余给项目方。尾差已包含在上述金额，不重复相加。','BNB uses integer wei, with no unallocated balance. Token success floors 80% liquidity and 15% creator; the remainder goes to the platform. NFT success floors the 10% platform fee; the creator receives the rest. The displayed rounding is included, not added again.')}</small>`;}
function metadataSection(raw){let items;try{items=parseMetadata(raw.metadataText,{supply:BigInt(raw.nftSupply),demo:true});}catch{return `<section class="panel">${note(t('元数据尚未完整。','Metadata is incomplete.'),'warning')}</section>`;}
 return `<section class="panel detail-section" id="launch-collection" tabindex="-1"><div class="section-heading"><h2>${t('系列作品与编号','Collection & token IDs')}</h2>${tag(`${items.length} / ${raw.nftSupply}`)}</div><p>${t('按链上成功认购顺序预留编号。图片与属性在开始收款前完整确定；当前仅验证本地 JSON 格式。','IDs are reserved in successful on-chain subscription order. Art and attributes must be fixed before collection. This preview checks local JSON only.')}</p><div class="nft-grid">${items.slice(0,6).map(x=>`<article><div class="nft-image"><img data-fallback src="${esc(imageSrc(x.image,{demo:true}))}" alt="${esc(x.name)}"></div><strong>#${x.tokenId} · ${esc(x.name)}</strong><small>${x.attributes.map(a=>esc(a.trait_type)+': '+esc(a.value)).join(' · ')}</small></article>`).join('')}</div>${items.length>6?`<p class="muted">${t('显示前 6 枚；完整元数据见 Agent 方案。','Showing the first 6. The Agent manifest contains all metadata.')}</p>`:''}${note(t('内容持久化、链上内容承诺与实际不可变性尚未核验。文件哈希不能单独证明图片永远可用。','Content persistence, on-chain commitments and actual immutability are not verified. A file hash alone does not prove permanent availability.'))}</section>`;
}
function liquiditySection(raw,e,phase){return `<section class="panel detail-section" id="launch-assets" tabindex="-1"><h2>${t('流动性与供应透明度','Liquidity & supply transparency')}</h2><dl class="facts"><div><dt>${t('建池场所','Venue')}</dt><dd>PancakeSwap V2 · ${esc(raw.symbol)}/WBNB</dd></div><div><dt>${t('初始配比','Initial ratio')}</dt><dd>${t('按认购单价计算配币','Tokens calculated at the subscription price')}</dd></div><div><dt>${t('按当前演示可配币','Tokens for this demo')}</dt><dd>${formatBnb(e.poolTokenBase)} ${esc(raw.symbol)}</dd></div><div><dt>${t('未售与剩余预留销毁','Unsold & unused reserve burn')}</dt><dd>${formatBnb(e.burnTokenBase)} ${esc(raw.symbol)}</dd></div><div><dt>${t('LP 去向','LP disposal')}</dt><dd>${t('不可取回地址 · 真实回执待接入','Irrecoverable address · Real receipt not connected')}</dd></div><div><dt>${t('真实池子 / LP 地址','Verified pair / LP address')}</dt><dd>—</dd></div><div><dt>${t('建池 / LP 处置 / 销毁回执','Liquidity / LP disposal / burn receipts')}</dt><dd>${t('无真实交易，不提供虚构哈希','No real transactions or invented hashes')}</dd></div></dl>${note(t('演示“成功”不代表真实池子已存在。LP 不可撤回不保证价格、成交量或收益。','A simulated success does not establish a real pool. Irrecoverable LP does not guarantee price, volume or returns.'))}<details><summary>${t('税率与精度说明','Tax & precision policy')}</summary><p>${t('买入 0%、普通转账 0%；转入固定官方池收 2%，含后续追加流动性。首次建池与固定税款兑换流程豁免；其他池不保证覆盖。税款主动兑换 BNB 后，项目方/平台各半。','Buy 0%, ordinary transfer 0%; transfers into the fixed official pair charge 2%, including later liquidity additions. Genesis liquidity and the fixed tax-conversion path are exempt. Other pools are not guaranteed to be covered. Tax BNB is split equally between creator and platform.')}</p><p>${t('报价保护：最多 3% 输出偏差，单次最多池子代币储备的 1%；链上均价不可用则停止兑换。相关预言机参数仍待测试。','Price protection: at most 3% output deviation and 1% of pair token reserves per conversion. Unavailable mean-price data stops conversion. Oracle parameters still need testing.')}</p><p>${t('当前本地按整枚代币认购、18 位代币精度展示：公开认购 555,555,555 枚，预留建池 444,444,444 枚，1 枚初始尾差销毁。身份上限向下取整为 22,222,222 枚。此精度方案仍待合约评审。','This local preview uses whole-token subscriptions and 18 token decimals: 555,555,555 public, 444,444,444 for liquidity and 1 initial dust token burned. The identity cap rounds down to 22,222,222. This precision policy remains subject to contract review.')}</p></details></section>`;}
function deliveryText(status,type){return ({none:t('尚无演示认购。','No demo subscription yet.'),reserved:t('仅记录认购权益，资产尚未交付。','Subscription rights reserved. No asset delivered.'),refundable:t('可全额退回认购本金，Gas 不退。','Full principal refund available. Gas excluded.'),refunded:t('演示退款已记录，不能重复领取。','Demo refund recorded. A second claim is blocked.'),claimable:t('发行成功，可领取对应编号 NFT。','Launch succeeded. Reserved NFT IDs are claimable.'),'pending-distribution':t('等待平台分批派发；可用永不过期自助领取兜底。','Awaiting platform batch distribution. A non-expiring self-claim fallback remains available.'),delivered:t('本地已交付演示记录；无真实链上回执。','Local delivery recorded. No real on-chain receipt.')}[status]??status);}
function settlementPanel(raw,pos){const s=settlementEvidence(raw,pos);if(!s)return '';return `<div class="notice settlement-summary" role="status"><strong>${s.kind==='full-refund'?t('演示全额退款','Demo full refund'):t('演示提前退出退款','Demo early-exit refund')} · ${b(s.refundWei)} BNB</strong><p>${t('原认购','Original subscription')}: ${n(s.units)} ${raw.type==='nft'?'NFT':esc(raw.symbol)} · ${b(s.principalWei)} BNB<br>${t('平台费用','Platform fee')}: ${b(s.platformFeeWei)} BNB · ${t('Gas 不退 · 无真实转账','Gas excluded · No real transfer')}</p>${s.legacyRounding?`<small>${t('旧版演示记录按原取整保留；新操作使用已确认的费用向下取整规则。','Legacy demo amounts retain their original rounding. New operations use the confirmed fee-floor rule.')}</small>`:''}</div>`;}
function positionPanel(p,v,pos,phase,delivery){return `<div class="position"><h3>${t('本身份的演示认购','This identity’s demo position')}</h3><div class="between"><span>${t('当前数量','Active units')}</span><strong>${n(pos.units)}</strong></div><div class="between"><span>${t('认购本金','Principal')}</span><strong>${b(pos.principalWei)} BNB</strong></div>${pos.nftRanges?.length?`<p>${t('对应编号','Reserved IDs')}: ${pos.nftRanges.map(x=>`#${esc(x.first)}${x.first!==x.last?'–#'+esc(x.last):''}`).join(', ')}</p>`:''}<p class="muted">${pos.refunded?deliveryText('refunded',v.raw.type):pos.lastExit?t('全部提前退出已记录；额度已释放。','Full-position exit recorded. Quota released.'):deliveryText(delivery,v.raw.type)}</p>${settlementPanel(v.raw,pos)}<div class="actions vertical">${positionActions(p,v,pos,phase,delivery)}</div>${v.raw.type==='nft'?nftPositionPanel(v.raw,sessionFor(p),identityFor(sessionFor(p)),p.id,operatingHelpers()):''}${positionReviewControl(p.id,operatingHelpers())}</div>`;}
function positionActions(p,v,pos,phase,delivery){const id=esc(p.id);if(BigInt(pos.units)===0n){if(p.example&&!pos.refunded&&!pos.lastExit&&['succeeded','failed','pool-failed','cancelled'].includes(phase))return btn('seed',phase==='succeeded'?t('体验领取流程','Explore delivery'):t('体验退款流程','Explore refund'),'secondary full',`data-id="${id}"`);return '';}
 if(delivery==='refundable')return btn('exit',t('预览全额退款','Preview full refund'),'primary full',`data-id="${id}"`);
 if(delivery==='claimable')return btn('deliver',t('演示领取对应 NFT','Demo: claim reserved NFTs'),'primary full',`data-id="${id}"`);
 if(delivery==='pending-distribution')return btn('deliver',t('演示自助领取兜底','Demo: self-claim fallback'),'secondary full',`data-id="${id}"`)+btn('batch',t('演示平台分批派发','Demo: platform distribution'),'secondary full',`data-id="${id}"`);
 if(v.raw.type==='token'&&['raising','paused'].includes(phase)){
  try{exitQuote(v.raw,v.state,pos);return btn('exit',t('预览全部提前退出','Preview full-position exit'),'secondary full',`data-id="${id}"`);}catch{return `<small>${t('提前退出窗口已关闭。','The early-exit window is closed.')}</small>`;}
 }
 return '';
}
function quoteBlock(p){
 if(!quote||quote.projectId!==p.id)return '';
 const q=quote.data,clock=quoteTimeState(q);
 if(!clock.valid)return note(`${t('本地报价已过期或时钟发生变化，确认已撤销。请按最新状态重新计算。','The local quote expired or the clock changed. Confirmation is revoked. Recalculate against the current state.')}${btn('quote',t('重新计算报价','Refresh quote'),'primary full',`data-id="${esc(p.id)}"`)}`,'warning');
 return `<div class="quote-box"><div class="between"><span>${t('应付本金','Principal due')}</span><strong>${b(q.paymentWei)} BNB</strong></div><div class="between"><span>${t('预计 Gas','Estimated Gas')}</span><span>${t('未估算','Not estimated')}</span></div>${q.reservedTokenIds?`<p>${t('预留 NFT 编号','Reserved NFT IDs')}: #${q.reservedTokenIds.first}–#${q.reservedTokenIds.last}</p>`:''}<p class="quote-validity" id="quote-validity">${quoteClockText(clock.secondsRemaining)}</p><small>${t('本地算术报价，不是链上模拟。身份归属未验证。','Local arithmetic quote, not on-chain simulation. Identity ownership is unverified.')}</small>${btn('check',quoteChecked?t('本地规则检查通过 ✓','Local rules checked ✓'):t('检查本地规则','Check local rules'),'secondary full',`data-id="${esc(p.id)}"`)}${quoteChecked?`<label class="checkbox"><input type="checkbox" id="ack-quote">${t('我理解这只会记录演示认购，不会付款。','I understand this records a demo subscription without payment.')}</label>${btn('subscribe',t('记录演示认购','Record demo subscription'),'primary full',`data-id="${esc(p.id)}"`)}`:''}</div>`;
}
function quoteClockText(seconds){return t(`本地报价有效，剩余 ${seconds} 秒。`,`Local quote valid for ${seconds}s.`);}

function inputField(name,label,{help='',type='text',placeholder='',multiline=false}={}){
 const err=formErrors[name],hint=`hint-${name}`;
 const attrs=`name="${name}" id="field-${name}" data-field="${name}" aria-describedby="${hint}" ${err?'aria-invalid="true"':''}`;
 const value=name==='startsAt'?toLocalDate(draft[name]):draft[name];
 return `<label class="field" for="field-${name}">${label}${multiline?`<textarea ${attrs} rows="${name==='metadataText'?12:5}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${['price','minimumRaise'].includes(name)?'inputmode="decimal"':name==='nftSupply'?'inputmode="numeric"':''}>`}<small id="${hint}" class="${err?'error-text':''}">${err?errorText(err):help}</small></label>`;
}
function toLocalDate(iso){const date=new Date(iso);if(!Number.isFinite(date.getTime()))return '';return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function createPage(type){
 if(!draft||draft.type!==type){if(draft)saveWorking();const saved=store.workings?.[type];draft=saved?.raw??newDraft(type);step=saved?.step??0;editingId=saved?.id??null;draftEdited=saved?saved.edited!==false:false;formErrors={};}
 if(editingId&&store.drafts.some(d=>d.id===editingId&&(d.sealed||d.archivedAt))){editingId=null;draftEdited=true;saveWorking();}
 step=Math.min(step,draftProgress(draft).nextStep);
 const labels=[t('项目资料','Project'),t('发行规则','Terms'),type==='nft'?t('NFT 内容','NFT content'):t('保护与分账','Protection'),t('核对定稿','Review')];
 const errors=Object.entries(formErrors);
 return `${title('CREATE A LAUNCH',t('把想法，准备成一次发行。','Turn an idea into a launch.'),t('四步整理完整规则。保存和定稿都只留在本浏览器，不会部署或收款。','Prepare a complete plan in four steps. Saving and sealing stay in this browser; no deployment or collection.'))}
 <div class="template-picker">${link('#/create/nft',`<span>01 / NFT</span><strong>${t('作品与收藏系列','Art & collectibles')}</strong><small>${t('自定总量 · 售罄后领取','Creator-set supply · Claim after sellout')}</small>`,type==='nft'?'chosen':'')}${link('#/create/token',`<span>02 / TOKEN</span><strong>${t('固定价代币发行','Fixed-price token launch')}</strong><small>${t('统一 10 亿 · 达标建池','Uniform 1 billion · Liquidity after success')}</small>`,type==='token'?'chosen':'')}</div>
 <ol class="stepper">${labels.map((x,i)=>`<li class="${i===step?'current':i<step?'done':''}" ${i===step?'aria-current="step"':''}><span>${i<step?'✓':i+1}</span>${x}</li>`).join('')}</ol>
 <div class="create-layout"><section class="panel form-panel"><div class="section-heading"><div><span class="eyebrow">STEP ${step+1} / 4</span><h2>${labels[step]}</h2></div>${step===0?btn('fill-example',t('填入示例','Use sample'),'text-link'):''}</div>
 ${errors.length?`<div class="notice warning" role="alert"><strong>${t('请先检查以下项目','Check these fields')}</strong><ul>${errors.map(([k,v])=>`<li><a href="#field-${k}" data-focus="field-${k}">${errorText(v)}</a></li>`).join('')}</ul></div>`:''}
 <form id="creation-form" novalidate>${step===0?basicsForm():step===1?termsForm():step===2?protectionForm():reviewForm()}</form>
 <div id="async-input-status" role="status" aria-live="polite">${asyncInputNotice()}</div><div class="form-actions">${step>0?btn('previous',t('← 上一步','← Back'),'secondary'):link('#/manage',t('我的草稿','My drafts'),'text-link')}<div>${btn('save-draft',t('保存草稿','Save draft'),'secondary')}${step<3?btn('next',t('下一步 →','Next →'),'primary',asyncInputs.pending()?'disabled':''):btn('seal',t('定稿并打开本地项目','Seal & open local project'),'primary',asyncInputs.pending()?'disabled':'')}</div></div></section>
 <aside class="create-aside"><section class="panel"><span class="eyebrow">YOUR LAUNCH</span><div class="mini-cover">${draft.cover?`<img data-fallback src="${esc(imageSrc(draft.cover,{demo:true}))}" alt="${t('项目封面预览','Project cover preview')}">`:`<span>${t('添加一张项目封面','Add your project cover')}</span>`}</div><h3 id="draft-name">${esc(draft.name)||t('你的项目','Your project')}</h3><p>${typeLabel(type)} · AGENT-ONLY</p><div id="economics-live">${creationSummary()}</div></section><section class="aside-help"><strong>${t('什么会被锁定？','What will be locked?')}</strong><p>${t('总量、价格、时间、最低募集额、收款地址及内容承诺，都应在真实创建时固定。此处只生成可复核的本地方案。','Supply, price, time, minimum, recipients and content commitments are fixed at real creation. This preview creates a reviewable local plan only.')}</p>${link('#/rules',t('查看完整规则 ↗','View full rules ↗'),'text-link')}</section></aside></div>`;
}
function basicsForm(){return `<div class="form-grid">${inputField('name',t('项目名称 *','Project name *'),{placeholder:'Your project'})}${inputField('symbol',t('资产代号 · 可选','Symbol · Optional'),{help:t('自由填写，不限格式或字数。','Free-form text, without format or character-count restrictions.'),placeholder:'SIGNAL'})}</div>${inputField('tagline',t('一句话介绍 · 可选','One-line description · Optional'),{help:t('说明这个项目为参与者提供什么。','Explain what this project offers participants.')})}<div class="form-grid">${inputField('cover',t('项目封面 *','Project cover *'),{help:t('使用 HTTPS / IPFS 图片链接，或在下方上传图片。','Use an HTTPS / IPFS image link or upload below.'),placeholder:'https://…'})}<label class="field file-field">${t('或上传封面','Or upload a cover')}<input type="file" id="cover-file" accept="image/jpeg,image/png,image/webp"><small>${t('JPG / PNG / WebP，不超过 2 MB。仅在本地压缩保存。','JPG / PNG / WebP, up to 2 MB. Compressed and stored locally.')}</small><span id="cover-read-feedback" role="status" aria-live="polite">${fileInputFeedback('cover')}</span></label></div>${inputField('description',t('项目说明 · 可选','Project description · Optional'),{multiline:true,help:t('说清内容、用途和交付计划；不要写无法验证的收益。','Explain the content, purpose and delivery plan. Avoid unverified returns.')})}<div class="form-grid">${inputField('website',t('项目官网 · 可选','Website · Optional'),{type:'url',placeholder:'https://…'})}${inputField('x',t('X 账号链接 · 可选','X profile URL · Optional'),{type:'url',placeholder:'https://x.com/…'})}</div>`;}
function termsForm(){return `${draft.type==='nft'?inputField('nftSupply',t('NFT 终身发行上限 *','NFT lifetime supply cap *'),{help:t('项目方自行设置正整数。创建后不得增加，销毁不释放额度。','Set a positive whole number. Immutable after creation; burns do not reopen capacity.')}):note(t('所有代币项目统一初始发行 1,000,000,000 枚，无团队免费预留。未售和未使用的预留永久销毁。','Every token project starts with 1,000,000,000 tokens and no free team allocation. Unsold and unused reserves are permanently burned.'))}
 ${draft.type==='token'?`<details class="price-setting" ${formErrors.price?'open':''}><summary>${t('认购价格','Subscription price')}<span id="token-price-summary">${esc(priceSummary(draft,operatingHelpers()))}</span><span>${t('修改','Edit')}</span></summary>${inputField('price',t('每份固定价格 · BNB *','Fixed price per unit · BNB *'),{help:t('1 份 = 1 枚代币。价格大于 0，真实创建后锁定。','1 unit = 1 whole token. Price must be positive and is fixed at real creation.')})}</details>`:inputField('price',t('每枚 NFT 固定价格 · BNB *','Fixed price per NFT · BNB *'),{help:t('大于 0，真实创建后锁定。','Positive and fixed at real creation.')})}
 ${draft.type==='token'?inputField('minimumRaise',t('最低募集金额 · BNB *','Minimum raise · BNB *'),{help:t('由项目方设置，创建后锁定；不能超过最高可募集额。25% 仅作提示，不设强制下限。','Creator-set and immutable. Cannot exceed the maximum raise. 25% is a warning, not a mandatory minimum.')}):''}
 ${inputField('startsAt',t('未来开始时间 *','Future start time *'),{type:'datetime-local',help:t('按你设备的本地时区输入。开始与 7 天后的截止时间均锁定，暂停不顺延。','Enter in your device’s local timezone. Start and 7-day end are fixed; pauses do not extend them.')})}
 ${inputField('creatorRecipient',t('项目方收益地址 · 可稍后补全','Creator proceeds address · May be completed later'),{help:t('真实创建前必须提供并核验。创建后永久固定，平台也不能代改；这里只检查地址格式。','Required and verified before real creation. Permanently fixed, including against platform edits. This preview checks format only.'),placeholder:'0x…'})}
 <div id="terms-calculation">${calculationNotice()}</div>`;}
function creationSummary(){const e=safeEcon(draft);if(!e)return `<p class="muted">${t('填写有效数量和价格后显示计算。','Calculations appear after valid supply and price inputs.')}</p>`;
 return `<dl class="facts compact"><div><dt>${t('公开认购额度','Public allocation')}</dt><dd>${n(e.publicUnits)}</dd></div><div><dt>${t('最高可募集','Maximum raise')}</dt><dd>${b(e.maxRaiseWei)} BNB</dd></div><div><dt>${t('成功条件','Success condition')}</dt><dd>${draft.type==='nft'?t('全部售罄','Sell out'):b(e.minimumWei)+' BNB'}</dd></div><div><dt>${t('发行时长','Duration')}</dt><dd>${t('7 天','7 days')}</dd></div><div><dt>${t('身份上限','Identity cap')}</dt><dd>${draft.type==='nft'?t('无累计上限','No cumulative cap'):n(RULES.tokenIdentityCap)}</dd></div><div><dt>${t('平台成功发行费','Platform success fee')}</dt><dd>${draft.type==='nft'?'10%':'5%'}</dd></div></dl>`;
}
function calculationNotice(){const e=safeEcon(draft);if(!e)return '';
 const end=Date.parse(draft.startsAt)+RULES.durationSeconds*1000;
 let text=`<dl class="facts"><div><dt>${t('售罄可募集','Maximum raise')}</dt><dd>${b(e.maxRaiseWei)} BNB</dd></div><div><dt>${t('截止时间','Ends')}</dt><dd>${Number.isFinite(end)?when(end):'—'}</dd></div></dl>`;
 if(draft.type==='token'){
  const minLiq=e.minimumWei*80n/100n,platform=e.minimumWei*5n/100n;
  text+=`<dl class="facts"><div><dt>${t('达最低额时可用建池 BNB','Liquidity BNB at minimum')}</dt><dd>${b(minLiq)} BNB</dd></div><div><dt>${t('达最低额时平台收入','Platform proceeds at minimum')}</dt><dd>${b(platform)} BNB</dd></div></dl>`;
  if(e.lowMinimumWarning)text+=note(t('最低额低于最高募集额的 25%。可继续，但应核对低流动性、滑点与运营 Gas 成本；这不是禁止创建的条件。','The minimum is below 25% of the maximum raise. You can continue, but review liquidity, slippage and operating Gas costs. This does not block creation.'),'warning');
  text+=note(t('当前无法估算真实建池/派发 Gas，不能证明 5% 平台收入足够覆盖成本。尚未接入池子状态和链上模拟，经济可行性未通过。','Live liquidity/distribution Gas cannot yet be estimated. The 5% platform proceeds are not proven to cover costs. Pair reads and on-chain simulation are not connected; economic feasibility has not passed.'));
 }
 return text;
}
function protectionForm(){if(draft.type==='nft')return `<p>${t('每枚 NFT 都必须有确定的名称、图片和属性。请按编号顺序提供完整 JSON 数组，条数须与总量相同。','Each NFT needs a fixed name, image and attributes. Supply a complete JSON array in token-ID order, with one entry per NFT.')}</p><div class="actions">${btn('metadata-sample',t('填入元数据示例','Fill sample metadata'),'secondary')}${btn('metadata-template',t('下载 JSON 格式示例','Download JSON example'),'text-link')}</div><label class="field file-field">${t('导入元数据 JSON · 最大 2 MiB','Import metadata JSON · Up to 2 MiB')}<input id="metadata-file" type="file" accept="application/json,.json"><span id="metadata-read-feedback" role="status" aria-live="polite">${fileInputFeedback('metadata')}</span></label>${inputField('metadataText',t('完整 NFT 元数据 *','Complete NFT metadata *'),{multiline:true,help:t('仅验证结构。图片实际可用性、持久化与链上锁定须在正式接入前另外核验。','Structure validation only. Actual image availability, persistence and on-chain locking need separate checks.')})}${note(t('编号依成功认购顺序分配；不采用盲盒。售罄成功后领取，不设二级版税；失败退款永不过期。','IDs follow successful subscription order. No blind boxes. Claim after sellout, no secondary royalties. Failed-launch refunds never expire.'))}`;
 return `${tokenRules()}<div class="rule-chips">${tag(t('买 0%','Buy 0%'))}${tag(t('卖 2%','Sell 2%'))}${tag(t('转账 0%','Transfer 0%'))}${tag(t('LP 永久不可取回','Irrecoverable LP'))}</div>${note(t('转入固定官方池收 2%，包括后续追加流动性。首次建池与固定税款兑换流程豁免。已累计卖税主动兑换为 BNB 后，项目方与平台各分一半。','Transfers into the fixed official pair charge 2%, including later liquidity additions. Genesis liquidity and the fixed tax-conversion path are exempt. Accumulated sell tax is actively converted to BNB and split equally.'))}${note(t('每个官方 .ai 身份累计净认购最多为初始公开认购额度的 4%。退出会释放额度；进入 DEX 后不设该限制。','Each official .ai identity may hold active subscriptions up to 4% of the initial public allocation. Exit releases quota. This limit does not apply to later DEX trading.'))}<details open><summary>${t('资金与权限边界','Funds & admin permissions')}</summary><p>${t('仅平台可暂停新增认购，累计最多 24 小时，不影响到期退款和已得领取权。达到暂停上限或截止仍在暂停则全额退款。项目方无提前结算、增发、改税、撤池或改收款地址权限。','Only the platform can pause new subscriptions, cumulatively up to 24 hours. Mature refunds and earned claims remain available. Paused at the cap or deadline: full refund. Creators cannot close early, mint more, change tax, withdraw LP or change proceeds addresses.')}</p></details>${note(t('当前整枚认购与 18 位代币精度是本地技术预览方案。正式合约精度、尾差和均价保护仍需评审与测试。','Whole-token subscriptions and 18 token decimals are a local technical preview. Contract precision, dust and mean-price protections still require review and tests.'),'warning')}`;
}
function reviewForm(){const e=safeEcon(draft);return `${note(t('定稿会生成本地内容指纹，并将此版本设为只读。修改请另存新草稿；这不等于上链锁定。','Sealing creates a local content fingerprint and makes this local version read-only. Copy it to revise. This is not an on-chain lock.'))}<h3>${esc(draft.name)}</h3><p>${esc(draft.tagline)}</p>${creationSummary()}${calculationNotice()}${draft.type==='nft'?nftRules():tokenRules()+`<div class="rule-chips">${tag(t('买 0%','Buy 0%'))}${tag(t('卖 2%','Sell 2%'))}${tag(t('转账 0%','Transfer 0%'))}${tag(t('身份净额上限 4%','Identity net cap 4%'))}</div><details><summary>${t('核对完整保护与分账','Review full protection & splits')}</summary>${protectionForm()}</details>`}${!draft.creatorRecipient?note(t('尚未填写项目方收益地址。允许保存本地方案，但不能用于真实创建。','Creator proceeds address is missing. You may save a local plan, but it cannot create a live launch.'),'warning'):''}<div id="handoff-size-status" aria-live="polite">${handoffStatus()}</div><div class="checklist"><label class="checkbox"><input id="ack-rules" type="checkbox">${t('我已核对价格、总量、期限、费用、退款和身份规则。','I have checked price, supply, duration, fees, refunds and identity rules.')}</label><label class="checkbox"><input id="ack-local" type="checkbox">${t('我理解这只是本地方案，合约未部署、模板未审计、不会执行交易。','I understand this is local only. Contracts are not deployed or audited; no transaction will execute.')}</label></div>`;}
function managePage(id){
 if(id){const d=store.drafts.find(x=>x.id===id);if(!d)return missing();const p={id:d.id,raw:d.raw,example:false,record:d};
  return `<div class="breadcrumbs">${link('#/manage',t('项目管理','Workspace'))}<span>/</span>${esc(d.raw.name||t('未命名草稿','Untitled draft'))}</div>${title('CREATOR WORKSPACE',esc(d.raw.name||t('未命名草稿','Untitled draft')),t('创建者工作区与用户参与页分开。这里管理方案、检查接入条件，不控制用户资产。','A creator workspace separate from the participation page. Manage plans and readiness, not user assets.'))}${d.archivedAt?note(t('此方案已归档，原内容和直接访问仍保留。恢复后可继续在当前列表管理。','This plan is archived. Its original content and direct access remain available. Restore it to manage in the current list.')):''}${d.sealed?sealPanel(d,localSealCheck(d),operatingHelpers()):''}<div class="management-layout"><section class="panel"><div class="section-heading"><h2>${t('方案版本','Plan version')}</h2>${tag(d.sealed?sealStatusText(localSealCheck(d)?.status??'checking',t):t('可编辑草稿','Editable draft'))}</div><dl class="facts"><div><dt>${t('类型','Type')}</dt><dd>${typeLabel(d.raw.type)}</dd></div><div><dt>${t('规则版本','Rule version')}</dt><dd>${RULES.version}</dd></div><div><dt>${t('本地方案 ID','Local plan ID')}</dt><dd class="mono">${esc(d.id)}</dd></div><div><dt>${t('内容指纹 · 非链上证明','Fingerprint · Not chain proof')}</dt><dd class="mono break">${esc(d.digest??'—')}</dd></div><div><dt>${t('创建 / 更新','Created / Updated')}</dt><dd>${when(d.updatedAt||Date.now())}</dd></div></dl><div class="actions">${d.sealed?link('#/project/'+encodeURIComponent(d.id),sealCheckCurrent(d,localSealCheck(d))?t('打开参与页','Open participant view'):t('查看定稿复核','Review local seal'),'button'):d.archivedAt?btn('workspace-restore',t('恢复后继续编辑','Restore to edit'),'primary',`data-id="${esc(d.id)}"`):btn('edit',t('继续编辑','Continue editing'),'primary',`data-id="${esc(d.id)}"`)}${link('#/costs/'+encodeURIComponent(d.id),t('运营测算','Operating plan'),'button secondary')}${btn(d.archivedAt?'workspace-restore':'workspace-archive',d.archivedAt?t('恢复到当前方案','Restore to current'):t('归档方案','Archive plan'),'text-link',`data-id="${esc(d.id)}"`)}${btn('clone',t('复制为新草稿','Copy to new draft'),'secondary',`data-id="${esc(d.id)}"`)}${btn('export',t('导出 JSON','Export JSON'),'secondary',`data-id="${esc(d.id)}" ${d.sealed&&!sealCheckCurrent(d,localSealCheck(d))?'disabled':''}`)}${btn('brief',t('复制完整 Agent 指令','Copy complete Agent command'),'secondary',`data-id="${esc(d.id)}" ${d.sealed&&!sealCheckCurrent(d,localSealCheck(d))?'disabled':''}`)}</div></section><section class="panel"><h2>${t('真实发行准备度','Live-launch readiness')}</h2>${readinessList(d)}${note(t('这些条件未完成，因此没有可执行的创建或管理员交易按钮。前端定稿不代表安全审核通过。','These conditions are incomplete, so no executable creation or admin transaction exists. A sealed frontend plan has not passed a security review.'))}</section></div><section class="panel"><h2>${t('创建者权限说明','Creator permissions')}</h2><p>${t('当前规则不允许项目方暂停认购、改变发行量或单价、提前结束、修改税率、转走托管本金或没收退款/领取权。平台仅能按规则暂停新增认购，已有项目不可偷偷升级。','Creators cannot pause subscriptions, change supply or price, close early, change taxes, withdraw escrowed principal or confiscate refund/claim rights. The platform can pause only under the fixed rules. Existing projects cannot be silently upgraded.')}</p>${d.raw.type==='token'?tokenRules():nftRules()}</section>`;
 }
 return workspaceListPage(store,{...workspaceFilters,lang},{...operatingHelpers(),when},localSealCheck);
}
function readinessList(d){return `<ul class="readiness"><li class="ok">${t('已载入当前业务规则','Current business rules loaded')}</li><li class="${d.sealed&&sealCheckCurrent(d,localSealCheck(d))?'ok':''}">${t('本地方案内容与定稿指纹一致','Local plan matches its recorded seal')}</li><li>${t('模板审核 / 安全审计 · 未完成','Template review / security audit · Not completed')}</li><li>${t('真实发行合约与版本注册 · 未接入','Live issuance contracts & version registry · Not connected')}</li><li>${t('官方 .ai 归属与钱包绑定 · 未验证','Official .ai ownership & wallet binding · Not verified')}</li><li>${t('平台 / 项目收款地址 · 未验证','Platform / creator recipients · Not verified')}</li><li>${t('链上状态、Gas、交易模拟 · 未执行','Chain reads, Gas & simulation · Not performed')}</li><li>${d.raw.type==='nft'?t('内容持久化与不可变性 · 未核验','Content persistence & immutability · Not verified'):t('建池可行性、派发启动 Gas 与执行器 · 未就绪','Liquidity feasibility, distribution Gas & executor · Not ready')}</li></ul>`;}

const eventLabel=kind=>({subscribe:t('认购已记录','Subscription recorded'),exit:t('提前退出已记录','Early exit recorded'),refund:t('全额退款已记录','Full refund recorded'),claim:t('自助领取已记录','Self-claim recorded'),batch:t('平台派发已记录','Platform distribution recorded'),seed:t('载入示例持仓 · 非认购交易','Sample position loaded · Not a subscription')}[kind]??kind);
function nftEventDetails(event){
 if(!event.reservedTokenIds||Array.isArray(event.reservedTokenIds)&&!event.reservedTokenIds.length)return '';
 let label;try{const ranges=nftRanges(event.reservedTokenIds,{supply:String(Number.MAX_SAFE_INTEGER),units:event.units??null}).ranges;label=ranges.slice(0,6).map(r=>`#${esc(r.first)}${r.first!==r.last?'–#'+esc(r.last):''}`).join(', ')+(ranges.length>6?t(' · 其余见完整备份',' · More in full backup'):'');}
 catch{label=t('本地编号记录未通过检查','Local ID record did not pass validation');}
 return `<div><dt>${t('NFT 编号 · 本地记录','NFT IDs · Local record')}</dt><dd>${label}</dd></div>`;
}
function activityPage(){return `${title('YOUR ACTIVITY',t('每一步，都有清楚的记录。','A clear record of every step.'),t('以下仅为本浏览器中的流程演示记录，不是钱包持仓或链上回执。','These are browser-local walkthrough records, not wallet holdings or on-chain receipts.'))}${note(t('真实上线后，需展示交易哈希、区块确认、实际收款地址和交付状态。当前不生成虚构 BscScan 链接。','A live integration must show transaction hashes, block confirmations, actual recipients and delivery status. No invented BscScan links are generated here.'))}${store.events.length>100?note(t(`显示最近 100 条，共 ${store.events.length} 条。完整记录仍保留在备份中。`,`Showing the latest 100 of ${store.events.length} records. Full history remains in backups.`)):''}<div class="activity-list">${store.events.length?store.events.slice(-100).reverse().map(e=>`<article class="panel activity-item"><div class="section-heading"><div><span class="eyebrow">LOCAL DEMO</span><h3>${eventLabel(e.kind)}</h3></div>${tag(e.restored?t('恢复的演示记录','Restored demo record'):t('仅本地','Local only'))}</div><div class="between"><strong>${esc(e.projectName)}</strong><span>${esc(e.identity)}</span></div><dl class="facts"><div><dt>${t('记录时间','Recorded')}</dt><dd>${when(e.createdAt)}</dd></div>${e.units?`<div><dt>${t('数量','Quantity')}</dt><dd>${n(e.units)}</dd></div>`:''}${nftEventDetails(e)}${e.paymentWei?`<div><dt>${t('认购本金','Subscription principal')}</dt><dd>${b(e.paymentWei)} BNB</dd></div>`:''}${e.refundWei?`<div><dt>${t('退款金额','Refund')}</dt><dd>${b(e.refundWei)} BNB</dd></div><div><dt>${t('本次平台费用','Platform fee for this record')}</dt><dd>${b(e.platformFeeWei??0)} BNB</dd></div>`:''}<div><dt>${t('本地记录 ID','Local record ID')}</dt><dd class="mono break">${esc(e.id)}</dd></div><div><dt>${t('链上交易哈希','On-chain transaction hash')}</dt><dd>${t('无 · 未发送交易','None · No transaction submitted')}</dd></div></dl>${link(activityProjectRoute(e),t('返回项目 →','Return to project →'),'text-link')}</article>`).join(''):`<div class="empty"><span>↗</span><h3>${t('还没有演示记录','No walkthrough records yet')}</h3><p>${t('打开一个示例，体验认购、退款和资产交付。','Open an example to explore subscription, refund and delivery.')}</p>${link('#/projects',t('查看示例','Explore examples'),'button')}</div>`}</div>`;}
function agentPage(){const choices=[...EXAMPLES.map(x=>({id:x.id,name:x.name})),...store.drafts.map(x=>({id:x.id,name:(x.raw.name||t('未命名草稿','Untitled draft'))+(x.sealed?' · '+sealStatusText(localSealCheck(x)?.status??'checking',t):t(' · 草稿',' · Draft'))+(x.archivedAt?t(' · 已归档',' · Archived'):'')}))];
 return `${title('AGENT-NATIVE',t('把发行方案，<br>交给你的 Agent。','Your launch plan.<br>Ready for review.'),t('复制一次，交给 Agent 核对。完整项目资料与核对要求已放在同一条指令里。','Copy once for your Agent. The complete project material and review request are included in one command.'))}<div class="agent-layout"><section class="panel"><h2>${t('把项目交给你的 Agent','Hand the project to your Agent')}</h2><label class="field">${t('选择要审核的项目','Choose a project to review')}<select id="agent-project" aria-describedby="agent-project-help">${choices.map(x=>`<option value="${esc(x.id)}" ${x.id===agentSelection?'selected':''}>${esc(x.name)}</option>`).join('')}</select><small id="agent-project-help">${t('选择一个示例或本地方案，再复制完整指令。未完成的草稿会明确列出缺项。','Choose an example or local plan, then copy its complete command. Incomplete drafts explicitly list their missing fields.')}</small></label><div class="actions">${btn('agent-copy',t('复制完整 Agent 指令','Copy complete Agent command'),'primary')}</div><details><summary>${t('可选文件与资料','Optional files & material')}</summary><div class="actions">${btn('agent-json',t('查看核对资料','View review material'),'secondary')}${btn('agent-export',t('下载 JSON · 可选','Download JSON · Optional'),'secondary')}</div></details>${note(t('无需再下载文件。完整指令包含当前项目资料；草稿缺项、Gas 未估算及本地演示状态都会明确标出。仅供只读核对，不连接钱包、不签名、不付款。','No separate download is required. The complete command includes current project material and identifies draft gaps, unestimated Gas and local-only state. Read-only review: no wallet connection, signature or payment.'))}<details><summary>${t('Agent 能读取哪些字段？','What can the Agent read?')}</summary><pre>${esc(stringify({schema:SCHEMA,chainId:56,template:'nft-escrow-v1-preview | token-fixed-escrow-v1-preview',rulesVersion:RULES.version,executionReady:false,paymentUnit:'wei (decimal string)',identity:'format-only, ownership not verified',gasEstimateWei:null,contracts:{launch:null,asset:null},simulation:'not-run-on-chain',transactionHash:null}))}</pre></details></section><section class="panel"><h2>${t('完整操作闭环','The complete operating loop')}</h2><ol class="agent-steps">${[[t('读取','Read'),t('核对链、模板版本、项目状态、身份与余量。','Verify chain, template version, state, identity and remaining supply.')],[t('报价','Quote'),t('明确数量、应付 BNB、Gas、上限和退款条件。','State quantity, BNB due, Gas, limits and refund conditions.')],[t('模拟','Simulate'),t('正式合约接入后模拟真实调用；本地算术不是链上模拟。','Simulate the actual call after contracts are integrated. Local arithmetic is not chain simulation.')],[t('确认','Confirm'),t('向用户展示完整参数，获得确认后才能签名。','Show the user complete parameters before any signature.')],[t('提交','Submit'),t('使用幂等操作 ID；结果不明先查回执，不盲目重发。','Use idempotency keys. Check receipts before retrying an uncertain submission.')],[t('回执与交付','Receipt & delivery'),t('区分已提交、已确认、待派发、已到账和自助领取。','Distinguish submitted, confirmed, pending distribution, delivered and self-claimable.')]].map(([a,c],i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><div><strong>${a}</strong><p>${c}</p></div></li>`).join('')}</ol></section></div><section class="panel"><h2>${t('模板先审核，项目再复用','Review templates before reuse')}</h2><p>${t('NFT 托管状态机和代币固定价状态机独立。每次修复登记新模板版本，只服务新项目；已有项目不可暗改或升级。退款和已得领取权始终保留。','NFT escrow and fixed-price token state machines are separate. Fixes create a new reviewed template version for new projects. Existing projects cannot be silently modified or upgraded. Refunds and earned claims remain available.')}</p><p class="muted">${t('本地合约候选与 CLI 已完成基础流程测试；正式网络部署、独立安全审查和内容存储核验仍未完成。当前入口仅供只读核对。','Local contract candidates and CLI pass basic flow tests. Live deployment, independent security review and content persistence remain incomplete. This entry is read-only.')}</p></section>`;
}
function rulesPage(){return `${title('RULES BEFORE REWARDS',t('先有边界，才有信任。','Trust starts with clear boundaries.'),t('已确认的业务规则用于本地交互。技术精度和合约实现仍待评审。','Confirmed business rules guide this local experience. Precision policy and contract implementation still require review.'))}<div class="rules-grid"><section class="panel"><span class="eyebrow">01 / NFT</span><h2>${t('固定总量 NFT 托管发行','Fixed-cap NFT escrow')}</h2>${nftRules()}<p>${t('项目方自定终身上限；每条铸造路径计入总量，销毁不腾出额度。编号按成功认购顺序预留，图像与属性先确定。','Creator chooses the lifetime cap. Every mint path counts; burns do not reopen capacity. IDs follow successful subscription order; art and attributes are fixed first.')}</p></section><section class="panel"><span class="eyebrow">02 / TOKEN</span><h2>${t('统一 10 亿，固定价发行','One billion. Fixed price.')}</h2>${tokenRules()}<p>${t('不设团队免费预留。未售公开额度、未用建池预留和代币尾差销毁。身份净认购上限为初始公开额度的 4%。','No free team reserve. Unsold public allocation, unused liquidity reserve and token dust are burned. Identity active subscriptions are capped at 4% of the initial public allocation.')}</p></section></div><section class="panel"><h2>${t('共同底线','Shared boundaries')}</h2><div class="rule-columns"><div><h3>${t('固定与不可升级','Fixed & non-upgradeable')}</h3><p>${t('价格、时间、收款地址创建后固定。资产和资金合约不可升级；禁止增发、改税、冻结、黑名单和强制转走资产。后续修复采用新模板版本，仅用于新项目。','Price, times and recipients are fixed at creation. Asset and fund contracts are non-upgradeable: no extra mint, tax changes, freezes, blacklists or forced asset transfers. Fixes use new template versions for new projects.')}</p></div><div><h3>${t('仅平台有限暂停','Limited platform pause')}</h3><p>${t('只暂停新增认购，累计 24 小时，7 天期限不顺延；暂停到上限或截止仍未恢复则取消、全额退款且不收费。到期退款和已有领取权不受影响。','Only new subscriptions can pause, cumulatively up to 24 hours, without extending the 7-day deadline. Paused at the limit or deadline means cancellation, full refund and no fee. Mature refunds and earned claims remain available.')}</p></div><div><h3>${t('真实证据，不做收益保证','Evidence, without return promises')}</h3><p>${t('正式接入应公开模板版本、合约、池子、LP 去向和销毁回执。源码验证不等于审计，LP 不可撤回不保证价格。首版采用固定价托管，不混入曲线买卖。','A live integration must disclose template version, contracts, pair, LP disposal and burn receipts. Source verification is not an audit; irrecoverable LP does not guarantee price. V1 uses fixed-price escrow, separate from bonding-curve trading.')}</p></div></div>${note(t('尚未通过的项目：合约实现与审计、精度与尾差规则验证、均价保护参数、NFT 持久化、官方身份接入、批量派发预算及执行器。当前没有安全保证或真实发行服务。','Not completed: contract implementation/audit, precision/dust validation, mean-price protections, NFT persistence, official identity integration and distribution budget/executor. This preview offers no security guarantee or live launch service.'),'warning')}</section>`;}

function exportBinding(id){
 const record=store.drafts.find(d=>d.id===id),session=store.sessions[id];let phase=null;
 if(session)try{phase=projectPhase(session.raw,session.state);}catch{phase='invalid';}
 return [location.hash,lang,app.querySelector('#agent-project')?.value??null,app.querySelector('#identity')?.value??null,
    record?stringify(record):id,session?stringify(session):null,phase,app.querySelector('#subscription-amount')?.value??app.querySelector('#quantity')?.value??null,store.operatingPlans[id]?stringify(store.operatingPlans[id]):null];
}
function updateExportStatus(){
 const status=app.querySelector('#async-export-status');if(!status)return;
 status.innerHTML=asyncInputs.pending('agent-export')?note(t('正在准备审核快照，请稍候。','Preparing a review snapshot. Please wait.')+' '+btn('cancel-input',t('取消核对','Cancel review'),'text-link')):'';
}
async function prepareAgentOutput(id,kind){
 const record=store.drafts.find(d=>d.id===id);let p=exampleProject(id)??(record?{id,raw:record.raw,record,example:false}:null);
  if(!p)throw Error('PROJECT_NOT_FOUND');if(p.example)sessionFor(p);
  const withSubscription=kind==='subscription-review',withPosition=kind.startsWith('position-')||withSubscription||Boolean(store.sessions[id])&&['manifest','brief','cost-brief'].includes(kind);
 let session=null,raw=p.raw,identity=null;
 if(withPosition){session=sessionFor(p);readIdentity(session);raw=current(p).raw;identity=normalizeIdentity(app.querySelector('#identity')?.value??session.identity);}
 else if(p.example)raw=current(p).raw;
  const requestQuote=withSubscription?freshQuote(p):null,requestBudget=withSubscription?(app.querySelector('#subscription-amount')?.value??b(requestQuote.paymentWei)):null;
  const command=['brief','position-brief','cost-brief'].includes(kind),operatingSnapshot=kind==='cost-brief'?operatingManifest(raw,store.operatingPlans[id],{projectId:id}):null;
 const snapshot=captureAgentExport({projectId:id,raw,record:record??null,session,identity}),task=asyncInputs.begin('agent-export',()=>exportBinding(id));updateExportStatus();
 try{
   const bundle=await buildAgentExport(snapshot,{allowIncomplete:kind==='export'||command});if(!asyncInputs.current(task))return;
   if(kind==='manifest'||kind==='position-review'||withSubscription){
    let reviewPackage=await makeReviewPackage(bundle);if(withSubscription){verifyQuote(requestQuote,freshQuote(p));reviewPackage=await makeSubscriptionReview(reviewPackage,requestQuote,requestBudget);}if(!asyncInputs.current(task))return;const packetId='review-'+(++packetSerial);reviewPacket={id:packetId,bundle,reviewPackage,subscriptionReview:withSubscription,route:location.hash};
    showDialog(withSubscription?t('把本次认购交给 Agent 核对','Review this subscription with Agent'):withPosition?t('本身份审核快照','Identity review snapshot'):t('Agent 发行方案快照','Agent launch-plan snapshot'),agentPacketDialog(bundle,packetId,{...operatingHelpers(),when},reviewPackage));
  }else if(command){const material=await agentReviewMaterial(bundle,{operatingPlan:operatingSnapshot});if(!asyncInputs.current(task))return;await copyText(completeAgentCommand(material,lang),{valid:()=>asyncInputs.current(task)});}
  else if(kind==='copy-manifest')await copyText(stringify(bundle.manifest),{valid:()=>asyncInputs.current(task)});
  else if(kind==='position-export')download(`echo-launch-position-${id.replace(/[^a-zA-Z0-9_-]/g,'-')}.json`,stringify(bundle.position));
  else if(kind==='export')download(manifestFileName(snapshot.raw.symbol,{draft:Boolean(bundle.draft)}),stringify(bundle.draft??bundle.manifest));
 }catch(error){if(asyncInputs.current(task))announceError(error);}
 finally{asyncInputs.finish(task);updateExportStatus();}
}
function download(filename,text){const body=compactJsonText(text),blob=new Blob([body],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function captureBackupExport(){
 const legacy={};try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&key!==STORE_KEY&&/^echo[.-]launch[.-]/i.test(key))legacy[key]=storage.getItem(key);}}catch{}
 const backup=buildBackup(store,{legacy,sourceRaw:persistedRaw,storageError});return {text:stringify(backup,0),budget:backupBudget(backup),pack:null,requested:new Set()};
}
async function startBackupParts(state=captureBackupExport()){
 backupExport=state;const task=asyncInputs.begin('backup-pack',()=>[location.hash,backupExport,storeEpoch]);
 showDialog(t('完整备份分包','Complete backup parts'),backupPartsDialog(state,operatingHelpers()));
 await runScopedTask(asyncInputs,task,()=>makeBackupParts(state.text,{isCurrent:()=>asyncInputs.current(task),onProgress:progress=>{
  if(!asyncInputs.current(task))return;const el=dialog.querySelector('#backup-pack-progress');if(el)el.textContent=t(`已生成 ${progress.completed} / ${progress.total} 包。`,`Prepared ${progress.completed} / ${progress.total} parts.`);
 }}),{commit:pack=>{state.pack=pack;showDialog(t('完整备份分包','Complete backup parts'),backupPartsDialog(state,operatingHelpers()));},onError:error=>{state.error=errorText(error.message);showDialog(t('分包生成未完成','Backup parts not prepared'),backupPartsDialog(state,operatingHelpers()));}});
}
function handoffStatus(){
 if(!handoffCheck||handoffCheck.owner!==draft)return '';
 const h=handoffCheck;
 if(h.pending)return note(t('正在检查完整交接文件大小。','Checking the complete handoff file size.')+' '+btn('cancel-input',t('取消检查','Cancel check'),'text-link'));
 if(h.cancelled)return note(t('交接检查已取消；可重新检查。','Handoff check cancelled. You can check again.')+' '+btn('handoff-check',t('重新检查文件','Check file again'),'text-link'));
 if(h.error)return note(esc(errorText(h.error))+' '+btn('handoff-check',t('重新检查文件','Check file again'),'text-link'),'warning');
 if(!h.result)return '';
 return `<section class="handoff-budget"><h3>${t('Agent 交接文件','Agent handoff file')}</h3><dl class="facts"><div><dt>${t('完整方案 · 紧凑 JSON','Complete plan · Compact JSON')}</dt><dd>${byteLabel(h.result.bytes)} / 12 MiB</dd></div>${draft.type==='nft'?`<div><dt>${t('规范化 NFT 资料','Normalized NFT metadata')}</dt><dd>${byteLabel(h.result.metadataBytes)} / 8 MiB</dd></div>`:''}</dl><p>${t('文件大小检查通过。下载会保留全部内容，并移除排版空白。','File size check passed. Downloads retain all content and omit formatting whitespace.')}</p></section>`;
}
async function startFilePreflight(force=false){
 if(route()[0]!=='create'||step!==3||!draft)return;
 const owner=draft,id=editingId??'local:00000000-0000-0000-0000-000000000000',key=stringify(draft,0)+'|'+id;
 if(!force&&handoffCheck?.owner===owner&&handoffCheck.key===key)return;
 const snapshot=normalizeDraft(draft),task=asyncInputs.begin('handoff',()=>[location.hash,draft,step,stringify(draft,0),editingId]);
 const h={owner,key,pending:true,result:null};handoffCheck=h;const panel=app.querySelector('#handoff-size-status');if(panel)panel.innerHTML=handoffStatus();updateAsyncControls();
 await runScopedTask(asyncInputs,task,async()=>manifestBudget(await makeManifest(snapshot,{id,demo:true})),{commit:result=>{h.pending=false;h.result=result;},onError:error=>{h.pending=false;h.error=error.message;}});
 if(handoffCheck===h&&owner===draft&&route()[0]==='create'&&step===3){const panel=app.querySelector('#handoff-size-status');if(panel)panel.innerHTML=handoffStatus();updateAsyncControls();}
}
async function copyText(text,{valid=()=>true}={}){
 if(!valid())return;let timeout;const epoch=++copyEpoch;
 try{
  if(!navigator.clipboard?.writeText)throw Error('clipboard-unavailable');
  await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('clipboard-timeout')),1800);})]);
  if(epoch===copyEpoch&&valid())notify(t('已复制。','Copied.'));
 }catch{
  if(epoch!==copyEpoch||!valid())return;
  showDialog(t('手动复制','Copy manually'),`<p>${t('浏览器未完成自动复制。已选中下方内容；电脑可按 Ctrl+C，手机可长按复制。','Automatic copy did not complete. The text below is selected. Press Ctrl+C on desktop or long-press to copy on mobile.')}</p><textarea class="copy-area" aria-label="${t('待复制内容','Text to copy')}" readonly>${esc(text)}</textarea>`);
  dialog.querySelector('textarea').select();
 }finally{clearTimeout(timeout);}
}
function showDialog(heading,content){dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${heading}</h2><form method="dialog"><button class="close" aria-label="${t('关闭','Close')}">×</button></form></div>${content}`;if(!dialog.open)dialog.showModal();}
function saveWorking(){if(draft){store.working={raw:{...draft},step,id:editingId,edited:draftEdited};store.workings??={};store.workings[draft.type]=store.working;persist();}}
function preserveForm(type,nextRaw){const result=preserveWorkingDraft(store,type,{nextRaw,idFactory:()=>makeId()});store=result.data;return result;}
function saveDraft({sealed=false,digest=null}={}){const now=new Date().toISOString(),old=store.drafts.find(x=>x.id===editingId);if(old?.sealed)throw Error('SEALED');if(old?.archivedAt)throw Error('ARCHIVED_EDIT');const id=editingId??makeId();const record={id,raw:normalizeDraft(draft),sealed,digest,sealRulesVersion:sealed?RULES.version:null,createdAt:old?.createdAt??now,updatedAt:now,...organizationFields({...old,resumeStep:step})};if(old)Object.assign(old,record);else store.drafts.push(record);editingId=id;draftEdited=false;saveWorking();return record;}
function validateStep(){const fields=step===0?['name','symbol','tagline','description','category','cover','website','x']:step===1?['nftSupply','price','minimumRaise','startsAt','creatorRecipient']:step===2?['metadataText']:null;
 const all=validateDraft(draft,{creating:true,demo:true});formErrors=fields?Object.fromEntries(Object.entries(all).filter(([k])=>fields.includes(k))):all;return !Object.keys(formErrors).length;}
function refreshQuote(){quote=null;quoteChecked=false;const box=app.querySelector('#quote-output');if(box)box.innerHTML='';const button=app.querySelector('#subscription-preview'),quantity=app.querySelector('#quantity'),amount=app.querySelector('#subscription-amount');if(button&&amount){const [,id]=route(),p=project(id),v=current(p),s=sessionFor(p),view=subscriptionCostRows(v.raw,amount.value,{state:v.state,identityUnits:positionFor(s).units},operatingHelpers());app.querySelector('#subscription-cost-preview').innerHTML=view.html;button.disabled=!view.valid;amount.setAttribute('aria-invalid',view.error?'true':'false');return;}if(button&&quantity){try{const [,id]=route(),p=project(id),v=current(p);button.innerHTML=subscriptionButtonLabel(v.raw,quantity.value,operatingHelpers());}catch{button.textContent=t('核对认购','Review subscription');}}}
function readIdentity(s){const input=app.querySelector('#identity');if(input)s.identity=normalizeIdentity(input.value);persist();return identityFor(s);}
function refreshIdentityPosition(){
 const [page,id]=route(),box=app.querySelector('.position');if(page!=='project'||!box)return;
 const p=project(id),s=sessionFor(p);let name;
 try{name=normalizeIdentity(app.querySelector('#identity').value);}catch{box.innerHTML=`<h3>${t('本身份的演示认购','This identity’s demo position')}</h3><p>${t('请完成有效的 .ai 身份名称，再查看对应编号和操作。','Enter a valid .ai identity to view its IDs and actions.')}</p>`;return;}
 s.identity=name;persist();const v=current(p),phase=projectPhase(v.raw,v.state),pos=positionFor(s);
 box.outerHTML=positionPanel(p,v,pos,phase,deliveryStatus(v.raw,phase,pos));bindImages();
}
function freshQuote(p,{match=false}={}){const s=sessionFor(p);readIdentity(s);const v=current(p),pos=positionFor(s),quantity=match?quote?.data?.quantity:v.raw.type==='token'?subscriptionFromBudget(v.raw,app.querySelector('#subscription-amount')?.value,{state:v.state,identityUnits:pos.units}).quantity:app.querySelector('#quantity')?.value;
 if(match&&!quote)throw Error('QUOTE_CHANGED');
 validatePosition(v.raw,v.state,pos,projectPhase(v.raw,v.state));
 const next=quoteSubscription(v.raw,v.state,quantity,{identity:identityFor(s),identityUnits:pos.units,projectId:p.id});
 if(match)verifyQuote(quote.data,next);return next;
}
function announceError(e){
 if(e.message==='BACKUP_PART_MISSING'&&Array.isArray(e.missing)){const ids=e.missing.filter(n=>Number.isInteger(n)&&n>=1&&n<=128);notify(t(`缺少第 ${ids.join('、')} 包。请选择同组全部文件后重试。`,`Missing parts ${ids.join(', ')}. Select every file from the same group.`));return;}
 if(e.message==='MANIFEST_INCOMPLETE'){
  showDialog(t('请先补齐方案资料','Complete the project data first'),`<p>${t('当前资料不足以生成完整审核文件。可以先导出草稿备份，再继续编辑。','The current draft cannot produce a complete review manifest. You can export a draft backup and continue editing.')}</p><ul>${Object.values(e.fields??{}).map(code=>`<li>${errorText(code)}</li>`).join('')}</ul>${btn('edit',t('继续编辑方案','Continue editing'),'primary',`data-id="${esc(e.draftId)}"`)}`);return;
 }
 if(['QUOTE_CHANGED','QUOTE_EXPIRED','NOT_RAISING'].includes(e.message)){refreshQuote();render();notify(errorText(e.message));return;}
 if(/^(STATE_|POSITION_|POOL_TIME_|CLOSE_TIME_)/.test(e.message)){refreshQuote();render();notify(t('状态未通过检查，操作已停止。','State validation failed. The action stopped.'));return;}
 notify(errorText(e.message));
}
function archiveAndLoadScenario(p,scenario){
 const old=store.sessions[p.id];store.sessionArchives??=[];
 if(old!==undefined)store.sessionArchives.push({id:makeId('archive'),projectId:p.id,archivedAt:new Date().toISOString(),session:structuredClone(old)});
 const v=scenarioProject(p,scenario);let identity='demo.ai';try{identity=normalizeIdentity(old?.identity??identity);}catch{}
 store.sessions[p.id]={raw:v.raw,state:v.state,scenario,identity,positions:{}};
 persist();refreshQuote();render();
}
function monitorProject(){
 const [page,id]=route();if(page!=='project'||!renderedProjectPhase||renderedProjectPhase.id!==id)return;
 try{
  const p=project(id);if(!p)return;const v=current(p),phase=projectPhase(v.raw,v.state);
  if(phase!==renderedProjectPhase.phase){refreshQuote();render();notify(t('本地演示状态已变化，旧确认已撤销。','The demo state changed. Previous confirmation was revoked.'));return;}
  if(quote?.projectId===id){const clock=quoteTimeState(quote.data),box=app.querySelector('#quote-output');
   if(!clock.valid&&!quote.expired){quote.expired=true;quoteChecked=false;if(box)box.innerHTML=quoteBlock(p);}
   else if(clock.valid){const text=app.querySelector('#quote-validity');if(text)text.textContent=quoteClockText(clock.secondsRemaining);}
  }
 }catch{refreshQuote();render();}
}
async function action(kind,el){const id=el.dataset.id,p=id&&!kind.startsWith('cost-')&&!kind.startsWith('workspace-')&&!['clone','edit','seal-recheck','manifest','brief','copy-manifest','export'].includes(kind)?project(id):null;
 switch(kind){
  case 'cancel-input':if(handoffCheck?.pending){handoffCheck.pending=false;handoffCheck.cancelled=true;}asyncInputs.cancelAll();inputFeedback={};updateAsyncControls();render();notify(t('读取 / 核对已取消，原内容保留。','Reading / checking cancelled. Original content preserved.'));break;
  case 'handoff-check':await startFilePreflight(true);break;
  case 'workspace-status':workspaceFilters.status=el.dataset.value;render();break;
  case 'workspace-clear':Object.assign(workspaceFilters,{status:'current',type:'all',search:'',sort:'updated'});render();break;
  case 'workspace-archive':case 'workspace-restore':store=setArchived(store,id,kind==='workspace-archive');if(kind==='workspace-restore')workspaceFilters.status='current';persist();render();notify(kind==='workspace-archive'?t('已归档，原方案和记录保留，可随时恢复。','Archived. Original plan and records are preserved and restorable.'):t('已恢复到当前方案，发行参数与指纹未改。','Restored to current plans. Parameters and fingerprints unchanged.'));break;
  case 'workspace-new':{
   const type=el.dataset.type==='token'?'token':'nft',next=newDraft(type),kept=preserveForm(type,next);
   draft=next;editingId=null;step=0;draftEdited=false;formErrors={};saveWorking();go('create/'+type);if(kept.created)notify(t('上一份编辑进度已保留为独立草稿。','Previous editing progress preserved as a separate draft.'));break;
  }
  case 'workspace-resume':{
   const type=el.dataset.type==='token'?'token':'nft',saved=store.workings?.[type]??(store.working?.raw?.type===type?store.working:null);if(!saved)break;
   draft={...saved.raw};editingId=store.drafts.some(d=>d.id===saved.id&&!d.sealed&&!d.archivedAt)?saved.id:null;step=Math.max(0,Math.min(3,Math.floor(Number(saved.step)||0)));draftEdited=saved.edited!==false;formErrors={};saveWorking();go('create/'+type);break;
  }
  case 'workspace-keep':{const kept=preserveForm(el.dataset.type,null);persist();render();notify(kept.created?t('编辑进度已另存为独立草稿。','Editing progress saved as a separate draft.'):t('相同内容已在本地保留。','Matching content is already preserved locally.'));break;}
  case 'workspace-close':{
   const type=el.dataset.type,kept=closeWorkingForm(store,type,{idFactory:()=>makeId()});store=kept.data;if(draft?.type===type){draft=null;editingId=null;step=0;draftEdited=false;}persist();render();notify(kept.created?t('编辑区已收起，原内容已保留为独立草稿。','Editor closed. Original content preserved as a separate draft.'):t('编辑区已收起，已有方案和记录保留。','Editor closed. Existing plans and records preserved.'));break;
  }
  case 'position-review':case 'position-export':case 'position-brief':await prepareAgentOutput(id,kind);break;
  case 'packet-command':case 'packet-package':case 'packet-brief':case 'packet-manifest':case 'packet-position':case 'packet-json':{
   const packet=reviewPacket;if(!packet||packet.id!==el.dataset.packet||packet.route!==location.hash)throw Error('EXPORT_CONTEXT');
   const {bundle}=packet,valid=()=>reviewPacket===packet&&packet.route===location.hash;
   if(kind==='packet-command'||kind==='packet-brief')await copyText(completeAgentCommand(packet.reviewPackage,lang),{valid});
   else if(kind==='packet-package')download(packet.subscriptionReview?subscriptionReviewFilename(bundle):reviewPackageFilename(bundle),stringify(packet.reviewPackage));
   else if(kind==='packet-manifest')download(manifestFileName(bundle.manifest.project.symbol),stringify(bundle.manifest));
   else if(kind==='packet-position'){if(!bundle.position)throw Error('EXPORT_CONTEXT');download(`echo-launch-position-${bundle.projectId.replace(/[^a-zA-Z0-9_-]/g,'-')}.json`,stringify(bundle.position));}
   else if(kind==='packet-json')await copyText(stringify(packet.reviewPackage),{valid});
   break;
  }
  case 'seal-recheck':{const d=store.drafts.find(d=>d.id===id);if(d){sealChecks.delete(id);render();await checkLocalSeal(d);render();}break;}
  case 'verify-to-draft':{
   if(!manifestInspection?.result?.projectImportable)throw Error('IMPORT_SCHEMA');
   const sourceFile=manifestInspection,task=asyncInputs.begin('import-file',()=>[location.hash,manifestInspection],{name:sourceFile.name});render();
   const result=await runScopedTask(asyncInputs,task,async()=>{const m=await importManifest(sourceFile.text);return normalizeDraft({...m.project,metadataText:JSON.stringify(m.metadata??[])});},{commit:raw=>{
    const stamp=new Date().toISOString(),newId=makeId();store.drafts.push({id:newId,raw,sealed:false,digest:null,createdAt:stamp,updatedAt:stamp});persist();go('manage/'+encodeURIComponent(newId));notify(t('只导入项目数据为待审核草稿；未沿用源指纹、合约或执行标记。','Project data imported as a review draft. Source seals, contracts and execution flags were not adopted.'));
   },onError:announceError});if(result.status!=='discarded')render();break;
  }
  case 'cost-example':{
   const plan=planningProject(id);if(!plan)break;
   store.operatingPlans[id]=operatingRecord({source:'illustrative-example',inputs:illustrativeOperatingInputs(plan.raw.type),updatedAt:new Date().toISOString()},plan.raw.type);persist();render();notify(t('已填入假设算例，不是真实费用或余额。','Illustrative assumptions entered, not real costs or balances.'));break;
  }
  case 'cost-export':case 'cost-brief':{
   const plan=planningProject(id);if(!plan)break;
   const data=operatingManifest(plan.raw,store.operatingPlans[id],{projectId:id});
   if(kind==='cost-export')download('echo-launch-operating-'+(plan.raw.symbol||'plan')+'.json',stringify(data));else await prepareAgentOutput(id,'cost-brief');break;
  }
  case 'rebuild-demo':archiveAndLoadScenario(p,p.example?p.scenario:'raising');notify(storageError?t('原演示已在当前页面归档，保存未成功，请下载备份。','Original demo archived in this page. Saving failed; download a backup.'):t('原演示已归档，新场景已载入；发行方案未改。','Original demo archived; new scenario loaded. Launch plan unchanged.'));break;
  case 'jump-section':{
   const target=document.getElementById(el.dataset.target);if(!target)break;
   app.querySelectorAll('.detail-nav button').forEach(b=>{b.classList.toggle('selected',b===el);if(b===el)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
   target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});break;
  }
  case 'language':asyncInputs.cancel('agent-export');saveWorking();lang=lang==='zh'?'en':'zh';persist();render();break;
  case 'source':source=el.dataset.value;render();break;
  case 'filter':filter=el.dataset.value;render();break;
  case 'minus':case 'plus':{const q=app.querySelector('#quantity');try{let n=BigInt(q.value);n+=kind==='plus'?1n:-1n;q.value=(n<1n?1n:n).toString();refreshQuote();}catch{q.value='1';}break;}
  case 'quote':{const q=freshQuote(p);quote={projectId:p.id,data:q,createdAt:Date.now()};quoteChecked=false;app.querySelector('#quote-output').innerHTML=quoteBlock(p);break;}
  case 'subscription-max':{const s=sessionFor(p),v=current(p),maximum=subscriptionMaximum(v.raw,v.state,positionFor(s).units),input=app.querySelector('#subscription-amount');input.value=b(maximum.paymentWei);refreshQuote();input.focus();break;}
  case 'subscription-review':{const q=freshQuote(p);quote={projectId:p.id,data:q,createdAt:Date.now()};quoteChecked=false;app.querySelector('#quote-output').innerHTML=quoteBlock(p);await prepareAgentOutput(p.id,'subscription-review');break;}
  case 'check':freshQuote(p,{match:true});quoteChecked=true;app.querySelector('#quote-output').innerHTML=quoteBlock(p);break;
  case 'subscribe':{
   if(!quoteChecked||!app.querySelector('#ack-quote')?.checked){notify(t('请先检查本地规则并勾选演示确认。','Check local rules and acknowledge the demo.'));break;}
   const q=freshQuote(p,{match:true}),s=sessionFor(p),result=subscribePosition(s.raw,s,q,{projectId:p.id});store.sessions[p.id]=result.session;
   addEvent(p,'subscribe',{units:q.quantity,paymentWei:q.paymentWei,reservedTokenIds:q.reservedTokenIds});refreshQuote();render();notify(t('演示认购已记录，没有真实付款。','Demo subscription recorded. No payment made.'));break;
  }
  case 'exit':{
   const s=sessionFor(p);readIdentity(s);const v=current(p),q=exitQuote(v.raw,v.state,positionFor(s));
   showDialog(q.kind==='full-refund'?t('全额退款预览','Full refund preview'):t('全部提前退出预览','Full-position exit preview'),`<p>${t('此操作只记录演示，不发起交易。','This records a demo only, without a transaction.')}</p><dl class="facts"><div><dt>${t('全部退出数量','Entire position')}</dt><dd>${n(q.units)}</dd></div><div><dt>${t('退回本金','Principal returned')}</dt><dd>${b(q.refundWei)} BNB</dd></div><div><dt>${t('平台费用','Platform fee')}</dt><dd>${b(q.platformFeeWei)} BNB</dd></div><div><dt>Gas</dt><dd>${t('未估算 · 不在退款内','Not estimated · Not refunded')}</dd></div></dl>${q.kind==='full-refund'?'':note(t('退出后释放该身份额度；以后重新参与仍须在开放期内且符合上限。','Exit releases the identity quota. Re-entry still requires an open subscription period and available quota.'))}${btn('confirm-exit',t('记录演示退出 / 退款','Record demo exit / refund'),'primary full',`data-id="${esc(id)}" data-refund="${q.refundWei}" data-units="${q.units}" data-fee="${q.platformFeeWei}"`)} `);break;
  }
  case 'confirm-exit':{
   const s=sessionFor(p),v=current(p),result=exitPosition(v.raw,s,identityFor(s)),q=result.quote;
   if(q.refundWei!==el.dataset.refund||q.units!==el.dataset.units||q.platformFeeWei!==el.dataset.fee)throw Error('QUOTE_STALE');
   store.sessions[p.id]=result.session;
   addEvent(p,q.kind==='full-refund'?'refund':'exit',{units:q.units,refundWei:q.refundWei,platformFeeWei:q.platformFeeWei,reservedTokenIds:result.reservedTokenIds});dialog.close();refreshQuote();render();notify(t('演示已记录，可在“我的记录”查看。','Demo recorded. See My activity.'));break;
  }
  case 'deliver':case 'batch':{
   const s=sessionFor(p);readIdentity(s);const v=current(p),result=deliverPosition(v.raw,s,identityFor(s));store.sessions[p.id]=result.session;addEvent(p,kind==='batch'?'batch':'claim',{units:result.units,reservedTokenIds:result.reservedTokenIds});render();notify(t('演示交付已记录，不会向钱包转账。','Demo delivery recorded. No wallet transfer.'));break;
  }
  case 'seed':{
   const s=sessionFor(p);readIdentity(s);const v=current(p),result=samplePosition(v.raw,s,identityFor(s));store.sessions[p.id]=result.session;addEvent(p,'seed',{units:result.units,reservedTokenIds:result.reservedTokenIds,note:'Scenario seed, not a new subscription or payment.'});refreshQuote();render();notify(t('已载入示例认购。','Sample position loaded.'));break;
  }
  case 'fill-example':{
   const type=draft.type,x=exampleProject(type==='nft'?'example-aurum':'example-orbit'),next={...x.raw,startsAt:new Date(Date.now()+3600000).toISOString()},kept=preserveForm(type,next);draft=next;editingId=null;draftEdited=true;formErrors={};saveWorking();render();if(kept.created)notify(t('填入示例前，原编辑进度已保留为独立草稿。','Original editing progress preserved before loading the sample.'));break;
  }
  case 'previous':asyncInputs.cancelAll();handoffCheck=null;step=Math.max(0,step-1);formErrors={};saveWorking();render();scrollTo({top:0,behavior:'smooth'});break;
  case 'next':if(asyncInputs.pending()){notify(t('请等待文件读取完成，或先取消读取。','Wait for the file to finish, or cancel reading.'));break;}if(validateStep()){step=Math.min(3,step+1);formErrors={};saveWorking();}render();app.querySelector('[aria-invalid="true"]')?.focus();scrollTo({top:0,behavior:'smooth'});break;
  case 'save-draft':saveDraft();render();notify(storageError?t('草稿保留在当前页面，尚未保存成功。请下载备份。','Draft retained in this page but not saved. Download a backup.'):t('草稿已保存在本浏览器。','Draft saved in this browser.'));break;
  case 'seal':{
   if(asyncInputs.pending()){notify(t('请等待当前读取 / 核对完成，或先取消。','Wait for the current read / check, or cancel it.'));break;}
   if(!validateStep()){render();break;}
   if(!app.querySelector('#ack-rules')?.checked||!app.querySelector('#ack-local')?.checked){notify(t('请核对规则并勾选两项确认。','Review the rules and select both acknowledgements.'));break;}
   const snapshot=normalizeDraft(draft),sealId=editingId??makeId();
   const context=()=>[location.hash,draft,editingId,step,stringify(draft),app.querySelector('#ack-rules')?.checked===true,app.querySelector('#ack-local')?.checked===true];
   const task=asyncInputs.begin('seal',context);updateAsyncControls();
   const result=await runScopedTask(asyncInputs,task,async()=>{
    const manifest=await makeManifest(snapshot,{id:sealId,demo:true}),candidate={id:sealId,raw:snapshot,sealed:true,digest:manifest.configDigest,sealRulesVersion:RULES.version};
    const check=await verifySealedRecord(candidate);if(!sealCheckCurrent(candidate,check))throw Error('SEAL_UNVERIFIED');return {manifest,check};
   },{commit:({manifest,check})=>{
    editingId=sealId;const d=saveDraft({sealed:true,digest:manifest.configDigest});sealChecks.set(d.id,check);store.working=null;delete store.workings[draft.type];persist();draft=null;step=0;editingId=null;go('project/'+encodeURIComponent(d.id));notify(storageError?t('已在当前页面定稿，但保存未成功，请立即备份。','Sealed in this page, but not saved. Download a backup now.'):t('已生成本地定稿，没有上传或部署。','Local plan sealed. Nothing uploaded or deployed.'));
   },onError:announceError});
   updateAsyncControls();if(result.status==='discarded'&&route()[0]==='create')notify(t('草稿或确认已变化，未定稿。请重新核对。','Draft or acknowledgements changed. Nothing sealed. Review again.'));break;
  }
  case 'edit':case 'clone':{
   const d=store.drafts.find(x=>x.id===id);if(!d)return;if(kind==='edit'&&d.sealed)throw Error('SEALED');
   if(kind==='edit'&&d.archivedAt)throw Error('ARCHIVED_EDIT');
   if(dialog.open)dialog.close();
   const next={...d.raw};if(kind==='clone'){next.startsAt=new Date(Date.now()+3600000).toISOString();next.name=next.name.slice(0,40)+t(' 副本',' copy');}const kept=preserveForm(next.type,next);draft=next;editingId=kind==='edit'?d.id:null;step=kind==='edit'?(el.dataset.step!==undefined?Math.max(0,Math.min(3,Math.floor(Number(el.dataset.step)||0))):draftProgress(next).nextStep):0;draftEdited=kind==='clone';formErrors={};saveWorking();go('create/'+draft.type);if(kept.created)notify(t('原编辑进度已保留为独立草稿。','Previous editing progress preserved as a separate draft.'));break;
  }
  case 'metadata-sample':{
   const count=Number(draft.nftSupply);if(!Number.isSafeInteger(count)||count<1||count>200){notify(t('示例生成器支持 1–200 枚；更大的系列请导入完整 JSON。这不改变发行上限。','The sample generator supports 1–200 items. Import complete JSON for larger collections. This is not a supply cap.'));break;}
   cancelDraftInput('metadataText');draft.metadataText=stringify(Array.from({length:count},(_,i)=>({name:`${draft.name||'Collection'} #${i+1}`,image:draft.cover||'https://echobsc.fun/assets/echo-social-card-v1.jpg',description:'Local preview example. Replace before real issuance.',attributes:[{trait_type:'Edition',value:i+1}]})));draftEdited=true;saveWorking();render();break;
  }
  case 'metadata-template':download('nft-metadata-example.json',stringify([{name:'Collection #1',image:'ipfs://REPLACE_WITH_YOUR_CONTENT_CID/image-1.png',description:'Describe this NFT.',attributes:[{trait_type:'Edition',value:1}]}]));break;
  case 'manifest':case 'brief':case 'copy-manifest':case 'export':await prepareAgentOutput(id,kind);break;
  case 'agent-copy':await prepareAgentOutput(app.querySelector('#agent-project').value,'brief');break;
  case 'agent-json':await action('manifest',{dataset:{id:app.querySelector('#agent-project').value}});break;
  case 'agent-export':await action('export',{dataset:{id:app.querySelector('#agent-project').value}});break;
  case 'backup':case 'backup-split':{const state=captureBackupExport();if(kind==='backup-split'||!state.budget.automaticRestoreSupported)await startBackupParts(state);else{download('echo-launch-local-backup.json',state.text);notify(t('已生成紧凑本地备份，请确认下载完成。','Compact local backup generated. Check that the download completed.'));}break;}
  case 'backup-part-download':{
   const state=backupExport,index=Number(el.dataset.index),part=state?.pack?.parts.find(x=>x.index===index);if(!part)throw Error('BACKUP_PART_SCHEMA');download(part.filename,part.text);state.requested.add(index);el.textContent=t('再次下载此分包','Download this part again');const status=dialog.querySelector('#pack-download-status');if(status)status.textContent=t(`已发起 ${state.requested.size} / ${state.pack.total} 包下载；请检查文件已保存。`,`Requested ${state.requested.size} / ${state.pack.total} downloads; check the files are saved.`);break;
  }
  case 'backup-pack-cancel':asyncInputs.cancel('backup-pack');backupExport=null;dialog.close();break;
  case 'backup-raw':{if(!backupExport)throw Error('BACKUP_SCHEMA');const text=backupExport.text;download('echo-launch-local-backup-raw.json',text);dialog.close();backupExport=null;notify(t('原始备份已生成；此大文件不支持直接自动恢复。','Raw backup generated. This large file is not directly recoverable through the automatic input.'));break;}
  case 'backup-projects':dialog.close();backupExport=null;go('manage');break;
  case 'retry-storage':{
   const latest=readStore(storage);
   if(latest.error){storageError=latest.error;storageBlockReason=latest.writeBlocked?latest.error:null;}
   else if(latest.sourceRaw===persistedRaw||(persistedRaw===undefined&&latest.sourceRaw===null)){
    persistedRaw=latest.sourceRaw;storageBlockReason=null;persist();
   }else{storageError='storage-conflict';storageBlockReason=storageError;}
   render();notify(storageError?t('尚未恢复保存，原始内容继续保留。','Saving is still unavailable. The original is preserved.'):t('本地存储已恢复，当前内容已保存。','Storage recovered. Current changes saved.'));break;
  }
  case 'restore-merge':{
   if(!pendingRecovery)throw Error('BACKUP_SCHEMA');
   if(pendingRecoveryContext!==stringify(store)){pendingRecovery=null;pendingRecoveryContext=null;dialog.close();throw Error('ASYNC_CONTEXT');}
   const counts=pendingRecovery.counts;store=mergeBackupImport(store,pendingRecovery,{includeEvents:dialog.querySelector('#restore-history')?.checked!==false,includeOperatingPlans:dialog.querySelector('#restore-operating')?.checked!==false});
   pendingRecovery=null;pendingRecoveryContext=null;persist();dialog.close();go('manage');notify(storageError?t('已合并到当前页面，保存仍受阻，请立即下载新备份。','Merged in this page. Saving is still blocked; download a new backup.'):t(`已恢复 ${counts.newDrafts} 份待审核草稿，已有方案未覆盖。`,`${counts.newDrafts} review drafts restored. Existing plans were preserved.`));break;
  }
 }
}
app.addEventListener('click',event=>{const focus=event.target.closest('[data-focus]');if(focus){event.preventDefault();document.getElementById(focus.dataset.focus)?.focus();return;}const el=event.target.closest('[data-action]');if(el){event.preventDefault();Promise.resolve(action(el.dataset.action,el)).catch(announceError);}});
dialog.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el){event.preventDefault();Promise.resolve(action(el.dataset.action,el)).catch(announceError);}});
app.addEventListener('submit',e=>e.preventDefault());
app.addEventListener('input',event=>{
 const el=event.target;
 if(el.id==='workspace-search'){workspaceFilters.search=el.value;const caret=el.selectionStart;render();const field=app.querySelector('#workspace-search');field?.focus();field?.setSelectionRange?.(caret,caret);return;}
 if(el.dataset.operatingField){if(el.tagName!=='SELECT')updateOperatingInput(el);return;}
 if(el.id==='search'){search=el.value;const pos=el.selectionStart;render();const replacement=app.querySelector('#search');replacement.focus();replacement.setSelectionRange?.(pos,pos);return;}
 if(el.id==='quantity'||el.id==='subscription-amount'){asyncInputs.cancel('agent-export');updateExportStatus();refreshQuote();return;}
 if(el.id==='identity'){asyncInputs.cancel('agent-export');updateExportStatus();refreshQuote();try{refreshIdentityPosition();}catch(error){announceError(error);}return;}
 if(['ack-rules','ack-local'].includes(el.id)){asyncInputs.cancel('seal');updateAsyncControls();return;}
 if(el.dataset.field&&draft){cancelDraftInput(el.dataset.field);let value=el.value;if(el.dataset.field==='startsAt')value=el.value&&Number.isFinite(Date.parse(el.value))?new Date(el.value).toISOString():'';draft[el.dataset.field]=value;draftEdited=true;delete formErrors[el.dataset.field];saveWorking();const summary=app.querySelector('#economics-live');if(summary)summary.innerHTML=creationSummary();const calc=app.querySelector('#terms-calculation');if(calc)calc.innerHTML=calculationNotice();const name=app.querySelector('#draft-name');if(name)name.textContent=draft.name||t('你的项目','Your project');const priceLabel=app.querySelector('#token-price-summary');if(priceLabel)priceLabel.textContent=priceSummary(draft,operatingHelpers());}
});
app.addEventListener('change',event=>{handleChange(event).catch(announceError);});
async function handleChange(event){const el=event.target;
 if(el.id==='agent-project'){agentSelection=el.value;asyncInputs.cancel('agent-export');updateExportStatus();return;}
 if(el.id==='workspace-type'){workspaceFilters.type=el.value;render();return;}
 if(el.id==='workspace-sort'){workspaceFilters.sort=el.value;render();return;}
 if(el.id==='verify-file'&&el.files[0]){
  const file=el.files[0],task=asyncInputs.begin('verify-file',()=>[location.hash],{name:file.name});manifestInspection=null;render();
  const result=await runScopedTask(asyncInputs,task,async()=>{if(file.size>MAX_MANIFEST_BYTES)throw Error('IMPORT_SIZE');const text=await file.text();return {name:file.name,text,result:await inspectManifestFile(text)};},{commit:value=>manifestInspection=value,onError:error=>manifestInspection={name:file.name,error:errorText(error.message)}});
  if(result.status!=='discarded')render();return;
 }
 if(el.id==='cost-project'){go('costs/'+encodeURIComponent(el.value));return;}
 if(el.dataset.operatingField){if(el.tagName==='SELECT')updateOperatingInput(el);return;}
 if(el.id==='restore-file'&&el.files[0]){
  const files=Array.from(el.files),snapshot=structuredClone(store),context=stringify(store),task=asyncInputs.begin('restore-file',()=>[location.hash,storeEpoch],{name:files.length===1?files[0].name:t(`${files.length} 个备份文件`,`${files.length} backup files`)});pendingRecovery=null;pendingRecoveryContext=null;render();
  const result=await runScopedTask(asyncInputs,task,()=>prepareRecoveryFiles(files,snapshot,{isCurrent:()=>asyncInputs.current(task),onProgress:progress=>{
   if(!asyncInputs.current(task))return;task.details.name=t(`备份检查 ${progress.completed} / ${progress.total}`,`Backup check ${progress.completed} / ${progress.total}`);const slot=app.querySelector('#async-file-status');if(slot)slot.innerHTML=externalFileNotice();
  }}),{commit:plan=>{pendingRecovery=plan;pendingRecoveryContext=context;showDialog(t('检查本地备份恢复内容','Review local backup recovery'),restoreDialog(plan));},onError:announceError});
  if(result.status!=='discarded')render();return;
 }
 if(el.id==='identity'){refreshIdentityPosition();return;}
 if(el.id==='scenario'){
  asyncInputs.cancel('agent-export');updateExportStatus();
  const p=project(el.dataset.id);archiveAndLoadScenario(p,el.value);return;
 }
 if(el.id==='cover-file'&&el.files[0]){await applyDraftFile(el.files[0],'cover');return;}
 if(el.id==='metadata-file'&&el.files[0]){await applyDraftFile(el.files[0],'metadata');return;}
 if(el.id==='import-file'&&el.files[0]){
  const file=el.files[0],task=asyncInputs.begin('import-file',()=>[location.hash],{name:file.name});render();
  const result=await runScopedTask(asyncInputs,task,async()=>{
   if(file.size>MAX_MANIFEST_BYTES)throw Error('IMPORT_SIZE');const text=await file.text();let data;try{data=JSON.parse(text);}catch{throw Error('IMPORT_JSON');}
   if(data?.schema==='echo-launch-draft/v2'&&['nft','token'].includes(data.project?.type))return normalizeDraft(data.project);
   const rebuilt=await importManifest(text);return normalizeDraft({...rebuilt.project,metadataText:JSON.stringify(rebuilt.metadata??[])});
  },{commit:raw=>{const now=new Date().toISOString(),id=makeId();store.drafts.push({id,raw,sealed:false,digest:null,createdAt:now,updatedAt:now});persist();go('manage/'+encodeURIComponent(id));notify(t('已导入为待审核草稿。原有合约、执行标记和经济字段不会被信任。','Imported as a draft for review. Imported contracts, readiness flags and economic overrides are not trusted.'));},onError:announceError});
  if(result.status!=='discarded'&&route()[0]==='manage')render();return;
 }
}
dialog.addEventListener('close',()=>{if(!dialog.open){backupExport=null;reviewPacket=null;pendingRecovery=null;pendingRecoveryContext=null;asyncInputs.cancel('backup-pack');asyncInputs.cancel('agent-export');copyEpoch++;updateExportStatus();}});
window.addEventListener('hashchange',()=>{asyncInputs.cancelAll();inputFeedback={};handoffCheck=null;backupExport=null;reviewPacket=null;copyEpoch++;pendingRecovery=null;pendingRecoveryContext=null;if(dialog.open)dialog.close();quote=null;quoteChecked=false;render();scrollTo(0,0);});
setInterval(monitorProject,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)monitorProject();});
window.addEventListener('focus',monitorProject);
document.querySelector('.skip')?.addEventListener('click',e=>{e.preventDefault();app.querySelector('#main')?.focus();});
render();
auditSealedPlans().catch(()=>{for(const d of store.drafts.filter(d=>d.sealed))if(!sealChecks.has(d.id))sealChecks.set(d.id,{status:'unavailable',snapshot:sealSnapshot(d)});render();});
