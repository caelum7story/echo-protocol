import fs from 'node:fs';
import path from 'node:path';
import {root} from './compile.mjs';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const result=read('evidence/local-chain-result.json'),progress=read('evidence/preparation-progress.json'),audit=read('evidence/dependency-audit.json');
const previous=fs.existsSync(path.join(root,'evidence/active-work.json'))?read('evidence/active-work.json'):{};
if(result.exitCode!==0||result.failed!==0||!progress.localTests.currentInputsMatch)throw Error('Current source is not covered by successful local tests');
if(!progress.dependencyAudit.currentLockfileVerified||audit.metadata.vulnerabilities.total!==0)throw Error('Current dependency audit is not clear');
if(!progress.officialDexRuntime?.currentInputsMatch||progress.officialDexRuntime.exitCode!==0||progress.officialDexRuntime.failed!==0||progress.officialDexRuntime.passed===0)throw Error('Current official runtime checks are incomplete');
if(!progress.frontendHandoff?.currentInputsMatch||progress.frontendHandoff.exitCode!==0||progress.frontendHandoff.failed!==0||progress.frontendHandoff.passed===0)throw Error('Current frontend checks are incomplete');
if(!progress.nftContent?.currentInputsMatch||progress.nftContent.exitCode!==0||progress.nftContent.failed!==0||progress.nftContent.passed===0)throw Error('Current NFT content checks are incomplete');
if(!progress.ipfsNode?.verified)throw Error('Current offline IPFS-node checks are incomplete');
if(!progress.projectIndex?.verified)throw Error('Current durable index checks are incomplete');
if(!progress.runtimeRead?.verified)throw Error('Current local read-only runtime/browser integration is incomplete');
if(!progress.participantProofs?.verified)throw Error('Current participant lifecycle proofs are incomplete');
if(!progress.participantHistory?.backendVerified||!progress.participantHistory.frontendIntegrated||!progress.participantHistory.historyPaginationComplete||!progress.nftItemPages?.backendVerified||!progress.nftItemPages.frontendIntegrated)throw Error('Current browser history and NFT pagination evidence is incomplete');
const state={
 ...previous,
 observedAt:new Date().toISOString(),objective:'完成所有上线的准备 直至我取消',goalStatus:'active',classification:'progress',
 currentStage:`14local participant lifecycle views,520receipt history and125NFT item pages verified;${result.passed} backend and${progress.frontendHandoff.passed} frontend tests pass. Production gates remain open.`,
 previousGoalTurnClassification:'progress',
 liveTestSession:null,lastObservedTests:{passed:result.passed,failed:result.failed,terminal:true,evidence:'local-chain-result.json',currentInputsMatch:true},
 dependencyAudit:{terminal:true,exitCode:0,vulnerabilities:0,lockfileSha256:audit.lockfileSha256,evidence:'dependency-audit.json'},
 officialDexRuntime:{...progress.officialDexRuntime,terminal:true,historicalStateFork:false},
 frontendHandoff:{...progress.frontendHandoff,terminal:true},
 nftContent:{...progress.nftContent,terminal:true},
 ipfsNode:{...progress.ipfsNode,terminal:true},
 projectIndex:{...progress.projectIndex,terminal:true},
 runtimeRead:{...progress.runtimeRead,terminal:true},
 participantProofs:{...progress.participantProofs,terminal:true},
 participantHistory:{...progress.participantHistory,terminal:true},
 nftItemPages:{...progress.nftItemPages,terminal:true},
 executorGas:progress.executorGas,
 historicalDexFork:progress.historicalDexFork,
 indexBackup:progress.indexBackup,
 statefulAccounting:progress.statefulAccounting,
 roundingPolicy:progress.roundingPolicy,
 recipientIsolation:progress.recipientIsolation,
 oracleBoundaries:progress.oracleBoundaries,
 completedThisTurn:[
  'Collected the final71/71backend test report and verified it matches current contract,Agent,reader and frontend runtime inputs.',
  'Integrated bounded browser history continuation with explicit incomplete progress;verified520actual local subscription receipts/1040events,20pages per click and a separate50receipt preview.',
  'Added NFT-item API/CLI/browser pages at one canonical snapshot with actual reservation,mint Transfer receipt,current owner and locked content path;typed nonexistence is distinct from provider failure.',
  'Verified all125NFT IDs over7browser pages,previous-page recovery,transfer-out and explicit unminted state;kept content-availability and audit labels unverified.',
  'Re-observed14baseline lifecycle cases,invalid-wallet rejection/recovery,Chinese360x780 and English1280x720actual layouts without horizontal overflow. Retained failed viewport-override attempts and smooth-scroll intermediate observations instead of calling them successful measurements.',
  'Completed16browser checks,verified250frontend tests against current source,updated local documentation/release gates and retained a default-size Chinese local preview.'
 ],
 nextActions:progress.nextActions,
 productionPromptUpdate:{version:48,status:'succeeded',evidence:'../../../work/echo-x-hourly/paid-followup-20261114/result.json'},
 productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 blockers:[],limitations:'NFT public pinning/retention and admission authority are not established. Offline Kubo persistence is not public publication or permanent storage. Browser/API history and NFT pagination are locally verified on isolated EVM31337 only. Remaining pause/cutoff/timeout branches,production resource/provider constraints,historical-state DEX fork,independent review,testnet,real-wallet,budget and release authorization remain open.'
};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');
console.log(JSON.stringify({recorded:true,goalStatus:state.goalStatus,passed:result.passed,advisories:0,productionReady:false}));
