import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const previous=read('evidence/active-work.json'),p=read('evidence/preparation-progress.json');
if(!p.historicalDexFork?.verified||!p.historicalDexFork.currentInputsMatch||!p.localTests.currentInputsMatch||p.localTests.failed!==0||!p.executorGas.localMeasurementsVerified)throw Error('CURRENT_HISTORICAL_FORK_REQUIRED');
const state={...previous,observedAt:new Date().toISOString(),goalStatus:'active',classification:'progress',previousGoalTurnClassification:'progress',
 currentStage:'Fixed-checkpoint BSC state fork verified with actual nonzero feeTo,protocol-fee LP mint,router buy/sell,tax conversion and synced one-wei WBNB donation.18local transactions,10source-current checks and cross-endpoint header match. Public testnet,wallet,funding,storage/admission and independent review remain.',
 historicalDexFork:p.historicalDexFork,liveTestSession:null,
 completedThisTurn:[
  'Probed two primary-documented public RPCs:recent fixed state was readable;the older code-capture block failed historical storage reads. Recorded errors rather than claiming archival coverage.',
  'Implemented a bounded loopback read-only upstream relay for a fixed canonical checkpoint. Submission is denied before forwarding;all18state-changing transactions stayed in local EVM31337.',
  'Verified actual inherited factory pair count,nonzero feeTo and existing-pair reserves;new local pairs incremented inherited storage and matched captured runtime.',
  'Verified80/15/5settlement,irretrievable initial LP,actual router buy0/sell2,later taxed liquidity,protocol-fee LP mint and tax conversion with real fee-on state.',
  'Verified the repaired synced-one-wei WBNB donation case still settles and excludes donations from principal/fees. Source,compiled artifact and harness hashes remained unchanged.',
  'Verified the final checkpoint header/state root through a second public RPC and updated the scoped historical-fork gate and reproduction documentation.'
 ],nextActions:p.nextActions,productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 limitations:'The fork inherits actual recent BSC state but executes locally under EDR Shanghai with mock identity and synthetic accounts. No old-archive coverage,full BSC consensus equivalence,public testnet,real-wallet compatibility or independent security review is established. Storage/admission policy,actual deployment signer,startup funds,executor operations and production authorization remain open.'};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify({recorded:true,goalStatus:'active',historicalFork:true,checks:state.historicalDexFork.checksPassed,localTransactions:state.historicalDexFork.localTransactions,productionReady:false}));
