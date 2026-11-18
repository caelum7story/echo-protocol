import{assertBuild}from'./build-integrity.mjs';assertBuild();
import fs from 'node:fs';import{Contract,ContractFactory,JsonRpcProvider,getAddress,ZeroAddress,keccak256}from'ethers';
const filename=process.argv[2]||'config/deployment.json';
const c=JSON.parse(fs.readFileSync(filename,'utf8'));const required=['deployer','admin','treasury','rewards','rescueVault'];const missing=required.filter(k=>!c[k]);
if(missing.length){console.log(JSON.stringify({status:'wallet-addresses-required',missing,broadcast:false}));process.exit(2);}
for(const k of required){c[k]=getAddress(c[k]);if(c[k]===ZeroAddress||c[k].toLowerCase()==='0x000000000000000000000000000000000000dead')throw Error('Invalid '+k);}
const ref=JSON.parse(fs.readFileSync('config/bsc-reference.json','utf8'));const artifact=JSON.parse(fs.readFileSync('artifacts/EchoLaunch.json','utf8'));
const p=new JsonRpcProvider(process.env.ECHO_RPC_URL||'https://bsc-dataseed.bnbchain.org',56,{staticNetwork:true});
try{
 if(Number(BigInt(await p.send('eth_chainId',[])))!==56)throw Error('BNB mainnet required');
 for(const [a,h]of[[ref.identity,ref.identityCodeHash],[ref.router,ref.routerCodeHash],[ref.factory,ref.factoryCodeHash],[ref.wbnb,ref.wbnbCodeHash]])if(keccak256(await p.getCode(a))!==h)throw Error('Reference code changed at '+a);
 const router=new Contract(ref.router,['function factory()view returns(address)','function WETH()view returns(address)'],p);if((await router.factory()).toLowerCase()!==ref.factory.toLowerCase()||(await router.WETH()).toLowerCase()!==ref.wbnb.toLowerCase())throw Error('Wrong router bindings');
 const config={admin:c.admin,treasury:c.treasury,rewards:c.rewards,rescueVault:c.rescueVault,identity:ref.identity,identityCodeHash:ref.identityCodeHash,router:ref.router};
 const factory=new ContractFactory(artifact.abi,artifact.bytecode);const tx=await factory.getDeployTransaction(config);const gas=await p.estimateGas({from:c.deployer,data:tx.data});const gasPrice=await p.send('eth_gasPrice',[]);
 const request={chainId:'0x38',from:c.deployer,data:tx.data,value:'0x0',gas:'0x'+(gas*120n/100n).toString(16),gasPrice};
 const abi=artifactsAbi();const constructorArguments=abi.encodeDeploy([config]).slice(2);
 const report={status:'unsigned-needs-wallet-signature',chainId:56,deployer:c.deployer,config,estimatedGas:gas.toString(),maximumDeploymentGasWei:(BigInt(request.gas)*BigInt(gasPrice)).toString(),request,compiler:'v0.8.24+commit.e11b9ed9',license:'MIT',contractName:'contracts/EchoLaunch.sol:EchoLaunch',broadcast:false};
 fs.writeFileSync('deployment/deployment-request.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('deployment/EchoLaunch-constructor-arguments.txt',constructorArguments+'\n');fs.copyFileSync('artifacts/standard-input.json','deployment/standard-input.json');
 console.log(JSON.stringify({status:report.status,estimatedGas:report.estimatedGas,maximumDeploymentGasWei:report.maximumDeploymentGasWei,requestFile:'deployment/deployment-request.json',broadcast:false}));
}finally{p.destroy();}
function artifactsAbi(){return new ContractFactory(artifact.abi,artifact.bytecode).interface;}
