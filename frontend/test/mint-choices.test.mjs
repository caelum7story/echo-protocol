import test from 'node:test';
import assert from 'node:assert/strict';
import {mintChoices} from '../dist/mint-choices.mjs';
import {buildLiveBrief} from '../dist/live-brief.mjs';
test('a paid continuation offer follows verified free delivery and never carries transaction consent',()=>{
 const en=buildLiveBrief({shares:1,language:'en'}),zh=buildLiveBrief({shares:1,language:'zh'});
 assert.match(en,/receipt.status=1.*Minted.*Transfer.*single free first share/);
 assert.match(en,/would you like to continue with a paid Mint\?/);
 assert.match(en,/A yes only permits a fresh read-only quote, not payment or signing consent/);
 assert.match(en,/Pending, failed or unverified delivery must not trigger/);
 assert.match(en,/If I decline or do not answer, stop/);
 assert.match(en,/no price or return is guaranteed/);
 assert.match(zh,/是否希望继续付费铸造？/);
 assert.match(zh,/不构成付款或签名授权/);
 assert.match(zh,/拒绝或未答复就停止/);
 assert.match(zh,/不保证价格或收益/);
});
const state={mintEnabled:true,paused:false,closed:false,retired:false,opened:false,totalMinted:158,freeClaimed:158,pricing:{preOpenPrice:2000000000000000n}};
test('unknown first-free eligibility shows a payment range; a verified first mint separates one free share',()=>{
 const unknown=mintChoices({state,fresh:true})[1];assert.equal(unknown.shares,3);assert.equal(unknown.minCost,4000000000000000n);assert.equal(unknown.maxCost,6000000000000000n);
 const first=mintChoices({state,fresh:true,identity:{minted:0,remaining:10}});
 assert.equal(first[0].maxCost,0n);assert.equal(first[3].maxCost,18000000000000000n);assert.equal(first[3].tokens,10000);
});
test('returning identities get a valid remaining maximum; global and opening boundaries constrain choices',()=>{
 const returning=mintChoices({state,fresh:true,identity:{minted:1,remaining:9}});
 assert.deepEqual(returning.map(o=>o.shares),[1,3,5,9]);assert.equal(returning.at(-1).maxCost,18000000000000000n);
 assert.deepEqual(mintChoices({state:{...state,totalMinted:4998},fresh:true}).map(o=>o.shares),[1,2]);
 assert.equal(mintChoices({state,fresh:true,identity:{minted:10,remaining:0}})[0].disabled,true);
});
test('stale and post-opening snapshots cannot show a pre-opening payment quote',()=>{
 assert.equal(mintChoices({state,fresh:false})[0].maxCost,null);
 assert.equal(mintChoices({state:{...state,opened:true},fresh:true})[0].maxCost,null);
 assert.equal(mintChoices({state:{...state,paused:true},fresh:true})[0].disabled,true);
 assert.equal(mintChoices({state:{...state,freeClaimed:1000},fresh:true})[0].minCost,2000000000000000n);
});
test('Agent follow-up asks once and requires new paid consent instead of appending a transaction',()=>{
 const en=buildLiveBrief({shares:1,language:'en'}),zh=buildLiveBrief({shares:1,language:'zh'});
 assert.match(en,/offer once/);assert.match(en,/Do not append another transaction/);assert.match(en,/new quantity, total-payment ceiling and separate gas ceiling/);assert.match(en,/native BNB balance/);
 assert.match(zh,/仅询问一次/);assert.match(zh,/不得自动追加交易/);assert.match(zh,/原生 BNB 余额/);
});
