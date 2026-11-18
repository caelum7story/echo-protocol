import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const base='work/echo-launch-preview-20261113/boundary-browser-20261115';
const checks=[
 ['mobile-before-exit-cutoff','before-exit-cutoff','exit-token'],['mobile-exact-exit-cutoff','cutoff','exit-token'],
 ['mobile-one-second-before-pause-limit','before-end','pause-token'],['mobile-nft-before-deadline','before-end','pause-nft'],
 ['mobile-nft-cancelled-at-deadline','end','pause-nft'],['mobile-cancelled-at-pause-limit-before-deadline','end','pause-token'],
 ['mobile-pause-token-refund-credit','refund-credit','pause-token'],['mobile-nft-refund-credit','refund-credit','pause-nft'],
 ['mobile-nft-refund-paid','refund-pay','pause-nft'],['mobile-pause-token-refund-paid','refund-pay','pause-token'],
 ['mobile-one-second-before-pool-timeout','before-grace','pool-token'],['mobile-exact-pool-timeout','grace','pool-token'],
 ['mobile-pool-timeout-refund-credit','pool-refund-credit','pool-token'],['mobile-pool-timeout-refund-paid','pool-refund-pay','pool-token'],
 ['desktop-en-pool-timeout-paid','pool-refund-pay','pool-token'],['desktop-recovered-after-wallet-error','pool-refund-pay','pool-token']
];
const statusLabels={subscribing:/认购权益已记录|Subscription recorded/,refundable:/可申请本金退款|Principal refund available/,'refund-credit':/退款已记账，尚未全部支付|Refund credited; payment outstanding/,'refund-paid':/退款记账款已核验付清|Refund credits paid in full/,'awaiting-liquidity':/等待建池结果|Awaiting liquidity/};
export function inspectBoundaryBrowserEvidence(root,{readFile=f=>fs.readFileSync(f)}={}){
 const workspace=path.resolve(root,'../..'),errors=[];let qa;
 const safe=f=>typeof f==='string'&&f.split('/').every(p=>p&&!['.','..'].includes(p))&&!/[:\\]/.test(f);
 const bytes=f=>{if(!safe(f))throw Error('Unsafe evidence path');return readFile(path.join(workspace,...f.split('/')));};
 const json=f=>JSON.parse(String(bytes(f)));
 try{
  qa=json(base+'/browser-qa.json');
  if(qa.schema!=='echo-launch-boundary-browser-qa/v1'||qa.passed!==true||qa.chainId!==31337||qa.localOnly!==true||qa.publicTransactions!==false||qa.realWalletUsed!==false||qa.uploaded!==false||qa.independentReview!==false||qa.productionReady!==false)throw Error('Invalid browser evidence scope');
  if(typeof qa.sourceRun!=='string'||!qa.sourceRun.startsWith(base+'/run-')||!safe(qa.sourceRun))throw Error('Invalid run path');
  const walkBytes=bytes(qa.sourceRun+'/walkthrough.json'),walk=JSON.parse(String(walkBytes));
  if(sha(walkBytes)!==qa.sourceWalkthroughSha256||walk.stage!=='stopped'||walk.chainId!==31337||walk.localOnly!==true||walk.publicTransactions!==false||walk.realWalletUsed!==false||walk.uploaded!==false||walk.observations?.length!==44||walk.receipts?.length!==12||!walk.receipts.every(r=>r.status===1))throw Error('Invalid or damaged runtime walkthrough');
  if(!qa.inputHashes||Object.keys(qa.inputHashes).length<30||JSON.stringify(qa.inputHashes)!==JSON.stringify(walk.inputHashes))throw Error('Missing runtime inputs');
  for(const file of ['outputs/echo-mint-preview-20261105/dist/launch/runtime-read.mjs','outputs/echo-mint-preview-20261105/dist/launch/core.mjs','outputs/echo-mint-preview-20261105/dist/launch/ui.mjs',base+'/preview.mjs'])if(!qa.inputHashes[file])throw Error('Required runtime input missing');
  for(const [file,digest]of Object.entries(qa.inputHashes))if(!/^[a-f0-9]{64}$/.test(digest)||sha(bytes(file))!==digest)throw Error('Changed runtime input: '+file);
  const artifacts=['browser-observations-final.json','agent-command-current.txt','mobile-exit-cutoff.png','mobile-refund-paid.png','desktop-en-pool-timeout.png'];
  if(Object.keys(qa.artifactHashes??{}).length!==artifacts.length)throw Error('Artifact inventory mismatch');
  for(const file of artifacts)if(sha(bytes(base+'/'+file))!==qa.artifactHashes[file])throw Error('Changed browser artifact: '+file);
  const observations=json(base+'/browser-observations-final.json');
  if(observations.length!==21||qa.observations!==21||qa.phaseAndWalletProofs!==checks.length)throw Error('Incomplete browser observations');
  for(const [label,stage,key]of checks){
   const b=observations.find(x=>x.label===label),a=walk.observations.find(x=>x.label===stage&&x.key===key)?.observation;
   if(!b||!a||b.observedAt<walk.startedAt||!b.reader?.includes(a.state.blockHash)||!b.reader?.includes(a.state.project)||b.wallet!==walk.wallet||b.visibleErrors?.length!==0||b.viewport.documentWidth>b.viewport.width||!statusLabels[a.participant?.status]?.test(b.participant))throw Error('Missing or inconsistent browser proof: '+label);
  }
  const pause=walk.observations.find(x=>x.label==='end'&&x.key==='pause-token').observation.state;
  if(pause.base.cancelled!==true||BigInt(pause.blockTimestamp)>=BigInt(pause.base.endsAt))throw Error('Pause cap not isolated from project deadline');
  const before=observations.find(x=>x.label==='mobile-before-exit-cutoff'),after=observations.find(x=>x.label==='mobile-exact-exit-cutoff');
  if(!/提前退出窗口\n开放/.test(before.lifecycle)||!/新增认购\n开放/.test(after.lifecycle)||!/提前退出窗口\n关闭/.test(after.lifecycle))throw Error('Exit and subscription windows conflated');
  const error=observations.find(x=>x.label==='desktop-invalid-wallet-hides-old-results');
  if(error?.oldProofVisible!==false||error.oldConditionsVisible!==false||!error.text?.includes('Invalid wallet format'))throw Error('Old results not hidden on error');
  const command=String(bytes(base+'/agent-command-current.txt')),packet=JSON.parse(command.slice(command.indexOf('\n{')+1));
  if(packet.executionReady!==false||packet.documents?.launchPlan?.rules?.roundingPolicy!=='fee-floor-remainder-20261115'||packet.documents.launchPlan.rules.platformContentApprovalRequired!==false)throw Error('Agent command rules mismatch');
 }catch(error){errors.push(error.message);}
 return {locallyVerified:errors.length===0,errors,evidence:base+'/browser-qa.json',phaseAndWalletProofs:checks.length,browserObservations:qa?.observations??0,chainId:31337,localOnly:true,publicTransactions:false,realWalletUsed:false,independentReview:false,productionReady:false};
}
