import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ContractFactory,Interface,ZeroAddress,ZeroHash,concat,getAddress,getBytes,getCreate2Address,id,keccak256} from 'ethers';
const root=path.resolve(import.meta.dirname,'..');
const fail=code=>{throw Error(code);},sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const address=value=>{try{const out=getAddress(value);if(out===ZeroAddress)fail('DEPLOY_ZERO_ADDRESS');return out;}catch{fail('DEPLOY_INVALID_ADDRESS');}};
const bytes32=value=>{if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value)||value.toLowerCase()===ZeroHash)fail('DEPLOY_INVALID_BYTES32');return value.toLowerCase();};
const integer=value=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)fail('DEPLOY_INVALID_INTEGER');return value;};
export function loadDeploymentProxyReference(){
 const folder=path.join(root,'references/deterministic-deployment'),report=JSON.parse(fs.readFileSync(path.join(folder,'public-capture.json'),'utf8'));
 if(report.schema!=='echo-launch-deployment-proxy-observation/v1'||report.chainId!==56||report.observedRuntimeMatches!==true||report.readOnly!==true||report.publicTransactions!==false||report.trustedForDeployment!==false)fail('DEPLOY_PROXY_REFERENCE_SCOPE');
 for(const [name,key]of [['README.md','readmeSha256'],['source.yul','yulSha256'],['LICENSE','licenseSha256']])if(sha256(fs.readFileSync(path.join(folder,name)))!==report.source[key])fail('DEPLOY_PROXY_REFERENCE_CHANGED');
 if(getBytes(report.runtime).length!==69||keccak256(report.runtime)!==report.runtimeHash)fail('DEPLOY_PROXY_CODE_HASH');
 return report;
}
export function create2DeploymentIntent({chainId,reference,salt,initCode,label}){
 integer(chainId);const proxy=address(reference.address);bytes32(reference.runtimeHash);salt=bytes32(salt);
 if(typeof initCode!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(initCode)||getBytes(initCode).length>49152)fail('DEPLOY_INVALID_INIT_CODE');
 if(keccak256(reference.runtime)!==reference.runtimeHash)fail('DEPLOY_PROXY_CODE_HASH');
 const initCodeHash=keccak256(initCode),predictedAddress=getCreate2Address(proxy,salt,initCodeHash);
 return {schema:'echo-launch-unsigned-create2-intent/v1',chainId,label,proxy,proxyRuntimeHash:reference.runtimeHash,salt,initCodeHash,predictedAddress,
  transaction:{to:proxy,value:'0',data:concat([salt,initCode])},unsignedOnly:true,executionReady:false,requiresSeparateWalletPreview:true,requiresUserConfirmation:true};
}
export async function inspectDeploymentIntent(provider,intent,{expectedRuntimeHash}={}){
 if(intent?.schema!=='echo-launch-unsigned-create2-intent/v1'||intent.executionReady!==false||intent.unsignedOnly!==true||intent.requiresSeparateWalletPreview!==true||intent.requiresUserConfirmation!==true||intent.transaction?.value!=='0')fail('DEPLOY_INTENT_SCOPE');
 const chainId=Number(BigInt(await provider.send('eth_chainId',[])));if(chainId!==intent.chainId)fail('DEPLOY_WRONG_CHAIN');
 const bytes=getBytes(intent.transaction.data);if(bytes.length<33||bytes.length>32+49152)fail('DEPLOY_INTENT_DATA');
 const initCode=concat([bytes.subarray(32)]),salt=concat([bytes.subarray(0,32)]);
 if(salt!==intent.salt||keccak256(initCode)!==intent.initCodeHash||address(intent.transaction.to)!==intent.proxy||getCreate2Address(intent.proxy,salt,intent.initCodeHash)!==intent.predictedAddress)fail('DEPLOY_INTENT_CHANGED');
 const block=await provider.getBlock('latest');if(!block)fail('DEPLOY_BLOCK_UNAVAILABLE');
 const proxyCode=await provider.getCode(intent.proxy,block.number);if(proxyCode==='0x'||keccak256(proxyCode)!==intent.proxyRuntimeHash)fail('DEPLOY_PROXY_RUNTIME_CHANGED');
 const code=await provider.getCode(intent.predictedAddress,block.number),creationNonce=await provider.getTransactionCount(intent.predictedAddress,block.number),end=await provider.getBlock(block.number);if(end?.hash!==block.hash)fail('DEPLOY_BLOCK_CHANGED');
 if(!Number.isSafeInteger(creationNonce)||creationNonce<0)fail('DEPLOY_NONCE_UNAVAILABLE');
 const occupied=code!=='0x'||creationNonce!==0;if(expectedRuntimeHash)bytes32(expectedRuntimeHash);
 return {schema:'echo-launch-deployment-inspection/v1',chainId,blockNumber:block.number,blockHash:block.hash,proxyRuntimeVerified:true,predictedAddress:intent.predictedAddress,
  status:!occupied?'not-deployed':code!=='0x'&&expectedRuntimeHash&&keccak256(code)===expectedRuntimeHash?'existing-code-matches':'occupied-unverified',
  creationNonce,observedRuntimeHash:code!=='0x'?keccak256(code):null,readOnly:true,executionReady:false,
  note:'Matching code alone is not full constructor/configuration verification. Check immutable bindings and initialization before reuse;never replay an occupied deployment blindly.'};
}
export async function buildLaunchDeploymentPlan(spec,{reference=loadDeploymentProxyReference()}={}){
 if(spec?.schema!=='echo-launch-deployment-spec/v1')fail('DEPLOY_SPEC_SCHEMA');const chainId=integer(spec.chainId);
 if(![56,97,31337].includes(chainId))fail('DEPLOY_UNSUPPORTED_CHAIN');
 if(typeof spec.namespace!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(spec.namespace))fail('DEPLOY_NAMESPACE');
 const input=spec.environment??{},environment={};for(const key of ['identity','platformAdmin','platformRecipient','dexFactory','router','wbnb'])environment[key]=address(input[key]);
 environment.oracleWindow=integer(input.oracleWindow);environment.oracleMaxAge=integer(input.oracleMaxAge);
 if(environment.oracleMaxAge<environment.oracleWindow||environment.oracleMaxAge>2147483647)fail('DEPLOY_ORACLE_RANGE');
 const versions=[bytes32(spec.templates?.nftVersion),bytes32(spec.templates?.tokenVersion)];if(versions[0]===versions[1])fail('DEPLOY_DUPLICATE_VERSION');
 const reviews=[bytes32(spec.templates?.nftReviewDocumentHash),bytes32(spec.templates?.tokenReviewDocumentHash)];
 const artifacts=Object.fromEntries(['LaunchRegistry','NftLaunchFactory','TokenLaunchFactory'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'))]));
 const artifactHashes=Object.fromEntries(Object.keys(artifacts).map(name=>['artifacts/'+name+'.json',sha256(fs.readFileSync(path.join(root,'artifacts',name+'.json')))]));
 const deployments=[];
 for(const [index,name]of ['LaunchRegistry','NftLaunchFactory','TokenLaunchFactory'].entries()){
  const artifact=artifacts[name],factory=new ContractFactory(artifact.abi,artifact.bytecode),args=index===0?[environment]:[deployments[0].predictedAddress,versions[index-1]];
  const {data}=await factory.getDeployTransaction(...args),salt=id(spec.namespace+':'+chainId+':'+name);
  deployments.push(create2DeploymentIntent({chainId,reference,salt,initCode:data,label:name}));
 }
 const registry=deployments[0].predictedAddress,iface=new Interface(artifacts.LaunchRegistry.abi);
 const registrations=[1,2].map((kind,index)=>({label:kind===1?'Register NFT template':'Register token template',requiresSender:environment.platformAdmin,
  transaction:{to:registry,value:'0',data:iface.encodeFunctionData('registerTemplate',[versions[index],deployments[index+1].predictedAddress,reviews[index]])}}));
 return {schema:'echo-launch-unsigned-deployment-plan/v1',chainId,namespace:spec.namespace,environment,templates:spec.templates,artifactHashes,
  deploymentReference:{source:reference.source,observedChainId:reference.chainId,observedBlock:reference.block,address:reference.address,runtimeHash:reference.runtimeHash},
  deployments,registrations,stepOrder:['Deploy Registry','Deploy NFT factory','Deploy token factory','Register NFT template','Register token template'],
  unsignedOnly:true,executionReady:false,productionReady:false,publicTransactions:false,requiresSeparateWalletPreview:true,
  limitations:['Prediction is not deployment. Recheck chain,proxy code,occupied addresses and immutable fields before each step.','Every transaction still requires wallet simulation,fee display and explicit user approval.','Primary proxy code capture and local tests do not prove Binance backend compatibility or an audit.','Oracle timing,recipients,admin,template review,operational funding and public-chain execution remain separately gated.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file]=process.argv.slice(2);if(!file||process.argv.length!==3)throw Error('Usage: node scripts/prepare-deployment.mjs <explicit-deployment-spec.json>');
 console.log(JSON.stringify(await buildLaunchDeploymentPlan(JSON.parse(fs.readFileSync(file,'utf8'))),null,2));
}
