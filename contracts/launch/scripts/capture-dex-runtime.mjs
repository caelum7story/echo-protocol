import fs from 'node:fs';
import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider,getAddress,keccak256} from 'ethers';
import {root} from './compile.mjs';

// Read-only capture. Addresses come exclusively from the independently recorded official bindings.
const observed=JSON.parse(fs.readFileSync(path.join(root,'evidence/public-bindings-bsc56.json'),'utf8'));
if(observed.chainId!==56||observed.bindings?.routerFactoryMatched!==true||observed.bindings?.wbnbResolvedFromRouter!==true)throw Error('Verified binding observation required');
const request=new FetchRequest('https://bsc-dataseed.bnbchain.org');request.timeout=20000;
const provider=new JsonRpcProvider(request,{chainId:56,name:'bnb'},{staticNetwork:true,cacheTimeout:-1});
const directory=path.join(root,'references/pancake-v2');fs.mkdirSync(directory,{recursive:true});
try{
 if(BigInt(await provider.send('eth_chainId',[]))!==56n)throw Error('Wrong chain');
 const block=await provider.getBlock('latest');
 const codes={};
 for(const role of ['factory','router','wbnb']){
  const binding=observed.contracts[role],address=getAddress(binding.address),code=await provider.getCode(address,block.number);
  if(code==='0x'||keccak256(code)!==binding.observedRuntimeHash)throw Error('Runtime changed: '+role);
  codes[role]={address,code,runtimeHash:keccak256(code),runtimeBytes:(code.length-2)/2};
 }
 const router=new Contract(codes.router.address,['function factory() view returns(address)','function WETH() view returns(address)'],provider);
 if(getAddress(await router.factory({blockTag:block.number}))!==codes.factory.address||getAddress(await router.WETH({blockTag:block.number}))!==codes.wbnb.address)throw Error('Router binding mismatch');
 const factory=new Contract(codes.factory.address,['function feeTo() view returns(address)','function feeToSetter() view returns(address)','function allPairsLength() view returns(uint256)','function allPairs(uint256) view returns(address)'],provider);
 const [feeTo,feeToSetter,allPairsLength]=await Promise.all([factory.feeTo({blockTag:block.number}),factory.feeToSetter({blockTag:block.number}),factory.allPairsLength({blockTag:block.number})]);
 const pairAddress=getAddress(await factory.allPairs(0,{blockTag:block.number})),pairCode=await provider.getCode(pairAddress,block.number);
 if(pairCode==='0x')throw Error('Observed pair has no runtime');
 codes.pair={address:pairAddress,code:pairCode,runtimeHash:keccak256(pairCode),runtimeBytes:(pairCode.length-2)/2};
 if((await provider.getBlock(block.number))?.hash!==block.hash)throw Error('Reorg during runtime capture');
 const data={schema:'echo-launch-public-runtime-capture/v1',at:new Date().toISOString(),chainId:56,blockNumber:block.number,blockHash:block.hash,
  source:observed.source.dex,codes,observedFactory:{feeTo,feeToSetter,allPairsLength:String(allPairsLength)},readOnly:true,
  limitations:'Exact deployed runtime bytes captured at one canonical block. An isolated local harness resets storage; it is not a historical-state mainnet fork, deployment approval, verified source compilation or independent audit.'};
 fs.writeFileSync(path.join(directory,'deployed-runtime.json'),JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({captured:true,blockNumber:block.number,roles:Object.fromEntries(Object.entries(codes).map(([role,c])=>[role,{address:c.address,bytes:c.runtimeBytes,hash:c.runtimeHash}])),remoteWrites:false}));
}catch(error){
 fs.writeFileSync(path.join(directory,'runtime-capture-failure.json'),JSON.stringify({at:new Date().toISOString(),error:error.shortMessage||error.message,remoteWrites:false},null,2)+'\n');process.exitCode=1;console.error(error.shortMessage||error.message);
}finally{provider.destroy();}
