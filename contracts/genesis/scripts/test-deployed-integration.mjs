// All writes execute in an in-process Ganache fork. Remote RPC is read-only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {JsonRpcProvider,BrowserProvider,Contract,parseEther,toBeHex} from 'ethers';
import {EchoClient,jsonSafe,launchInterface,identityId} from '../../echo-mint-preview-20261105/dist/chain.mjs';
const deployment=JSON.parse(fs.readFileSync('deployment/verified-deployment.json'));
process.on('unhandledRejection',error=>{console.error(JSON.stringify({status:'failed',error:error.shortMessage||error.message}));process.exit(1);});
const rpc=process.env.ECHO_FORK_RPC||'https://bsc-dataseed.bnbchain.org',remote=new JsonRpcProvider(rpc,56,{staticNetwork:true});
let block,holder,inviter;
try{block=Number(BigInt(await remote.send('eth_blockNumber',[])));const registry=new Contract(deployment.config.identity,['function ownerOfHandle(string)view returns(address)'],remote);[holder,inviter]=await Promise.all(['cchenj','maomaojie'].map(h=>registry.ownerOfHandle(h)));assert.notEqual(holder,'0x0000000000000000000000000000000000000000');assert.notEqual(inviter,'0x0000000000000000000000000000000000000000');assert.notEqual(holder.toLowerCase(),inviter.toLowerCase());}finally{remote.destroy();}
const forkRemote=new JsonRpcProvider(rpc,56,{staticNetwork:true});
const forkProvider={request:async({method,params})=>{
 if(method==='eth_getLogs'){
  const f=params[0],from=Number(BigInt(f.fromBlock));
  // The remote fork has no history after its fixed fork point. Ganache adds
  // its genuinely mined local events; it must not query future remote logs.
  if(from>block)return [];
 }
 return forkRemote.send(method,params);
}};
const g=ganache.provider({logging:{quiet:true},chain:{chainId:56,hardfork:'shanghai'},miner:{timestampIncrement:0},wallet:{deterministic:true,unlockedAccounts:[deployment.config.admin,holder,inviter]},fork:{provider:forkProvider,blockNumber:block,disableCache:true}});
const p=new BrowserProvider(g,undefined,{cacheTimeout:-1});p.pollingInterval=10;
const client=new EchoClient(p),checks=[];
try{
 for(const address of [deployment.config.admin,holder,inviter])await g.request({method:'evm_setAccountBalance',params:[address,toBeHex(parseEther('10'))]});
 await client.verifyDeployment();checks.push('Pinned deployed release, registry, router, pool and token bindings match');
 const closed=await client.quote('cchenj',1,'maomaojie');assert.equal(closed.available,false);assert.equal(closed.reason,'MINT_CLOSED');await assert.rejects(()=>client.prepareMint({name:'cchenj',shares:1,wallet:holder,maxCost:0,gasCap:parseEther('.003')}),/MINT_CLOSED/);checks.push('Closed Mint refuses transaction preparation');
 const admin=await p.getSigner(deployment.config.admin),user=await p.getSigner(holder);
 const launch=client.launch.connect(admin);
 await(await launch.setMintEnabled(true)).wait();
 const prepared=await client.prepareMint({name:'cchenj',shares:1,referrer:'maomaojie',wallet:holder,maxCost:0,gasCap:parseEther('.003'),expectedVersion:1});
 assert.equal(prepared.transaction.value,'0x0');assert.equal(prepared.quote.free,1);assert.equal(prepared.broadcast,false);checks.push('Official identity, referral, free quota and exact zero-value transaction prepare successfully');
 await assert.rejects(()=>client.prepareMint({name:'cchenj',shares:1,wallet:deployment.config.admin,maxCost:0,gasCap:parseEther('.003')}),/WALLET_IDENTITY_MISMATCH/);
 await assert.rejects(()=>client.prepareMint({name:'cchenj',shares:1,wallet:holder,maxCost:0,gasCap:1}),/GAS_CAP_EXCEEDED/);checks.push('Wrong-wallet and insufficient-gas consent are rejected');
 const freeReceipt=await(await user.sendTransaction(prepared.transaction)).wait();const verifiedFree=await client.receipt(freeReceipt.hash);assert.equal(verifiedFree.status,'confirmed');assert.equal(verifiedFree.name,'cchenj.ai');assert.equal(verifiedFree.tokenDelivered,true);assert.equal(verifiedFree.tokens,parseEther('1000').toString());checks.push('Free Mint delivers ECHO in the same transaction and receipt verification confirms both events');
 const refIdentity=await client.identity('maomaojie');assert.equal(refIdentity.invites,1);assert.equal(refIdentity.allowance,11);checks.push('A distinct official first-mint referral adds exactly one paid allowance');
 const paidQuote=await client.quote('cchenj',2,null);assert.equal(paidQuote.referrer.id,identityId('maomaojie'));assert.equal(paidQuote.referrer.locked,true);assert.equal(paidQuote.cost,parseEther('.004'));assert.equal(paidQuote.free,0);checks.push('Subsequent orders retain the original chain referral and use live paid pricing');
 await assert.rejects(()=>client.prepareMint({name:'cchenj',shares:2,wallet:holder,maxCost:parseEther('.003'),gasCap:parseEther('.003')}),/CONSENT_LIMIT_EXCEEDED/);
 const before=await p.getBalance(deployment.config.treasury),preparedPaid=await client.prepareMint({name:'cchenj',shares:2,wallet:holder,maxCost:parseEther('.004'),gasCap:parseEther('.003'),expectedVersion:1});
 const paidReceipt=await(await user.sendTransaction(preparedPaid.transaction)).wait();const after=await p.getBalance(deployment.config.treasury);
 assert.equal(after-before,parseEther('.0012'));assert.equal(await client.launch.pendingLiquidityBnb(),parseEther('.0028'));assert.equal(await client.token.balanceOf(holder),parseEther('3000'));checks.push('Paid Mint immediately routes 30% BNB to treasury, reserves 70%, and delivers the exact tokens');
 const verifiedPaid=await client.receipt(paidReceipt.hash);assert.equal(verifiedPaid.shares,2);assert.equal(verifiedPaid.costWei,parseEther('.004').toString());assert.equal(verifiedPaid.status,'confirmed');
 // Restrict this fork assertion to locally mined blocks. Older mainnet log ranges
 // would be delegated by Ganache to a read-only node which disables eth_getLogs.
 const activityClient=new EchoClient(p,{deployment:{...client.deployment,block:block+1}});
 const activity=await activityClient.activity({name:'cchenj',chunks:1});assert.equal(activity.events.length,2);assert.equal(new Set(activity.events.map(e=>e.hash)).size,2);checks.push('Public identity lookup returns both genuine local-fork Mint transactions');
 const current=await client.launch.pricing();await(await launch.setPricing([...current])).wait();await assert.rejects(()=>client.prepareMint({name:'cchenj',shares:1,wallet:holder,maxCost:parseEther('.002'),gasCap:parseEther('.003'),expectedVersion:1}),/PRICING_VERSION_CHANGED/);checks.push('A changed pricing version invalidates prior payment consent');
 const pending=await client.receipt('0x'+'0'.repeat(64));assert.equal(pending.status,'not-found');checks.push('Unknown transactions never produce a success or delivery claim');
 await(await launch.setMintEnabled(false)).wait();assert.equal((await client.state()).mintEnabled,false);checks.push('Owner can close Mint again after activation');
 const report={status:'passed',scope:'Actual deployed BNB contracts and real official identities on a local Ganache fork only. No mainnet signature or broadcast.',forkBlock:block,chainId:56,mainnetBroadcast:false,checks,freeMint:verifiedFree,paidMint:verifiedPaid};
 fs.writeFileSync('deployment/deployed-integration-test.json',JSON.stringify(jsonSafe(report),null,2)+'\n');console.log(JSON.stringify(jsonSafe(report)));
}catch(error){console.error(JSON.stringify({status:'failed',checksPassed:checks,error:error.shortMessage||error.message,details:error.error||error.info?.error,method:error.payload?.method}));process.exitCode=1;}finally{client.destroy();await g.disconnect();forkRemote.destroy();}
