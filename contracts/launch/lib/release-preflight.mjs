import {Interface,getAddress,keccak256,toQuantity} from 'ethers';
const fail=code=>{throw Error(code);};
const normalize=value=>getAddress(value).toLowerCase();
const routerInterface=new Interface(['function factory() view returns(address)','function WETH() view returns(address)']);
// Only provider read methods are used. There is no signer or submission adapter here.
export async function inspectReleaseNetwork(provider,{configuration,plan,bindings,now=Math.floor(Date.now()/1000)}){
 if(configuration?.configurationConfirmed!==true||configuration.financialAuthorization!==false||configuration.executionReady!==false||plan?.unsignedOnly!==true||plan.executionReady!==false)fail('PREFLIGHT_SCOPE');
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==56||plan.chainId!==56)fail('PREFLIGHT_CHAIN');
 const head=await provider.getBlock('latest');
 if(!head||head.number<configuration.readPolicy.minConfirmations||now-head.timestamp>configuration.readPolicy.maxBlockAgeSeconds||head.timestamp>now+30)fail('PREFLIGHT_STALE_HEAD');
 const number=head.number-configuration.readPolicy.minConfirmations,block=await provider.getBlock(number);
 if(!block?.hash)fail('PREFLIGHT_BLOCK');
 const code=await provider.getCode(plan.deploymentReference.address,number);
 if(code==='0x'||keccak256(code)!==plan.deploymentReference.runtimeHash)fail('PREFLIGHT_HELPER_CODE');
 const observed={};
 for(const [role,key]of [['identity','identity'],['dexFactory','factory'],['router','router'],['wbnb','wbnb']]){
  const address=plan.environment[role],reference=bindings.contracts?.[key];
  if(!reference||normalize(address)!==normalize(reference.address))fail('PREFLIGHT_DEPENDENCY_ADDRESS');
  const runtime=await provider.getCode(address,number);
  if(runtime==='0x'||keccak256(runtime)!==reference.observedRuntimeHash)fail('PREFLIGHT_DEPENDENCY_CODE');
  observed[role]={address,runtimeHash:keccak256(runtime)};
 }
 for(const [method,key]of [['factory','dexFactory'],['WETH','wbnb']]){
  const raw=await provider.send('eth_call',[{to:plan.environment.router,data:routerInterface.encodeFunctionData(method)},toQuantity(number)]);
  if(normalize(routerInterface.decodeFunctionResult(method,raw)[0])!==normalize(plan.environment[key]))fail('PREFLIGHT_ROUTER_BINDING');
 }
 const deployments=[];
 for(const item of plan.deployments){const [runtime,nonce]=await Promise.all([provider.getCode(item.predictedAddress,number),provider.getTransactionCount(item.predictedAddress,number)]);if(runtime!=='0x'||nonce!==0)fail('PREFLIGHT_OCCUPIED_DEPLOYMENT');deployments.push({label:item.label,predictedAddress:item.predictedAddress,codeEmpty:true,nonce:0});}
 const [balance,gasPrice,end]=await Promise.all([provider.getBalance(configuration.roles.gasWallet,number),provider.send('eth_gasPrice',[]),provider.getBlock(number)]);
 if(end?.hash!==block.hash)fail('PREFLIGHT_REORG');
 return {schema:'echo-launch-readonly-release-network/v1',observedAt:new Date(now*1000).toISOString(),chainId:56,head:{number:head.number,hash:head.hash,timestamp:head.timestamp},anchor:{number:block.number,hash:block.hash,timestamp:block.timestamp,depth:head.number-block.number},helperVerified:true,dependencies:observed,deployments,wallet:{address:configuration.roles.gasWallet,balanceWei:String(balance),ownershipVerified:false},gasPriceWei:String(BigInt(gasPrice)),readOnly:true,publicTransactions:false,financialAuthorization:false,executionReady:false,productionReady:false,limitations:'A confirmed-block read snapshot,not a wallet preview,audit,finality guarantee or future transaction authorization. Refresh every actual call;existing deployments require full recovery verification rather than replay.'};
}
