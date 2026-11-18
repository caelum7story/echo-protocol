import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const root=path.resolve(import.meta.dirname,'..'),frontend=path.resolve(root,'../echo-mint-preview-20261105'),work=path.resolve(root,'../../work/echo-launch-preview-20261113/runtime-read-20261114');
const read=f=>JSON.parse(fs.readFileSync(path.join(work,f),'utf8')),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const {values}=parseArgs({options:{'session-id':{type:'string'}}}),sessionId=Number(values['session-id']);if(!Number.isSafeInteger(sessionId)||sessionId<1)throw Error('PREVIEW_SESSION_REQUIRED');
const active=read('active-preview.json'),baseline=read('participant-browser-observations-v2.json'),pages=read('pagination-browser-observations.json');
if(active.chainId!==31337||active.localOnly!==true||active.status!=='running'||baseline.previewPid!==active.pid||pages.previewPid!==active.pid||baseline.scenarios?.length!==14||new Set(baseline.scenarios.map(x=>x.scenario)).size!==14)throw Error('CURRENT_BROWSER_OBSERVATIONS_REQUIRED');
if(active.templateCreationCodeHashesVerified!==true||!Number.isFinite(Date.parse(active.startedAt))||![baseline,pages].every(x=>Number.isFinite(Date.parse(x.observedAt))&&Date.parse(x.observedAt)>=Date.parse(active.startedAt)))throw Error('NEW_BYTECODE_BROWSER_OBSERVATIONS_REQUIRED');
for(const [f,d]of Object.entries(active.artifactHashes??{}))if(hash(path.join(root,f))!==d)throw Error('PREVIEW_ARTIFACT_PIN_CHANGED');
if(!active.artifactHashes?.['artifacts/TokenLaunch.json'])throw Error('PREVIEW_ARTIFACT_PINS_REQUIRED');
const statuses=['NFT 可领取','已核验累计交付','可申请本金退款','退款已记账，尚未全部支付','退款记账款已核验付清','代币尚待交付','已核验累计交付','可申请本金退款','退款已记账，尚未全部支付','退款记账款已核验付清','提前退出款已记账','含多类记账，需分别核对','认购权益已记录','认购权益已记录'];
const fields=(entry,label)=>entry?.fields?.find(x=>x.label===label)?.value;
const original=baseline.scenarios,items=pages.nft?.pages?.flatMap(p=>p.ids)??[];
const checks={fourteenLifecycleScenariosObserved:original.every((x,i)=>x.status===statuses[i]),
 cumulativeDeliveryAndCurrentHoldingsDistinct:fields(original[1],'累计已交付')==='3 NFT'&&fields(original[1],'当前资产余额 · 含转入/转出')==='2 NFT'&&fields(original[6],'累计已交付')==='1000 枚代币'&&fields(original[6],'当前资产余额 · 含转入/转出')==='750 枚代币',
 mixedPartialCreditsNotAttributedToRefund:original[11]?.status==='含多类记账，需分别核对',
 historyPendingNotZero:pages.history?.pendingHasNoEntitlementConclusion===true&&pages.history?.afterTwentyPagesHasNoEntitlementConclusion===true,
 historyBoundedContinuation:/1000 \/ 1040/.test(pages.history?.firstBatch??''),
 historyCompleted:pages.history?.completeHasNoPendingPanel===true&&pages.history?.complete?.receiptSummary==='核对成功回执 · 520 · 预览 50'&&pages.history?.complete?.receiptPreviewRows===50,
 nftAllPagesRead:items.length===125&&new Set(items).size===125&&items.every((x,i)=>x==='NFT #'+(i+1))&&pages.nft?.nextButtonAbsentAtEnd===true,
 nftPreviousPage:pages.nft?.previousPage?.[0]==='NFT #101'&&pages.nft?.previousPage?.at(-1)==='NFT #120',
 nftReservationAndOwnerDistinct:fields(pages.nft?.firstPage?.[0],'原预留钱包')!==fields(pages.nft?.firstPage?.[0],'当前持有人')&&pages.nft?.firstPage?.[0]?.status==='交付已核验',
 nftUnmintedExplicit:pages.nft?.unminted?.status==='已预留 · 未铸造'&&fields(pages.nft?.unminted,'当前持有人')==='尚未铸造'&&fields(pages.nft?.unminted,'交付回执')==='无交付回执',
 nftPageFocus:pages.nft?.pageFocus?.every(x=>x.top>=0&&x.top<x.viewportHeight)===true&&pages.nft.pageFocus.length>=2,
 invalidWalletMessageObserved:/钱包地址格式无效/.test(pages.invalidWallet??''),rehearsalWalletRecoveryObserved:pages.walletRecovered===true,
 mobileAndDesktopNoHorizontalOverflow:pages.viewports?.length>=3&&pages.viewports.every(v=>v.layoutWidth===v.scrollWidth&&v.observedWidth===v.requestedWidth&&v.observedHeight>0)&&pages.viewports.some(v=>v.observedWidth===360&&/^zh(?:-|$)/.test(v.language))&&pages.viewports.some(v=>v.observedWidth===1280&&v.language==='en'),
 viewportRestored:pages.viewportRestored===true,chinesePreviewRetained:pages.chinesePreviewRetained===true};
