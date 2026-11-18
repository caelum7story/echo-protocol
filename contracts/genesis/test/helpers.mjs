import fs from 'node:fs';import {createHash}from'node:crypto';import solc from 'solc';import ganache from 'ganache';import{network}from'hardhat';import {BrowserProvider,ContractFactory,Contract,keccak256,parseEther}from'ethers';
import{assertBuild}from'../scripts/build-integrity.mjs';assertBuild();
const input={language:'Solidity',sources:{'Mocks.sol':{content:fs.readFileSync('contracts/test/Mocks.sol','utf8').replace(/^\uFEFF/,'')}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const key=createHash('sha256').update(JSON.stringify(input)+solc.version()).digest('hex');let cached;
try{cached=JSON.parse(fs.readFileSync('artifacts/test-mocks.json','utf8'));if(cached.key!==key)cached=null;}catch{}
if(!cached){const output=JSON.parse(solc.compile(JSON.stringify(input),{import(p){try{return{contents:fs.readFileSync('node_modules/'+p,'utf8')}}catch{return{error:p}}}}));const errs=(output.errors||[]).filter(e=>e.severity==='error');if(errs.length)throw Error(errs.map(e=>e.formattedMessage).join('\n'));cached={key,artifacts:Object.fromEntries(Object.entries(output.contracts['Mocks.sol']).map(([n,c])=>[n,{abi:c.abi,bytecode:'0x'+c.evm.bytecode.object}]))};fs.writeFileSync('artifacts/test-mocks.json',JSON.stringify(cached));}
export const mocks=cached.artifacts;
export const artifacts={...Object.fromEntries(['EchoToken','EchoOracle','EchoLaunch'].map(n=>[n,JSON.parse(fs.readFileSync('artifacts/'+n+'.json','utf8'))])),...mocks};
export const E=parseEther;export const mined=async p=>(await p).wait();
export async function fixture(t,{rejectTreasury=false,fork=false}={}){
 let g;let localChain;
 if(!fork&&process.env.ECHO_TEST_ENGINE!=='ganache'){localChain=await network.create('local');g={request:o=>localChain.provider.request(o),disconnect:()=>localChain.close()};}
 else g=ganache.provider({logging:{quiet:true},wallet:{deterministic:true,totalAccounts:12,defaultBalance:1000},chain:{chainId:1337,hardfork:'shanghai',time:new Date('2026-11-11T00:00:00Z')},miner:{timestampIncrement:0,blockGasLimit:100000000},...(fork?{fork:{url:process.env.ECHO_FORK_RPC||'https://bsc-dataseed.bnbchain.org',blockNumber:Number(process.env.ECHO_FORK_BLOCK)||undefined}}:{})});
 const p=new BrowserProvider(g,undefined,{cacheTimeout:-1});p.pollingInterval=5;t.after(async()=>{p.destroy();await g.disconnect();});
 const signers=await Promise.all(Array.from({length:8},(_,i)=>p.getSigner(i)));const [admin,alice,bob,project,rewards,rescue]=signers;const [aa,al,ba,pa,ra,va]=await Promise.all(signers.slice(0,6).map(s=>s.getAddress()));
 async function deploy(n,args=[]){const a=artifacts[n];const c=await new ContractFactory(a.abi,a.bytecode,admin).deploy(...args,{gasLimit:30000000});await c.waitForDeployment();return c;}
 const identity=await deploy('MockIdentity');let router,w,factory;
 if(fork){router=new Contract('0x10ED43C718714eb63d5aA57B78B54704E256024E',artifacts.MockRouter.abi,admin);w=new Contract(await router.WETH(),artifacts.MockWBNB.abi,admin);factory=new Contract(await router.factory(),artifacts.MockFactory.abi,admin);}
 else{w=await deploy('MockWBNB');factory=await deploy('MockFactory');router=await deploy('MockRouter',[factory.target,w.target]);}
 const receiver=await deploy('Receiver');if(rejectTreasury)await mined(receiver.setReject(true));
 const config={admin:aa,treasury:rejectTreasury?receiver.target:pa,rewards:ra,rescueVault:va,identity:identity.target,identityCodeHash:keccak256(await p.getCode(identity.target)),router:router.target};
 const launch=await deploy('EchoLaunch',[config]);const token=new Contract(await launch.token(),artifacts.EchoToken.abi,admin);const pair=new Contract(await launch.pair(),artifacts.MockPair.abi,admin);const oracle=new Contract(await launch.oracle(),artifacts.EchoOracle.abi,admin);
 await mined(launch.setMintEnabled(true));
 const now=async()=>(await p.getBlock('latest')).timestamp;
 const advance=async sec=>{await g.request({method:'evm_increaseTime',params:[sec]});await g.request({method:'evm_mine',params:[]});};
 const issue=async(who=alice,id=1)=>mined(identity.issue(typeof who==='string'?who:await who.getAddress(),id));
 const mint=async(who=alice,id=1,shares=1,referrer=0,opts={})=>{const wallet=await who.getAddress();const q=await launch.quote(wallet,id,shares,referrer);const m={identityId:id,shares,referrerId:referrer,quoteHash:q.stateHash,maxCost:q.cost,deadline:await now()+300,...opts.params};return mined(launch.connect(who).mint(m,{value:q.cost,gasLimit:2000000,...opts.tx}));};
 const setNextTimestamp=async stamp=>{if(localChain)await g.request({method:'evm_setNextBlockTimestamp',params:[stamp]});else await g.request({method:'evm_setTime',params:[stamp*1000]});};
 const fastMint=async(who=alice,id=1,shares=1,referrerId=0)=>{const wallet=typeof who==='string'?who:await who.getAddress();const data=launch.interface.encodeFunctionData('quote',[wallet,id,shares,referrerId]);const raw=await g.request({method:'eth_call',params:[{to:launch.target,data},'latest']});const q=launch.interface.decodeFunctionResult('quote',raw)[0];const b=await g.request({method:'eth_getBlockByNumber',params:['latest',false]});const m={identityId:id,shares,referrerId,quoteHash:q.stateHash,maxCost:q.cost,deadline:Number(BigInt(b.timestamp))+300};const hash=await g.request({method:'eth_sendTransaction',params:[{from:wallet,to:launch.target,data:launch.interface.encodeFunctionData('mint',[m]),value:'0x'+q.cost.toString(16),gas:'0x1e8480',gasPrice:'0x77359400'}]});const r=await g.request({method:'eth_getTransactionReceipt',params:[hash]});if(r.status!=='0x1')throw Error('Local EVM Mint reverted');return r;};
 const open=async()=>{await mined(identity.issueBatch(al,100,10,{gasLimit:1000000}));for(let i=100;i<110;i++)await mint(alice,i,10);await mined(launch.openEarly());await advance(300);await mined(oracle.update());};
 const sell=async(who,amount,to=pa)=>{await mined(token.connect(who).approve(router.target,amount));return mined(router.connect(who).swapExactTokensForETHSupportingFeeOnTransferTokens(amount,1,[token.target,w.target],to,await now()+300));};
 const buy=async(who,value,to)=>mined(router.connect(who).swapExactETHForTokensSupportingFeeOnTransferTokens(1,[w.target,token.target],to,await now()+300,{value}));
 return{g,p,signers,admin,alice,bob,project,rewards,rescue,aa,al,ba,pa,ra,va,deploy,identity,w,factory,router,receiver,config,launch,token,pair,oracle,now,advance,issue,mint,fastMint,setNextTimestamp,open,sell,buy};
}
