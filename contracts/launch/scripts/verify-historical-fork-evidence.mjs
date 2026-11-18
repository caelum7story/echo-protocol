import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {toQuantity} from 'ethers';
const root=path.resolve(import.meta.dirname,'..'),hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const file='evidence/historical-dex-fork-result.json',r=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
assert.equal(r.exitCode,0);assert.equal(r.historicalStateFork,true);assert.equal(r.sourceChainId,56);assert.equal(r.localChainId,31337);assert.equal(r.remoteWrites,false);assert.equal(r.realWalletUsed,false);
for(const [f,digest]of Object.entries(r.inputHashes)){const p=path.resolve(root,f);assert.ok(p.startsWith(root+path.sep));assert.equal(hash(f),digest,'Stale fork input: '+f);}
for(const f of ['artifacts/TokenLaunch.json','artifacts/LaunchToken.json','artifacts/MockIdentity.json','artifacts/compile-report.json','scripts/test-historical-dex.mjs','test/historical-fork.mjs'])assert.ok(r.inputHashes[f]);
const required=['inheritedExistingStorage','initialLpIrrecoverable','successAccountingUnchanged','actualRouterBuy0Sell2','actualProtocolFeeLpMint','taxConversionWithFeeOn','syncedOneWeiDonationSettles','donationNotCountedAsPrincipalOrFees','remoteWriteFilter'];
for(const key of required)assert.equal(r.checks[key],true);assert.match(r.checks.actualNonzeroFeeTo,/^0x[0-9a-fA-F]{40}$/);assert.notEqual(BigInt(r.checks.actualNonzeroFeeTo),0n);
assert.ok(BigInt(r.observedStorage.factoryPairs)>0n);assert.equal(r.transactions.length,18);assert.equal(new Set(r.transactions.map(x=>x.hash)).size,18);
const allowed=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getProof','eth_call']);
assert.ok(Object.keys(r.rpc.forwardedMethods).every(x=>allowed.has(x)));assert.equal(r.rpc.remoteWritesForwarded,0);assert.equal(r.rpc.blockedMethods.eth_sendRawTransaction,1);
const endpoint='https://bsc.publicnode.com';
async function read(method,params){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000),redirect:'error'});assert.equal(response.ok,true);const data=await response.json();assert.equal(data.error,undefined);return data.result;}
assert.equal(BigInt(await read('eth_chainId',[])),56n);const block=await read('eth_getBlockByNumber',[toQuantity(r.anchor.number),false]);
assert.equal(block.hash,r.anchor.hash);assert.equal(block.stateRoot,r.anchor.stateRoot);assert.equal(Number(BigInt(block.number)),r.anchor.number);
const inputFiles=[file,'scripts/verify-historical-fork-evidence.mjs'];
const result={at:new Date().toISOString(),sourceCurrent:true,checksPassed:required.length+1,transactionsVerified:18,crossEndpointHeaderMatched:true,crossCheckEndpoint:endpoint,anchor:r.anchor,readOnlyUpstreamVerified:true,
 inputHashes:Object.fromEntries(inputFiles.map(f=>[f,hash(f)])),historicalStateFork:true,archiveCoverageVerified:false,independentSecurityReview:false,publicTransactions:false};
fs.writeFileSync(path.join(root,'evidence/historical-dex-fork-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({verified:true,checksPassed:result.checksPassed,transactions:18,anchor:r.anchor,crossEndpointHeaderMatched:true,remoteWrites:false}));
