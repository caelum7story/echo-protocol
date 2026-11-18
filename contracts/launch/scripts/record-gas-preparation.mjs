import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const previous=read('evidence/active-work.json'),p=read('evidence/preparation-progress.json');
if(!p.executorGas?.localMeasurementsVerified||!p.executorGas.currentInputsMatch||!p.localTests.currentInputsMatch||p.localTests.failed!==0||!p.frontendHandoff.currentInputsMatch||p.frontendHandoff.failed!==0)throw Error('CURRENT_GAS_PREPARATION_REQUIRED');
const state={...previous,observedAt:new Date().toISOString(),goalStatus:'active',classification:'progress',previousGoalTurnClassification:'progress',
 currentStage:'59operations measured on isolated EVM with exact captured V2 runtime;100distinct-recipient distribution,self-claim/replay and refund/exit paths verified. Integer budget calculator,CLI checks and operational runbook prepared;funding and production signing remain open.',
 executorGas:p.executorGas,liveTestSession:null,
 completedThisTurn:[
  'Measured59actual local receipt paths,including Registry/two factories/two registrations,per-project creation,NFT1/10/100delivery,token1/5/20/100fresh recipients,settlement,refunds and95%exit.',
  'Verified immutable creation-code store and factory-created pair against exact captured mainnet runtime;all executions used synthetic in-process EVM31337 state with a mock identity.',
  'Verified already-delivered and concurrent self-claim batch recovery causes no duplicate token delivery;recorded wasted retry gas rather than assuming a retry is free.',
  'Added exact integer budgeting with separately visible margin,explicit scenario gas price,unknown versus zero planning budget,and source-staleness rejection. Five unit checks and three actual CLI checks pass.',
  'Prepared deployment,settlement,original-recipient distribution,nonce/receipt recovery and insufficient-funds runbook. Identified initial deployment-signing compatibility and startup BNB as separate unresolved gates;future platform fees are not current wallet funds.'
 ],nextActions:p.nextActions,productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 limitations:'Gas measurement is local,with exact captured DEX runtime but fresh empty storage,mock identity and synthetic recipients. Example gas prices are not observed live prices;budget figures do not fund a wallet or authorize spending. Deployment signing,public storage/admission,historical DEX fork,independent review,public testnet,real wallet,actual operator funding and production authorization remain open.'};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify({recorded:true,goalStatus:'active',operations:state.executorGas.operationsMeasured,funded:false,productionReady:false}));
