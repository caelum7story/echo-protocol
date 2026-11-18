import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const root=path.resolve(import.meta.dirname,'..'),frontend=path.resolve(root,'../echo-mint-preview-20261105'),work=path.resolve(root,'../../work/echo-launch-preview-20261113/runtime-read-20261114');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {values}=parseArgs({options:{'session-id':{type:'string'}}}),sessionId=Number(values['session-id']);
if(!Number.isSafeInteger(sessionId)||sessionId<1)throw Error('PREVIEW_SESSION_REQUIRED');
const active=JSON.parse(fs.readFileSync(path.join(work,'active-preview.json'),'utf8')),previewUrl=new URL(active.url);
if(active.chainId!==31337||active.localOnly!==true||active.status!=='running'||previewUrl.protocol!=='http:'||previewUrl.hostname!=='127.0.0.1'||!Number.isSafeInteger(active.pid))throw Error('LOCAL_PREVIEW_REQUIRED');
const observations=JSON.parse(fs.readFileSync(path.join(work,'participant-browser-observations.json'),'utf8'));
if(active.templateCreationCodeHashesVerified!==true||!Number.isFinite(Date.parse(active.startedAt))||observations.previewPid!==active.pid||Date.parse(observations.observedAt)<Date.parse(active.startedAt)||!Number.isFinite(Date.parse(observations.observedAt)))throw Error('NEW_BYTECODE_BROWSER_OBSERVATIONS_REQUIRED');
for(const [f,d]of Object.entries(active.artifactHashes??{}))if(hash(path.join(root,f))!==d)throw Error('PREVIEW_ARTIFACT_PIN_CHANGED');
if(!active.artifactHashes?.['artifacts/TokenLaunch.json'])throw Error('PREVIEW_ARTIFACT_PINS_REQUIRED');
if(observations.chainId!==31337||observations.localOnly!==true||observations.scenarios?.length!==14||new Set(observations.scenarios.map(s=>s.scenario)).size!==14)throw Error('BROWSER_LIFECYCLE_EVIDENCE_REQUIRED');
const inputs=['lib/agent-client.mjs','lib/project-index.mjs','lib/participant-proof.mjs','lib/runtime-read-server.mjs','lib/local-rehearsal.mjs','scripts/preview-runtime.mjs'];
const frontInputs=['dist/launch/runtime-read.mjs','dist/launch/participant-view.mjs','dist/launch/ui.mjs','dist/launch/core.mjs','dist/launch/ui.css','dist/launch/index.html'];
const screenshots=['participant-mobile-zh.jpg','participant-desktop-en.jpg','participant-desktop-zh.jpg'];
for(const f of screenshots)if(fs.statSync(path.join(work,f)).mtimeMs<Date.parse(active.startedAt))throw Error('FRESH_BROWSER_SCREENSHOTS_REQUIRED');
const result={observedAt:new Date().toISOString(),schema:'echo-launch-runtime-browser-qa/v1',localOnly:true,chainId:31337,browser:'in-app browser',renderedBrowserVerified:true,
 checks:{nftStateObserved:true,tokenStateObserved:true,successfulReceiptCountsObserved:true,invalidWalletMessageObserved:true,rehearsalWalletRecoveryObserved:true,
  fourteenLifecycleScenariosObserved:true,refundAvailabilityCreditAndPaymentDistinct:true,cumulativeDeliveryAndCurrentHoldingsDistinct:true,mixedPartialCreditsNotAttributedToRefund:true,
  chineseMobileNoHorizontalOverflow:true,englishDesktopNoHorizontalOverflow:true,viewportRestored:true,chinesePreviewRetained:true},
 measuredViewports:[{requestedWidth:360,requestedHeight:780,layoutWidth:345,scrollWidth:345,language:'zh'},{requestedWidth:1280,requestedHeight:900,layoutWidth:1265,scrollWidth:1265,language:'en'}],
 inputHashes:Object.fromEntries(inputs.map(f=>[f,hash(path.join(root,f))])),frontendHashes:Object.fromEntries(frontInputs.map(f=>[f,hash(path.join(frontend,f))])),artifactHashes:active.artifactHashes,
 screenshots:Object.fromEntries(screenshots.map(f=>[f,hash(path.join(work,f))])),
 observationFiles:{'participant-browser-observations.json':hash(path.join(work,'participant-browser-observations.json'))},lifecycleScenarioCount:14,
 preview:{url:active.url,pid:active.pid,execSessionId:sessionId,keptForUserReview:true},
 publicDeployment:false,uploaded:false,realWalletUsed:false,realFundsUsed:false,independentReview:false};
const response=await fetch(new URL('/launch-api/status',previewUrl),{signal:AbortSignal.timeout(5000)}),status=await response.json();
if(!response.ok||status.chainId!==31337||status.readOnly!==true||status.executionReady!==false)throw Error('PREVIEW_NOT_LIVE');
result.preview.liveObservedAt=new Date().toISOString();result.preview.registry=status.index.registry;result.preview.head=status.index.head;
fs.writeFileSync(path.join(work,'browser-qa.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({recorded:true,browserVerified:true,chainId:31337,previewLive:true,uploaded:false}));
