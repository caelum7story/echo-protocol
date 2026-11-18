import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {EchoClient,launchInterface} from '../dist/chain.mjs';
const wallet='0x0282F738816d39bB07EAD0d5ea626Ff1b1FC1761',cost=6000000000000000n;
function setup(balance){
 const calls=[];
 const provider={getBalance:async()=>balance,call:async tx=>{calls.push(tx);return '0x';},estimateGas:async()=>100000n,send:async()=> '0x3b9aca00'};
 const client=new EchoClient(provider,{verify:false});
 client.quote=async()=>({available:true,shares:3,identity:{wallet,id:1n},referrer:{id:0n},state:{timestamp:1000},stateHash:'0x'+'a'.repeat(64),version:1,cost,free:0,paid:3,tokens:3000n*10n**18n});
 return {client,calls};
}
const args={name:'test.ai',shares:3,wallet,maxCost:cost,gasCap:1000000000000000n,expectedVersion:1};
test('insufficient Mint value is explained before calling a provider that would return an opaque OutOfFunds error',async()=>{
 const {client,calls}=setup(126594756112867n);
 await assert.rejects(()=>client.prepareMint(args),/INSUFFICIENT_BNB/);assert.equal(calls.length,0);
});
test('funded paid preparation simulates the exact value and returns only a bounded unsigned transaction',async()=>{
 const {client,calls}=setup(100000000000000000n),prepared=await client.prepareMint(args);
 assert.equal(prepared.broadcast,false);assert.equal(prepared.status,'unsigned-mint-transaction');assert.equal(calls.length,1);
 assert.equal(BigInt(prepared.transaction.value),cost);assert.equal(prepared.maximumGasWei,'130000000000000');
 assert.equal(launchInterface.decodeFunctionData('mint',prepared.transaction.data)[0].shares,3n);
 await assert.rejects(()=>client.prepareMint({...args,gasCap:1n}),/GAS_CAP_EXCEEDED/);
});
test('the downloadable Agent archive matches the official advertised checksum',()=>{
 const agent=JSON.parse(fs.readFileSync(new URL('../dist/agent.json',import.meta.url)));
 const actual=createHash('sha256').update(fs.readFileSync(new URL('../dist/agent/echo-agent.zip',import.meta.url))).digest('hex');
 assert.equal(actual,agent.cliArchiveSha256);
});
