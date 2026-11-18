import{assertBuild}from'./build-integrity.mjs';assertBuild();
import fs from'node:fs';import{JsonRpcProvider,Contract,keccak256,Interface,ZeroAddress}from'ethers';
const hash=process.argv[2];if(!/^0x[0-9a-fA-F]{64}$/.test(hash||''))throw Error('Pass the deployment transaction hash');
const req=JSON.parse(fs.readFileSync('deployment/deployment-request.json','utf8'));const artifact=JSON.parse(fs.readFileSync('artifacts/EchoLaunch.json','utf8'));const ref=JSON.parse(fs.readFileSync('config/bsc-reference.json','utf8'));
const p=new JsonRpcProvider(process.env.ECHO_RPC_URL||'https://bsc-dataseed.bnbchain.org',56,{staticNetwork:true});
try{
 const[tx,receipt]=await Promise.all([p.getTransaction(hash),p.getTransactionReceipt(hash)]);if(!tx||!receipt||receipt.status!==1||!receipt.contractAddress||tx.to!==null||tx.data!==req.request.data||tx.from.toLowerCase()!==req.deployer.toLowerCase()||Number(tx.chainId)!==56)throw Error('Deployment receipt/input mismatch');
 const c=new Contract(receipt.contractAddress,artifact.abi,p);
 for(const [method,value]of Object.entries({owner:req.config.admin,treasury:req.config.treasury,rewardVault:req.config.rewards,rescueVault:req.config.rescueVault,identity:req.config.identity,router:req.config.router,identityCodeHash:req.config.identityCodeHash}))if(String(await c[method]()).toLowerCase()!==value.toLowerCase())throw Error('Wrong '+method);
 const tokenAddress=await c.token(),oracleAddress=await c.oracle(),pairAddress=await c.pair();const ta=JSON.parse(fs.readFileSync('artifacts/EchoToken.json'));const token=new Contract(tokenAddress,ta.abi,p);
 if(await token.totalSupply()!==21250000n*10n**18n||await token.balanceOf(req.config.rewards)!==4250000n*10n**18n||await c.totalMinted()!==0n||await c.mintEnabled()||await c.RESCUE_DELAY()!==86400n||await token.openedAt()!==0n)throw Error('Deployment state mismatch');
 if(await token.BUY_TAX_BPS()!==100n||await token.SELL_TAX_BPS()!==200n||await token.OPENING_SELL_TAX_BPS()!==3000n||await token.OPENING_TAX_SECONDS()!==1800n||String(await token.primaryPair()).toLowerCase()!==pairAddress.toLowerCase())throw Error('Tax or pair mismatch');
 if((await token.controller()).toLowerCase()!==receipt.contractAddress.toLowerCase())throw Error('Wrong token controller');
 const bindings={launch:receipt.contractAddress,token:tokenAddress,oracle:oracleAddress,pair:pairAddress};const codeHashes={};for(const[k,a]of Object.entries(bindings)){const code=await p.getCode(a);if(code==='0x')throw Error('Missing '+k);codeHashes[k]=keccak256(code);}
 const pair=new Contract(pairAddress,['function token0()view returns(address)','function token1()view returns(address)','function factory()view returns(address)'],p);const assets=[(await pair.token0()).toLowerCase(),(await pair.token1()).toLowerCase()];if(!assets.includes(tokenAddress.toLowerCase())||!assets.includes(ref.wbnb.toLowerCase())||(await pair.factory()).toLowerCase()!==ref.factory.toLowerCase())throw Error('Wrong pool');
 const activation={chainId:'0x38',from:req.config.admin,to:receipt.contractAddress,value:'0x0',data:new Interface(artifact.abi).encodeFunctionData('setMintEnabled',[true])};
 const oa=JSON.parse(fs.readFileSync('artifacts/EchoOracle.json'));
 fs.writeFileSync('deployment/EchoToken-constructor-arguments.txt',new Interface(ta.abi).encodeDeploy([receipt.contractAddress,req.config.rewards,ref.factory]).slice(2)+'\n');
 fs.writeFileSync('deployment/EchoOracle-constructor-arguments.txt',new Interface(oa.abi).encodeDeploy([pairAddress,tokenAddress,receipt.contractAddress]).slice(2)+'\n');
 fs.writeFileSync('deployment/activation-request.json',JSON.stringify(activation,null,2)+'\n');
 const report={status:'deployment-verified-mint-disabled',chainId:56,hash,block:receipt.blockNumber,...bindings,codeHashes,config:req.config,executionReady:false,nextAction:'Owner reviews and signs setMintEnabled(true), then refresh official website configuration',activation};fs.writeFileSync('deployment/verified-deployment.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{p.destroy();}
