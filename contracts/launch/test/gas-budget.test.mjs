import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {quoteGasBudget,verifyMeasurementInputs} from '../scripts/gas-budget.mjs';
const measurement={schema:'echo-launch-local-gas/v1',chainId:31337,localOnly:true,remoteWrites:false,realWalletUsed:false,completed:true,measurements:[{id:'batch',gasUsed:'101',estimatedGas:'102'}]};
test('gas budget uses exact integer ceil on the larger receipt/estimate,explicit count and supplied price',()=>{
 const q=quoteGasBudget(measurement,[{id:'batch',count:'2'}],{gasPriceWei:'100000000',availableWei:'1'});
 assert.equal(q.items[0].reservedGasPerTransaction,'133');assert.equal(q.totalGasCostWei,'26600000000');assert.equal(q.shortfallWei,'26599999999');assert.equal(q.funded,false);assert.equal(q.balanceChecked,false);assert.equal(q.executionReady,false);
});
test('a budget remains exact above Number precision and an absent balance remains unknown',()=>{
 const q=quoteGasBudget({...measurement,measurements:[{id:'batch',gasUsed:'9007199254740993',estimatedGas:'1'}]},[{id:'batch',count:'1'}],{gasPriceWei:'1',marginBps:'0'});
 assert.equal(q.totalGasCostWei,'9007199254740993');assert.equal(q.shortfallWei,null);assert.equal(q.availableWei,null);
});
test('budget rejects decimal/exponent/negative/noncanonical input and never silently chooses a gas price',()=>{
 for(const value of [undefined,'0','1.5','1e9','-1',' 1','01',1])assert.throws(()=>quoteGasBudget(measurement,[{id:'batch',count:'1'}],{gasPriceWei:value}));
 for(const count of ['0','-1','1000001','1.1'])assert.throws(()=>quoteGasBudget(measurement,[{id:'batch',count}],{gasPriceWei:'1'}));
 assert.throws(()=>quoteGasBudget(measurement,[{id:'batch',count:'1'}],{gasPriceWei:'1',marginBps:'10001'}));
});
test('unknown or duplicate operations,remote/unfinished reports and uint256 overflow fail closed',()=>{
 for(const plan of [[{id:'missing',count:'1'}],[{id:'batch',count:'1'},{id:'batch',count:'1'}],[]])assert.throws(()=>quoteGasBudget(measurement,plan,{gasPriceWei:'1'}));
 for(const patch of [{chainId:56},{remoteWrites:true},{completed:false},{realWalletUsed:true}])assert.throws(()=>quoteGasBudget({...measurement,...patch},[{id:'batch',count:'1'}],{gasPriceWei:'1'}));
 assert.throws(()=>quoteGasBudget(measurement,[{id:'batch',count:'1'}],{gasPriceWei:String((1n<<256n)-1n)}),/BUDGET_OVERFLOW/);
});
test('source binding rejects missing hashes,changed files and paths outside the measurement project',()=>{
 const digest=createHash('sha256').update(fs.readFileSync(new URL('../package-lock.json',import.meta.url))).digest('hex');
 assert.equal(verifyMeasurementInputs({inputHashes:{'package-lock.json':digest}}),true);
 assert.throws(()=>verifyMeasurementInputs({inputHashes:{}}),/MEASUREMENT_HASHES_REQUIRED/);
 assert.throws(()=>verifyMeasurementInputs({inputHashes:{'package-lock.json':'0'.repeat(64)}}),/STALE_GAS_MEASUREMENT/);
 assert.throws(()=>verifyMeasurementInputs({inputHashes:{'../package-lock.json':digest}}),/STALE_GAS_MEASUREMENT/);
});