if(Object.values(checks).some(x=>x!==true))throw Error('BROWSER_CHECKS_INCOMPLETE:'+JSON.stringify(checks));
const previewUrl=new URL(active.url);if(previewUrl.protocol!=='http:'||previewUrl.hostname!=='127.0.0.1')throw Error('LOCAL_PREVIEW_REQUIRED');
const response=await fetch(new URL('/launch-api/status',previewUrl),{signal:AbortSignal.timeout(5000)}),status=await response.json();
if(!response.ok||status.chainId!==31337||!status.readOnly||status.executionReady!==false||status.index.projects!==16)throw Error('PREVIEW_NOT_LIVE');
const inputs=['lib/agent-client.mjs','lib/project-index.mjs','lib/participant-proof.mjs','lib/participant-history.mjs','lib/nft-items.mjs','lib/runtime-read-server.mjs','lib/local-rehearsal.mjs','scripts/preview-runtime.mjs'];
const front=['dist/launch/runtime-read.mjs','dist/launch/runtime-detail.mjs','dist/launch/participant-view.mjs','dist/launch/ui.mjs','dist/launch/core.mjs','dist/launch/ui.css','dist/launch/index.html'];
const screenshots=['pagination-mobile-history-pending.jpg','pagination-mobile-history-first-batch.jpg','pagination-mobile-history-complete.jpg','pagination-mobile-receipts.jpg','pagination-mobile-nft-first.jpg','pagination-mobile-nft-last.jpg','pagination-mobile-nft-unminted.jpg','pagination-mobile-invalid-wallet.jpg','pagination-desktop-en.jpg','pagination-desktop-zh.jpg'];
for(const f of screenshots)if(fs.statSync(path.join(work,f)).mtimeMs<Date.parse(active.startedAt))throw Error('FRESH_BROWSER_SCREENSHOTS_REQUIRED');
const result={observedAt:new Date().toISOString(),schema:'echo-launch-runtime-browser-qa/v1',localOnly:true,chainId:31337,browser:'in-app browser',renderedBrowserVerified:true,paginationVerified:true,checks,
 measuredViewports:pages.viewports,inputHashes:Object.fromEntries(inputs.map(f=>[f,hash(path.join(root,f))])),frontendHashes:Object.fromEntries(front.map(f=>[f,hash(path.join(frontend,f))])),artifactHashes:active.artifactHashes,
 screenshots:Object.fromEntries(screenshots.map(f=>[f,hash(path.join(work,f))])),observationFiles:Object.fromEntries(['participant-browser-observations-v2.json','pagination-browser-observations.json'].map(f=>[f,hash(path.join(work,f))])),
 lifecycleScenarioCount:14,paginationScenarioCount:2,preview:{url:active.url,pid:active.pid,execSessionId:sessionId,keptForUserReview:true,liveObservedAt:new Date().toISOString(),registry:status.index.registry,head:status.index.head},
 publicDeployment:false,uploaded:false,realWalletUsed:false,realFundsUsed:false,independentReview:false};
const file=path.join(work,'browser-qa.json'),previous=path.join(work,'browser-qa-before-pagination.json');if(fs.existsSync(file)&&!fs.existsSync(previous))fs.copyFileSync(file,previous);
fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({recorded:true,paginationVerified:true,checksPassed:Object.keys(checks).length,previewLive:true,pid:active.pid}));
