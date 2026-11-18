import fs from 'node:fs';
import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider,getAddress,keccak256} from 'ethers';
import {root} from './compile.mjs';

// Addresses transcribed from the primary pages listed below. WBNB is resolved from the official router.
const source={
 dex:'https://developer.pancakeswap.finance/contracts/v2/addresses',
 identity:'https://docs.space.id/agent-id.md',
 rpc:'https://bsc-dataseed.bnbchain.org'
};
const configured={factory:getAddress('0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'),router:getAddress('0x10ED43C718714eb63d5aA57B78B54704E256024E'),identity:getAddress('0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F')};
const request=new FetchRequest(source.rpc);request.timeout=12000;
const provider=new JsonRpcProvider(request,{chainId:56,name:'bnb'},{staticNetwork:true});
let result;
try{
 const chainId=Number(BigInt(await provider.send('eth_chainId',[])));if(chainId!==56)throw Error('Wrong chain');
 const block=await provider.getBlockNumber();
 const router=new Contract(configured.router,['function factory() view returns(address)','function WETH() view returns(address)'],provider);
 const [factory,wbnb]=await Promise.all([router.factory({blockTag:block}),router.WETH({blockTag:block})]);
 if(getAddress(factory)!==configured.factory)throw Error('Official router factory mismatch');
 const addresses={...configured,wbnb:getAddress(wbnb)};
 const codeEntries=await Promise.all(Object.entries(addresses).map(async([role,address])=>{
  const code=await provider.getCode(address,block);if(code==='0x')throw Error(`${role} has no code`);
  return [role,{address,runtimeBytes:(code.length-2)/2,observedRuntimeHash:keccak256(code)}];
 }));
 const identity=new Contract(configured.identity,['function name() view returns(string)','function symbol() view returns(string)','function supportsInterface(bytes4) view returns(bool)'],provider);
 const [name,symbol,erc721]=await Promise.all([identity.name({blockTag:block}),identity.symbol({blockTag:block}),identity.supportsInterface('0x80ac58cd',{blockTag:block})]);
 if(!erc721)throw Error('Registry not ERC721');
 result={observedAt:new Date().toISOString(),readOnly:true,chainId,block,source,contracts:Object.fromEntries(codeEntries),bindings:{routerFactoryMatched:true,wbnbResolvedFromRouter:true,identity:{name,symbol,erc721}},trustedForDeployment:false,limitations:'Official source addresses and live runtime observed. Runtime hashes are evidence candidates, not independently reviewed approval or an audit. No Launch address selected or transaction signed.'};
}catch(error){result={observedAt:new Date().toISOString(),readOnly:true,source,verified:false,error:error.shortMessage||error.message,trustedForDeployment:false};process.exitCode=1;}
finally{provider.destroy();}
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/public-bindings-bsc56.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
