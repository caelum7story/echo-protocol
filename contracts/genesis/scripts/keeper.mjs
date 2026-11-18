import fs from'node:fs';import{JsonRpcProvider,Contract,Wallet,MaxUint256,keccak256}from'ethers';
const file=process.argv.find(a=>a.endsWith('.json'))||'deployment/verified-deployment.json';const d=JSON.parse(fs.readFileSync(file,'utf8'));const execute=process.argv.includes('--broadcast');
if(execute&&!process.env.ECHO_KEEPER_PRIVATE_KEY)throw Error('An independently funded keeper key in ECHO_KEEPER_PRIVATE_KEY is required for --broadcast. Never use a web page or chat to provide it.');
const p=new JsonRpcProvider(process.env.ECHO_RPC_URL||'https://bsc-dataseed.bnbchain.org',56,{staticNetwork:true});
const signer=execute?new Wallet(process.env.ECHO_KEEPER_PRIVATE_KEY,p):p;
const launch=new Contract(d.launch,JSON.parse(fs.readFileSync('artifacts/EchoLaunch.json')).abi,signer);const oracle=new Contract(d.oracle,JSON.parse(fs.readFileSync('artifacts/EchoOracle.json')).abi,signer);
try{
 if(Number(BigInt(await p.send('eth_chainId',[])))!==56||keccak256(await p.getCode(d.launch))!==d.codeHashes.launch||keccak256(await p.getCode(d.oracle))!==d.codeHashes.oracle)throw Error('Wrong deployment');
 if(!await launch.opened()||await launch.paused()||await launch.retired()){console.log(JSON.stringify({status:'inactive',broadcast:false}));process.exitCode=0;}
 else{
  const actions=[];const changed=await oracle.update.staticCall();if(changed){const tx=await oracle.update.populateTransaction();actions.push({action:'updateOracle',to:tx.to,data:tx.data});if(execute)await(await oracle.update()).wait();}
  try{const[amount,minimum]=await launch.taxQuote(MaxUint256);if(amount>0n){const now=(await p.getBlock('latest')).timestamp;const tx=await launch.processTaxes.populateTransaction(MaxUint256,minimum,now+120);actions.push({action:'processTaxes',to:tx.to,data:tx.data,value:'0x0'});if(execute){await launch.processTaxes.staticCall(MaxUint256,minimum,now+120);const gas=await launch.processTaxes.estimateGas(MaxUint256,minimum,now+120);await(await launch.processTaxes(MaxUint256,minimum,now+120,{gasLimit:gas*130n/100n+50000n})).wait();}}}catch(e){actions.push({action:'waitForHealthyOracle',reason:e.shortMessage||e.message});}
  console.log(JSON.stringify({broadcast:execute,actions}));
 }
}finally{p.destroy();}
