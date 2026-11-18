import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RESCUE_POLICY} from '../dist/rescue-policy.mjs';
import {buildAgentBrief} from '../dist/interaction-model.mjs';

test('activated integration retains live-chain guards and the confirmed rescue policy',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../dist/network.json',import.meta.url)));
  const deployment=JSON.parse(fs.readFileSync(new URL('../dist/launch/echo/verified-deployment.json',import.meta.url)));
  const activation=JSON.parse(fs.readFileSync(new URL('../dist/launch/echo/activation-verified.json',import.meta.url)));
  assert.equal(config.executionReady,true);assert.equal(config.integrationReady,true);assert.equal(config.activationRequired,false);
  assert.equal(config.readiness.requiresOnchainMintEnabled,true);assert.equal(config.mintEnabled,true);
  assert.equal(config.activationTransaction,activation.activationHash);assert.equal(activation.firstMintConfirmed,true);
  assert.equal(deployment.status,'deployment-verified-mint-disabled');assert.equal(deployment.executionReady,false);
  assert.equal(config.mintContract,deployment.launch);assert.equal(config.tokenContract,deployment.token);
  assert.equal(config.deploymentPreparation.transactionHash,deployment.hash);
  assert.deepEqual(config.rescuePolicy,RESCUE_POLICY);assert.equal(RESCUE_POLICY.rescueVault,'0xA0F8fA9E4Cb9DFeE193C46B147D1F3ae19bD69e5');
  assert.equal(RESCUE_POLICY.delaySeconds,86400);assert.equal(RESCUE_POLICY.lpRescueAllowed,false);
  assert.equal(config.liquidityPolicy.projectLpFeeSharing,false);assert.equal(config.liquidityPolicy.migratable,false);
  assert.doesNotMatch(JSON.stringify(config),/480174dA27c8b3ec44c99C38d21F19D347228209/i);
});

test('concise Agent briefs retain quote, contract readiness and exact-transaction confirmation',()=>{
  const zh=buildAgentBrief({identity:'nova.ai',quantity:1});
  assert.match(zh,/演示总费用：0 BNB/);assert.match(zh,/Gas/);
  assert.match(zh,/executionReady/);assert.match(zh,/取得我对具体交易的确认/);
  const en=buildAgentBrief({identity:'nova.ai',quantity:1,language:'en'});
  assert.match(en,/Demo total cost: 0 BNB/);assert.match(en,/mintContract/);
  assert.match(en,/obtain confirmation for the exact transaction/);
  assert.doesNotMatch(en,/voluntary distribution of actual LP fees|[\u4e00-\u9fff]/);
});
