import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {AbiCoder,Contract,Interface,ZeroAddress,ZeroHash,concat,getAddress,getCreate2Address,keccak256,toUtf8Bytes} from 'ethers';
let contentLibrary;
async function verifyContentFile(file,{baseURI,metadataRoot,supply}){const library=await(contentLibrary??=import('./nft-content.mjs'));return library.verifyNftCarFile(file,{rootCid:library.contentRootFromBaseURI(baseURI),metadataRoot,supply});}

const coder=AbiCoder.defaultAbiCoder();
const artifacts=Object.fromEntries(['LaunchRegistry','NftLaunch','TokenLaunch','LaunchToken','NftLaunchFactory','TokenLaunchFactory','IV2Pair','IV2Factory','IV2Router','IWBNB'].map(name=>[name,JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),'utf8'))]));
const identityAbi=['function ownerOf(uint256) view returns(address)','function handleOf(address) view returns(string)'];
const hashPattern=/^0x[0-9a-fA-F]{64}$/;
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const fail=code=>{throw new Error(code);};
const uint=value=>{if(typeof value==='number'&&!Number.isSafeInteger(value)||!/^(0|[1-9][0-9]*)$/.test(String(value)))fail('INVALID_INTEGER');const n=BigInt(value);if(n>=1n<<256n)fail('INTEGER_OVERFLOW');return n;};
const hash=value=>{if(!hashPattern.test(value))fail('INVALID_HASH');return value.toLowerCase();};
const addr=value=>{try{return getAddress(value);}catch{fail('INVALID_ADDRESS');}};
const zeroAddress=value=>same(value,ZeroAddress);
export const jsonSafe=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
export function normalizeHandle(input){
 const handle=String(input).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').toLowerCase().replace(/\.ai$/,'');
 if(!/^[a-z0-9]{1,64}$/.test(handle))fail('INVALID_HANDLE');return handle;
}
export const identityIdOf=handle=>BigInt(keccak256(toUtf8Bytes(normalizeHandle(handle))));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function quoteDigest(quote){const copy={...quote};delete copy.quoteHash;return keccak256(toUtf8Bytes(JSON.stringify(canonical(jsonSafe(copy)))));}
const named=async(contract,fields,blockTag)=>Object.fromEntries(await Promise.all(fields.map(async name=>[name,await contract[name]({blockTag})])));

/// No signer, wallet login, signature or broadcast is implemented by this client.
export class LaunchAgentClient {
 #provider;#config;
 constructor({provider,config}){
  if(config?.schema!=='echo-launch-runtime/v1')fail('INVALID_CONFIGURATION');
  const pair=`${config.mode}:${config.chainId}`;
  if(!['production:56','testnet:97','local-test:31337'].includes(pair))fail('INVALID_NETWORK_MODE');
  this.#provider=provider;this.#config=structuredClone(config);
 }
 configStatus(){return {chainId:this.#config.chainId,mode:this.#config.mode,configured:!!this.#config.registry?.address,
  executionReady:this.#config.executionReady===true,readOnly:true,broadcast:false,reason:this.#config.registry?.address?null:'LAUNCH_NOT_DEPLOYED'};}
 async #context(atBlock){
  const c=this.#config;if(!c.registry?.address||!c.registry?.runtimeHash)fail('LAUNCH_NOT_DEPLOYED');
  const chainId=Number(BigInt(await this.#provider.send('eth_chainId',[])));if(chainId!==c.chainId)fail('WRONG_CHAIN');
  let block=await this.#provider.getBlock('latest');if(!block?.hash)fail('BLOCK_UNAVAILABLE');
  if(c.mode!=='local-test'){
   const maxAge=Number(c.maxBlockAgeSeconds??120),age=Math.floor(Date.now()/1000)-block.timestamp;
   if(!Number.isSafeInteger(maxAge)||maxAge<1||maxAge>600)fail('INVALID_FRESHNESS_POLICY');
   if(age>maxAge||age < -30)fail('STALE_BLOCK');
  }
  if(atBlock!==undefined){if(!Number.isSafeInteger(atBlock)||atBlock<0||atBlock>block.number)fail('INVALID_OBSERVATION_BLOCK');block=await this.#provider.getBlock(atBlock);if(!block?.hash)fail('BLOCK_UNAVAILABLE');}
  const registryAddress=addr(c.registry.address),code=await this.#provider.getCode(registryAddress,block.number);
  if(code==='0x'||!same(keccak256(code),hash(c.registry.runtimeHash)))fail('REGISTRY_CODE_MISMATCH');
  return {block,registry:new Contract(registryAddress,artifacts.LaunchRegistry.abi,this.#provider)};
 }
 async #read(project,{wallet,handle}={},atBlock){
  const {block,registry}=await this.#context(atBlock),blockTag=block.number,p=addr(project),record=await registry.projects(p,{blockTag});
  if(zeroAddress(record.factory))fail('UNREGISTERED_PROJECT');
  const template=await registry.templates(record.versionId,{blockTag});
  const approved=this.#config.approvedTemplates?.find(t=>same(t.versionId,record.versionId)&&Number(t.kind)===Number(record.kind));
  if(!approved||!same(approved.creationCodeHash,template.creationCodeHash)||!same(approved.factoryRuntimeHash,template.factoryRuntimeHash)
    ||!same(template.factory,record.factory))fail('UNAPPROVED_TEMPLATE');
  const factoryCode=await this.#provider.getCode(record.factory,blockTag);
  if(factoryCode==='0x'||!same(keccak256(factoryCode),template.factoryRuntimeHash))fail('FACTORY_CODE_MISMATCH');
  const kind=Number(record.kind);if(![1,2].includes(kind))fail('UNSUPPORTED_TEMPLATE_KIND');
  const sale=new Contract(p,artifacts[kind===1?'NftLaunch':'TokenLaunch'].abi,this.#provider);
  const base=await named(sale,['identity','platformAdmin','platformRecipient','creatorRecipient','startsAt','endsAt','unitPrice','capacity','configHash','activeUnits','activePrincipal','soldOutAt','pausedAt','settled','subscriptionsOpen','cancelled','closeTime','refundEligible','totalBnbCredit','MAX_REQUEST_TTL'],blockTag);
  const environment=await named(registry,['identity','platformAdmin','platformRecipient','dexFactory','router','wbnb','environmentUnchanged'],blockTag);
  if(!same(base.configHash,record.configHash)||!same(base.identity,environment.identity)||!same(base.platformAdmin,environment.platformAdmin)
    ||!same(base.platformRecipient,environment.platformRecipient))fail('PROJECT_BINDING_MISMATCH');
  const extra=kind===1?await named(sale,['successEligible','reservedCount','deliveredCount','metadataRoot','contentBaseURI','MAX_BATCH'],blockTag):
    await named(sale,['minimumRaise','poolCreated','liquidityBnb','liquidityTokens','liquidityReceipt','burnedTokens','token','wbnb','IDENTITY_CAP','earlyExitOpen','MAX_BATCH'],blockTag);
  let token=null;
  if(kind===2){
   token=new Contract(extra.token,artifacts.LaunchToken.abi,this.#provider);
   const tokenBindings=await named(token,['sale','pair','router','wbnb','creatorRecipient','platformRecipient','GENESIS_SUPPLY','totalSupply'],blockTag);
   if(!same(tokenBindings.sale,p)||!same(tokenBindings.router,environment.router)||!same(tokenBindings.wbnb,environment.wbnb)
     ||!same(extra.wbnb,environment.wbnb)||!same(tokenBindings.creatorRecipient,base.creatorRecipient)||!same(tokenBindings.platformRecipient,base.platformRecipient))fail('ASSET_BINDING_MISMATCH');
   extra.asset=tokenBindings;
  }
  let who=null;
  if(wallet){
   const w=addr(wallet);who={wallet:w,creditWei:await sale.bnbCredit(w,{blockTag})};
   if(handle!==undefined){
    const normalized=normalizeHandle(handle),id=identityIdOf(normalized),identity=new Contract(base.identity,identityAbi,this.#provider);
    who.handle=normalized;who.identityId=id;
    try{const [owner,reverse]=await Promise.all([identity.ownerOf(id,{blockTag}),identity.handleOf(w,{blockTag})]);who.owner=owner;who.identityVerified=same(owner,w)&&reverse===normalized;}
    catch{who.identityVerified=null;who.identityError='IDENTITY_READ_UNAVAILABLE';}
    if(kind===2){const key=await sale.positionKey(id,w,{blockTag}),pos=await sale.positions(key,{blockTag});who.positionKey=key;who.position={units:pos.units,principalWei:pos.principal,delivered:pos.delivered,revision:pos.revision};who.identityActiveUnits=await sale.identityActiveUnits(id,{blockTag});}
   }
   if(kind===1){who.principalWei=await sale.subscribedPrincipal(w,{blockTag});who.refunded=await sale.refunded(w,{blockTag});}
  }
  let phase;
  if(base.cancelled)phase='cancelled';
  else if(base.refundEligible)phase='refundable';
  else if(kind===2&&extra.poolCreated||kind===1&&base.settled&&extra.successEligible)phase='succeeded';
  else if(kind===1&&extra.successEligible)phase='awaiting-finalize';
  else if(block.timestamp>=Number(base.closeTime))phase='awaiting-liquidity';
  else if(block.timestamp<Number(base.startsAt))phase='scheduled';
  else if(base.pausedAt!==0n)phase='paused';else phase=base.subscriptionsOpen?'open':'closed';
  const heldBnbWei=await this.#provider.getBalance(p,blockTag);
  const finalBlock=await this.#provider.getBlock(blockTag);if(finalBlock?.hash!==block.hash)fail('REORG_DURING_READ');
  const snapshot={schema:'echo-launch-state/v1',chainId:this.#config.chainId,localTestOnly:this.#config.mode==='local-test',blockNumber:blockTag,blockHash:block.hash,blockTimestamp:block.timestamp,
   project:p,kind,phase,versionId:record.versionId,configHash:base.configHash,creator:record.creator,factory:record.factory,
   provenanceVerified:true,reviewDocumentHash:template.reviewDocumentHash,reviewStatus:'document-hash-only-not-an-audit-guarantee',
   templateEnabledForNewCreation:template.enabled,base,extra,who,heldBnbWei,
   environmentUnchanged:environment.environmentUnchanged,executionReady:this.#config.executionReady===true,broadcast:false};
  return {snapshot,sale,token,environment};
 }
 async snapshot(project,options){return jsonSafe((await this.#read(project,options)).snapshot);}
 async historicalSnapshot(project,{blockNumber,wallet,handle}={}){
  if(!Number.isSafeInteger(blockNumber)||blockNumber<0)fail('INVALID_OBSERVATION_BLOCK');
  return {...jsonSafe((await this.#read(project,{wallet,handle},blockNumber)).snapshot),historical:true,quoteAuthority:false,executionReady:false};
 }
 async list({offset=0,limit=50}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_PAGE');
  const {registry,block}=await this.#context();const addresses=await registry.listProjects(offset,limit,{blockTag:block.number});
  return {blockNumber:block.number,projects:Array.from(addresses),nextOffset:addresses.length===limit?offset+limit:null,broadcast:false};
 }
 async #factoryContext(versionId){
  const {block,registry}=await this.#context(),blockTag=block.number,version=hash(versionId),template=await registry.templates(version,{blockTag}),kind=Number(template.kind);
  const approved=this.#config.approvedTemplates?.find(t=>same(t.versionId,version)&&Number(t.kind)===kind);
  if(!approved||zeroAddress(template.factory)||![1,2].includes(kind)||!same(approved.creationCodeHash,template.creationCodeHash)||!same(approved.factoryRuntimeHash,template.factoryRuntimeHash))fail('UNAPPROVED_TEMPLATE');
  const code=await this.#provider.getCode(template.factory,blockTag);if(code==='0x'||!same(keccak256(code),template.factoryRuntimeHash))fail('FACTORY_CODE_MISMATCH');
  const factory=new Contract(template.factory,artifacts[kind===1?'NftLaunchFactory':'TokenLaunchFactory'].abi,this.#provider);
  const binding=await named(factory,['registry','versionId','templateKind','creationCodeHash'],blockTag);
  if(!same(binding.registry,registry.target)||!same(binding.versionId,version)||Number(binding.templateKind)!==kind||!same(binding.creationCodeHash,template.creationCodeHash))fail('FACTORY_BINDING_MISMATCH');
  const environment=await named(registry,['identity','platformAdmin','platformRecipient','dexFactory','router','wbnb','oracleWindow','oracleMaxAge','environmentHash','environmentUnchanged'],blockTag);
  if((await this.#provider.getBlock(blockTag))?.hash!==block.hash)fail('REORG_DURING_READ');
  return {block,registry,template,kind,factory,environment,version};
 }
 async quoteCreate({wallet,handle,versionId,terms,requestId='0x'+randomBytes(32).toString('hex'),deadline,contentCarPath}){
  const f=await this.#factoryContext(versionId),{block,registry,template,kind,factory,environment,version}=f,blockTag=block.number,w=addr(wallet),normalized=normalizeHandle(handle),identityId=identityIdOf(normalized);
  const identity=new Contract(environment.identity,identityAbi,this.#provider),[owner,reverse]=await Promise.all([identity.ownerOf(identityId,{blockTag}),identity.handleOf(w,{blockTag})]);
  if(!same(owner,w)||reverse!==normalized)fail('IDENTITY_NOT_VERIFIED');
  if(!terms||typeof terms.name!=='string'||typeof terms.symbol!=='string')fail('INVALID_CREATION_TERMS');
  const t={name:terms.name,symbol:terms.symbol,startsAt:uint(terms.startsAt),unitPrice:uint(terms.unitPrice),creatorRecipient:addr(terms.creatorRecipient)};
  if(zeroAddress(t.creatorRecipient)||t.unitPrice===0n||t.startsAt>=(1n<<64n)-604800n)fail('INVALID_CREATION_TERMS');
  let capacity,minimumRaise,contentReference=null;
  if(kind===1){
   t.baseURI=String(terms.baseURI??'');t.metadataRoot=hash(terms.metadataRoot);t.supply=uint(terms.supply);capacity=t.supply;
   if(!/^ipfs:\/\/.+\/$/.test(t.baseURI)||t.metadataRoot===ZeroHash||capacity===0n)fail('INVALID_NFT_CONTENT_TERMS');
   if(contentCarPath){const proof=await verifyContentFile(contentCarPath,{baseURI:t.baseURI,metadataRoot:t.metadataRoot,supply:String(t.supply)});contentReference={rootCid:proof.rootCid,metadataRoot:proof.metadataRoot,supply:proof.supply,carSha256:proof.carSha256};}
  }else{capacity=555555555n;t.minimumRaise=uint(terms.minimumRaise);minimumRaise=t.minimumRaise;}
  if(capacity*t.unitPrice>=(1n<<256n)||kind===2&&(minimumRaise===0n||minimumRaise>capacity*t.unitPrice))fail('INVALID_CREATION_TERMS');
  const id=hash(requestId);if(id===ZeroHash)fail('INVALID_REQUEST_ID');
  const key=await factory.requestKey(w,id,{blockTag}),commitment=await factory.configCommitment(w,identityId,id,t,{blockTag}),existing=await factory.projectForRequest(key,{blockTag});
  if(!zeroAddress(existing)){
   if(!same(await factory.commitmentForRequest(key,{blockTag}),commitment))fail('CONFLICTING_CREATION_REQUEST');
   const state=await this.snapshot(existing,{wallet:w,handle:normalized});
   return {schema:'echo-launch-creation-recovery/v1',status:'already-created',project:existing,configHash:commitment,provenanceVerified:state.provenanceVerified,transaction:null,safeToResubmit:false,broadcast:false};
  }
  if(!template.enabled)fail('TEMPLATE_DISABLED');if(!environment.environmentUnchanged)fail('ENVIRONMENT_CHANGED');
  if(t.startsAt<=BigInt(block.timestamp))fail('START_MUST_BE_FUTURE');
  const expires=deadline===undefined?block.timestamp+300:Number(uint(deadline));
  if(!Number.isSafeInteger(expires)||expires<block.timestamp||expires>block.timestamp+300)fail('INVALID_DEADLINE');
  const a=artifacts[kind===1?'NftLaunch':'TokenLaunch'];if(!same(keccak256(a.bytecode),template.creationCodeHash))fail('LOCAL_TEMPLATE_ARTIFACT_MISMATCH');
  const base=[environment.identity,environment.platformAdmin,environment.platformRecipient,t.creatorRecipient,t.startsAt,t.unitPrice,capacity,commitment];
  const args=kind===1?[base,t.name,t.symbol,t.baseURI,t.metadataRoot]:[base,t.minimumRaise,t.name,t.symbol,environment.dexFactory,environment.router,environment.wbnb,environment.oracleWindow,environment.oracleMaxAge];
  const initcode=concat([a.bytecode,new Interface(a.abi).encodeDeploy(args)]),project=getCreate2Address(factory.target,key,keccak256(initcode));
  if(initcode.length/2-1>49152)fail('CREATION_INITCODE_TOO_LARGE');
  if((await this.#provider.getBlock(blockTag))?.hash!==block.hash)fail('REORG_DURING_READ');
  const quote=jsonSafe({schema:'echo-launch-quote/v1',action:'create',chainId:this.#config.chainId,localTestOnly:this.#config.mode==='local-test',executionReady:this.#config.executionReady===true,
   wallet:w,handle:normalized,identityId,project,factory:factory.target,registry:registry.target,kind,versionId:version,requestId:id,requestKey:key,terms:t,configHash:commitment,
   blockNumber:blockTag,blockHash:block.hash,checkedAt:block.timestamp,deadline:expires,paymentWei:'0',units:'0',gasEstimateWei:null,
   contentStatus:kind===1?contentReference?'complete-local-content-package-verified-publication-pending':'provided-not-independently-published-or-verified':'not-applicable',contentReference,
   projection:{capacity,maximumRaiseWei:capacity*t.unitPrice,minimumRaiseWei:minimumRaise??null,belowQuarterWarning:kind===2&&minimumRaise*4n<capacity*t.unitPrice},
   stateHash:keccak256(coder.encode(['bytes32','bool','bool','address'],[commitment,template.enabled,environment.environmentUnchanged,owner])),
   transaction:{chainId:this.#config.chainId,from:w,to:factory.target,value:'0',data:factory.interface.encodeFunctionData('create',[identityId,id,t,expires])},broadcast:false});
  quote.quoteHash=quoteDigest(quote);return quote;
 }
 async recoverCreation({wallet,versionId,requestId}){
  const {factory,block}=await this.#factoryContext(versionId),w=addr(wallet),key=await factory.requestKey(w,hash(requestId),{blockTag:block.number}),project=await factory.projectForRequest(key,{blockTag:block.number});
  const [latest,pending]=await Promise.all([this.#provider.getTransactionCount(w,'latest'),this.#provider.getTransactionCount(w,'pending')]);
  if(!zeroAddress(project))await this.snapshot(project);
  return {status:zeroAddress(project)?pending>latest?'wallet-has-pending-transaction':'creation-not-recorded':'creation-recorded-onchain',project:zeroAddress(project)?null:project,
   requestKey:key,configHash:zeroAddress(project)?null:await factory.commitmentForRequest(key,{blockTag:block.number}),safeToResubmit:false,broadcast:false};
 }
 async quoteDistribution({project,wallet,keys,offset=0,limit=50,deadline}){
  const {snapshot:s,sale}=await this.#read(project,{wallet:addr(wallet)});if(s.kind!==2||s.phase!=='succeeded')fail('DISTRIBUTION_UNAVAILABLE');
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>Number(s.extra.MAX_BATCH))fail('INVALID_PAGE');
  if(keys===undefined){const total=await sale.positionCount({blockTag:s.blockNumber});keys=[];for(let i=offset;i<Math.min(Number(total),offset+limit);i++)keys.push(await sale.positionKeys(i,{blockTag:s.blockNumber}));}
  if(!Array.isArray(keys)||keys.length===0||keys.length>Number(s.extra.MAX_BATCH))fail('INVALID_DISTRIBUTION_KEYS');
  keys=keys.map(hash);if(new Set(keys).size!==keys.length)fail('DUPLICATE_DISTRIBUTION_KEY');
  const items=[];
  for(const key of keys){const p=await sale.positions(key,{blockTag:s.blockNumber});
   if(zeroAddress(p.wallet)||!same(await sale.positionKey(p.identityId,p.wallet,{blockTag:s.blockNumber}),key))fail('UNKNOWN_DISTRIBUTION_KEY');
   if(p.units!==0n&&!p.delivered)items.push({key,wallet:p.wallet,identityId:p.identityId,units:p.units,revision:p.revision,tokenAmount:p.units*10n**18n});
  }
  if(items.length===0)fail('NOTHING_DUE');
  const expires=deadline===undefined?s.blockTimestamp+300:Number(uint(deadline));if(!Number.isSafeInteger(expires)||expires<s.blockTimestamp||expires>s.blockTimestamp+300)fail('INVALID_DEADLINE');
  if((await this.#provider.getBlock(s.blockNumber))?.hash!==s.blockHash)fail('REORG_DURING_READ');
  s.distribution=items;
  return this.#quote(s,'distribute',{units:items.reduce((n,p)=>n+p.units,0n),paymentWei:'0',keys:items.map(p=>p.key),deliveries:items,skippedPositions:keys.length-items.length,
   destinationPolicy:'original-onchain-wallet-only',platformGasFunded:false},sale.interface.encodeFunctionData('distribute',[items.map(p=>p.key)]),null,expires);
 }
 async recoverDistribution({project,keys}){
  const {snapshot:s,sale}=await this.#read(project);if(s.kind!==2||!Array.isArray(keys)||keys.length===0||keys.length>100)fail('INVALID_DISTRIBUTION_KEYS');
  const positions=[];for(const key of keys.map(hash)){const p=await sale.positions(key,{blockTag:s.blockNumber});if(zeroAddress(p.wallet))fail('UNKNOWN_DISTRIBUTION_KEY');
   positions.push(jsonSafe({key,wallet:p.wallet,units:p.units,delivered:p.delivered,status:p.units===0n?'no-active-entitlement':p.delivered?'ledger-delivered-receipt-not-attributed':'awaiting-delivery'}));}
  if((await this.#provider.getBlock(s.blockNumber))?.hash!==s.blockHash)fail('REORG_DURING_READ');
  return {positions,blockNumber:s.blockNumber,receiptAttributionVerified:false,safeToResubmit:false,broadcast:false,next:'Reconcile the actual transaction/nonce, then quote only remaining original-wallet entitlements and obtain fresh gas consent.'};
 }
 #stateHash(s){return keccak256(toUtf8Bytes(JSON.stringify(jsonSafe({configHash:s.configHash,phase:s.phase,activeUnits:s.base.activeUnits,activePrincipal:s.base.activePrincipal,
  pausedAt:s.base.pausedAt,settled:s.base.settled,poolObservation:s.poolObservation??null,distribution:s.distribution??null,contentReference:s.contentReference??null,identityActiveUnits:s.who?.identityActiveUnits??null,position:s.who?.position??null,credit:s.who?.creditWei??null,refunded:s.who?.refunded??null}))));}
 #quote(s,action,details,data,requestId,deadline){
  const quote=jsonSafe({schema:'echo-launch-quote/v1',action,chainId:s.chainId,project:s.project,wallet:s.who.wallet,handle:s.who.handle??null,identityId:s.who.identityId??null,
   kind:s.kind,versionId:s.versionId,configHash:s.configHash,blockNumber:s.blockNumber,blockHash:s.blockHash,checkedAt:s.blockTimestamp,stateHash:this.#stateHash(s),
   requestId,deadline,localTestOnly:s.localTestOnly,executionReady:s.executionReady,paymentWei:'0',gasEstimateWei:null,...details,
   transaction:{chainId:s.chainId,from:s.who.wallet,to:s.project,value:String(details.paymentWei??'0'),data},broadcast:false});
  quote.quoteHash=quoteDigest(quote);return quote;
 }
 async #validateSubscriptionPool(s,token,environment){
  if(s.kind!==2)return null;
  const blockTag=s.blockNumber,router=new Contract(environment.router,artifacts.IV2Router.abi,this.#provider),factory=new Contract(environment.dexFactory,artifacts.IV2Factory.abi,this.#provider);
  const pair=new Contract(s.extra.asset.pair,artifacts.IV2Pair.abi,this.#provider),wbnb=new Contract(environment.wbnb,artifacts.IWBNB.abi,this.#provider);
  const [routerFactory,routerWbnb,registeredPair,pairFactory,t0,t1,reserves,lp,tokenBalance,wbnbBalance]=await Promise.all([
   router.factory({blockTag}),router.WETH({blockTag}),factory.getPair(token.target,environment.wbnb,{blockTag}),pair.factory({blockTag}),pair.token0({blockTag}),pair.token1({blockTag}),
   pair.getReserves({blockTag}),pair.totalSupply({blockTag}),token.balanceOf(pair.target,{blockTag}),wbnb.balanceOf(pair.target,{blockTag})]);
  if(!same(routerFactory,environment.dexFactory)||!same(routerWbnb,environment.wbnb)||!same(registeredPair,pair.target)||!same(pairFactory,environment.dexFactory)
    ||!((same(t0,token.target)&&same(t1,environment.wbnb))||(same(t1,token.target)&&same(t0,environment.wbnb))))fail('DEX_BINDING_MISMATCH');
  const tokenFirst=same(t0,token.target),tokenReserve=tokenFirst?reserves[0]:reserves[1],wbnbReserve=tokenFirst?reserves[1]:reserves[0];
  if(lp!==0n||tokenReserve!==0n||tokenBalance!==0n||wbnbBalance<wbnbReserve||wbnbBalance>=(1n<<112n))fail('POOL_INCOMPATIBLE');
  s.poolObservation={pair:pair.target,externalWbnbWei:wbnbBalance,syncedWbnbReserveWei:wbnbReserve,lpSupply:lp,tokenBalance,
   disclosure:wbnbBalance===0n?null:'External WBNB is not subscription principal and does not change the80/15/5 contribution split. It increases actual pool reserves relative to the nominal contribution ratio; no opening or execution price is guaranteed.'};
  if((await this.#provider.getBlock(blockTag))?.hash!==s.blockHash)fail('REORG_DURING_READ');
  return s.poolObservation;
 }
 async quoteSubscription({project,wallet,handle,units,budgetWei,requestId='0x'+randomBytes(32).toString('hex'),deadline,contentCarPath}){
  const {snapshot:s,sale,token,environment}=await this.#read(project,{wallet,handle});
  if(!s.environmentUnchanged)fail('ENVIRONMENT_CHANGED');if(!s.base.subscriptionsOpen)fail('SUBSCRIPTIONS_CLOSED');if(s.who?.identityVerified!==true)fail('IDENTITY_NOT_VERIFIED');
  const poolObservation=await this.#validateSubscriptionPool(s,token,environment);
  let contentReference=null;if(s.kind===1&&contentCarPath){const proof=await verifyContentFile(contentCarPath,{baseURI:s.extra.contentBaseURI,metadataRoot:s.extra.metadataRoot,supply:String(s.base.capacity)});
   contentReference={rootCid:proof.rootCid,metadataRoot:proof.metadataRoot,supply:proof.supply,carSha256:proof.carSha256};s.contentReference=contentReference;}
  if(units!==undefined&&budgetWei!==undefined)fail('AMBIGUOUS_QUANTITY');
  let count=units===undefined?(s.kind===2&&budgetWei!==undefined?uint(budgetWei)/s.base.unitPrice:fail('QUANTITY_REQUIRED')):uint(units);
  const maxBySupply=s.base.capacity-s.base.activeUnits,maxByIdentity=s.kind===2?s.extra.IDENTITY_CAP-s.who.identityActiveUnits:maxBySupply;
  const max=s.kind===1?(maxBySupply<s.extra.MAX_BATCH?maxBySupply:s.extra.MAX_BATCH):(maxBySupply<maxByIdentity?maxBySupply:maxByIdentity);
  if(count===0n||count>max)fail('QUOTA_EXCEEDED');
  requestId=hash(requestId);if(requestId===ZeroHash)fail('INVALID_REQUEST_ID');
  if(await sale.subscriptionRequests(s.who.wallet,requestId,{blockTag:s.blockNumber})!==ZeroHash)fail('REQUEST_ALREADY_RECORDED');
  const expires=deadline===undefined?s.blockTimestamp+Number(s.base.MAX_REQUEST_TTL):Number(uint(deadline));
  if(!Number.isSafeInteger(expires)||expires<s.blockTimestamp||expires>s.blockTimestamp+Number(s.base.MAX_REQUEST_TTL))fail('INVALID_DEADLINE');
  const payment=count*s.base.unitPrice;
  const data=sale.interface.encodeFunctionData('subscribe',[s.who.identityId,count,requestId,expires]);
  return this.#quote(s,'subscribe',{units:count,paymentWei:payment,freeUnits:'0',paidUnits:count,maximumUnits:max,poolObservation,contentReference,
   unusedBudgetWei:budgetWei===undefined?null:uint(budgetWei)-payment,publicAllocationBps:count*10000n/s.base.capacity},data,requestId,expires);
 }
 async quoteAction({project,wallet,handle,action,ids,deadline}){
  const {snapshot:s,sale}=await this.#read(project,{wallet,handle});if(!s.who)fail('WALLET_REQUIRED');
  const p=s.who.position;let method,args,details={units:p?.units??0n,expectedReturnWei:0n,platformFeeWei:0n};
  const expires=deadline===undefined?s.blockTimestamp+300:Number(uint(deadline));if(expires<s.blockTimestamp||expires>s.blockTimestamp+300)fail('INVALID_DEADLINE');
  if(action==='exit'){
   if(s.kind!==2||!s.extra.earlyExitOpen||!p||p.principalWei===0n)fail('EXIT_UNAVAILABLE');
   method='exitAll';args=[s.who.identityId,p.revision,expires];const fee=p.principalWei*5n/100n;
   details={...details,principalWei:p.principalWei,expectedReturnWei:p.principalWei-fee,platformFeeWei:fee,revision:p.revision,returnStage:'credit-not-yet-withdrawn'};
  }else if(action==='refund'){
   if(!s.base.refundEligible)fail('REFUND_UNAVAILABLE');
   const amount=s.kind===1?s.who.principalWei:p?.principalWei;
   if(!amount||s.kind===1&&s.who.refunded)fail('NOTHING_DUE');
   method='refundFor';args=s.kind===1?[s.who.wallet]:[s.who.identityId,s.who.wallet];details={...details,principalWei:amount,expectedReturnWei:amount,returnStage:'credit-not-yet-withdrawn'};
  }else if(action==='withdraw-credit'){
   if(s.who.creditWei===0n)fail('NOTHING_DUE');method='withdrawCreditFor';args=[s.who.wallet];details.expectedReturnWei=s.who.creditWei;details.returnStage='native-payment';
  }else if(action==='claim'){
   if(s.phase!=='succeeded')fail('DELIVERY_UNAVAILABLE');
   if(s.kind===2){if(!p||p.units===0n||p.delivered)fail('NOTHING_DUE');method='claim';args=[s.who.identityId];details.tokenAmount=p.units*10n**18n;}
   else{if(!Array.isArray(ids)||ids.length===0||ids.length>Number(s.extra.MAX_BATCH))fail('NFT_IDS_REQUIRED');const list=ids.map(uint);if(new Set(list.map(String)).size!==list.length)fail('DUPLICATE_NFT_ID');
    for(const id of list)if(await sale.reservedFor(id,{blockTag:s.blockNumber})!==s.who.wallet)fail('NFT_RESERVATION_MISMATCH');
    method='claimFor';args=[s.who.wallet,list];details={...details,units:BigInt(list.length),ids:list};}
  }else fail('UNSUPPORTED_ACTION');
  return this.#quote(s,action,details,sale.interface.encodeFunctionData(method,args),null,expires);
 }
 async prepare(quote,consent,{contentCarPath}={}){
  if(quote?.schema!=='echo-launch-quote/v1'||!same(quoteDigest(quote),quote.quoteHash))fail('QUOTE_INTEGRITY_FAILED');
  if(this.#config.mode!=='local-test'&&this.#config.executionReady!==true)fail('LAUNCH_NOT_RELEASED');
  if(consent?.userConfirmed!==true||!same(consent.quoteHash,quote.quoteHash)||!same(consent.wallet,quote.wallet)||!same(consent.project,quote.project)
    ||Number(consent.chainId)!==quote.chainId||consent.action!==quote.action||!same(consent.configHash,quote.configHash))fail('CONSENT_REQUIRED');
  const maxPayment=uint(consent.maxPaymentWei),gasCap=uint(consent.gasCapWei),expires=uint(consent.expiresAt);
  if(expires>BigInt(quote.deadline)||gasCap===0n||maxPayment<BigInt(quote.paymentWei))fail('INVALID_CONSENT_LIMITS');
  const request={project:quote.project,wallet:quote.wallet,handle:quote.handle??undefined,deadline:quote.deadline};
  if(['create','subscribe'].includes(quote.action)&&quote.kind===1&&this.#config.mode!=='local-test')fail('NFT_CONTENT_PUBLICATION_NOT_VERIFIED');
  const fresh=quote.action==='create'?await this.quoteCreate({...request,versionId:quote.versionId,terms:quote.terms,requestId:quote.requestId,contentCarPath}):
   quote.action==='distribute'?await this.quoteDistribution({...request,keys:quote.keys}):
   quote.action==='subscribe'?await this.quoteSubscription({...request,units:quote.units,requestId:quote.requestId,contentCarPath}):await this.quoteAction({...request,action:quote.action,ids:quote.ids});
  if(fresh.status==='already-created')fail('CREATION_ALREADY_RECORDED');
  if(BigInt(fresh.checkedAt)>expires||fresh.checkedAt>quote.deadline)fail('CONSENT_EXPIRED');
  if(!same(fresh.stateHash,quote.stateHash)||fresh.transaction.data!==quote.transaction.data||fresh.paymentWei!==quote.paymentWei
    ||!same(fresh.transaction.to,quote.transaction.to)||!same(fresh.transaction.from,quote.transaction.from)
    ||fresh.transaction.chainId!==quote.transaction.chainId||fresh.transaction.value!==quote.transaction.value)fail('STATE_CHANGED');
  const semanticKeys=['action','wallet','project','kind','versionId','identityId','configHash','units','paymentWei','requestId','deadline','factory','requestKey','terms','deliveries','keys','expectedReturnWei','platformFeeWei','principalWei','tokenAmount','ids','destinationPolicy','contentStatus','contentReference','projection'];
  const semantics=q=>JSON.stringify(canonical(Object.fromEntries(semanticKeys.map(k=>[k,q[k]??null]))));
  if(semantics(fresh)!==semantics(quote))fail('QUOTE_DETAILS_CHANGED');
  const [confirmedNonce,pendingNonce]=await Promise.all([this.#provider.getTransactionCount(quote.wallet,'latest'),this.#provider.getTransactionCount(quote.wallet,'pending')]);
  if(pendingNonce!==confirmedNonce)fail('PENDING_WALLET_TRANSACTION');
  const transaction={...fresh.transaction,value:BigInt(fresh.paymentWei)};
  await this.#provider.call(transaction);
  const estimated=await this.#provider.estimateGas(transaction),gasLimit=(estimated*130n+99n)/100n,fees=await this.#provider.getFeeData();
  const perGas=fees.maxFeePerGas??fees.gasPrice;if(!perGas||perGas<=0n)fail('GAS_QUOTE_UNAVAILABLE');
  const maxGas=gasLimit*perGas;if(maxGas>gasCap)fail('GAS_CAP_EXCEEDED');
  const balance=await this.#provider.getBalance(quote.wallet);if(balance<BigInt(quote.paymentWei)+gasCap)fail('INSUFFICIENT_BNB');
  transaction.gasLimit=gasLimit;
  if(fees.maxFeePerGas&&fees.maxPriorityFeePerGas!==null){transaction.maxFeePerGas=fees.maxFeePerGas;transaction.maxPriorityFeePerGas=fees.maxPriorityFeePerGas;}
  else transaction.gasPrice=fees.gasPrice;
  return jsonSafe({schema:'echo-launch-unsigned/v1',status:'unsigned-transaction',quoteHash:quote.quoteHash,action:quote.action,requestId:quote.requestId,
   chainId:quote.chainId,localTestOnly:this.#config.mode==='local-test',executionReady:this.#config.executionReady===true,
   transaction,estimatedGas:estimated,maximumEstimatedGasWei:maxGas,approvedGasCapWei:gasCap,consentExpiresAt:expires,
   broadcast:false,walletPreviewRequired:true,walletConfirmationRequired:true,
   instruction:'Recheck the active wallet and Developer Mode, preview this exact call, show parsedTx/risks/authorityChanges and actual gas, then obtain explicit confirmation. Never treat this JSON or a previous Mint confirmation as permission to execute.'});
 }
 async recover({project,wallet,requestId,quote,transactionHash}){
  if(transactionHash&&!quote)fail('EXPECTED_QUOTE_REQUIRED');
  if(transactionHash&&quote)return this.verifyReceipt({project,transactionHash,quote});
  const {sale,snapshot:s}=await this.#read(project,{wallet});
  const recorded=await sale.subscriptionRequests(addr(wallet),hash(requestId),{blockTag:s.blockNumber});
  const [latest,pending]=await Promise.all([this.#provider.getTransactionCount(wallet,'latest'),this.#provider.getTransactionCount(wallet,'pending')]);
  return {status:recorded!==ZeroHash?'request-recorded-onchain':pending>latest?'wallet-has-pending-transaction':'request-not-recorded',
   requestCommitment:recorded,transactionHash:null,safeToResubmit:false,broadcast:false,next:'Reconcile the real wallet pending transactions and receipt/nonce before requesting any new signature.'};
 }
 async verifyReceipt({project,transactionHash,quote}){
  hash(transactionHash);if(quote?.schema!=='echo-launch-quote/v1'||!same(quoteDigest(quote),quote.quoteHash)||!same(project,quote.project))fail('EXPECTED_QUOTE_REQUIRED');
  if(quote.action==='create')return this.#verifyCreationReceipt(transactionHash,quote);
  const {snapshot:s,sale,token}=await this.#read(project,{wallet:quote.wallet,handle:quote.handle??undefined});
  const [receipt,transaction]=await Promise.all([this.#provider.getTransactionReceipt(transactionHash),this.#provider.getTransaction(transactionHash)]);
  if(!receipt)return {status:transaction?'pending':'not-found',transactionHash,broadcast:false,confirmed:false};
  if(Number(receipt.status)!==1)return {status:'failed',transactionHash,confirmed:false,broadcast:false};
  const receiptBlock=await this.#provider.getBlock(receipt.blockNumber);if(receiptBlock?.hash!==receipt.blockHash)fail('REORGED_RECEIPT');
  const confirmations=s.blockNumber-receipt.blockNumber+1,min=Number(this.#config.minConfirmations??3);
  if(!Number.isInteger(min)||min<1||min>128)fail('INVALID_CONFIRMATION_POLICY');
  if(confirmations<min)return {status:'confirming',transactionHash,confirmations,requiredConfirmations:min,confirmed:false,broadcast:false};
  if(!transaction||!same(transaction.from,quote.wallet)||!same(transaction.to,project)||transaction.value!==BigInt(quote.paymentWei)
    ||transaction.data!==quote.transaction.data||!same(s.configHash,quote.configHash))fail('TRANSACTION_MISMATCH');
  const logs=receipt.logs.filter(l=>same(l.address,project)).map(l=>{try{return sale.interface.parseLog(l);}catch{return null;}}).filter(Boolean);
  const matching=(event,predicate)=>logs.filter(l=>l.name===event&&predicate(l.args));
  const result={status:'confirmed',transactionHash,blockNumber:receipt.blockNumber,confirmations,action:quote.action,confirmed:true,
   subscriptionConfirmed:false,deliveryConfirmed:false,nativePaymentConfirmed:false,creditCreated:false,broadcast:false,
   explorerUrl:s.chainId===56?`https://bscscan.com/tx/${transactionHash}`:s.chainId===97?`https://testnet.bscscan.com/tx/${transactionHash}`:null};
  const units=BigInt(quote.units),wallet=quote.wallet;
  if(quote.action==='subscribe'){
   if(matching('SubscriptionRequestRecorded',a=>same(a.wallet,wallet)&&same(a.requestId,quote.requestId)&&a.identityId===BigInt(quote.identityId)&&a.units===units&&a.principal===BigInt(quote.paymentWei)&&a.deadline===BigInt(quote.deadline)).length!==1)fail('SUBSCRIPTION_EVENT_MISMATCH');
   if(matching('Subscribed',a=>same(a.wallet,wallet)&&a.identityId===BigInt(quote.identityId)&&(s.kind===1?a.count:a.units)===units&&a.principal===BigInt(quote.paymentWei)).length!==1)fail('SUBSCRIPTION_EVENT_MISMATCH');
   result.subscriptionConfirmed=true;result.deliveryStatus='escrow-subscription-not-asset-delivery';
  }else if(quote.action==='distribute'){
   if(s.kind!==2||!Array.isArray(quote.deliveries)||quote.deliveries.length===0)fail('INVALID_DISTRIBUTION_QUOTE');
   const transfers=receipt.logs.filter(l=>same(l.address,token.target)).map(l=>{try{return token.interface.parseLog(l);}catch{return null;}}).filter(Boolean),items=[];
   for(const item of quote.deliveries){
    const events=matching('Delivered',a=>same(a.key,item.key)&&same(a.wallet,item.wallet)&&a.amount===BigInt(item.tokenAmount));
    if(events.length===1){if(transfers.filter(l=>l.name==='Transfer'&&same(l.args.from,project)&&same(l.args.to,item.wallet)&&l.args.value===BigInt(item.tokenAmount)).length!==1)fail('ASSET_TRANSFER_MISMATCH');
     items.push({...item,receiptConfirmed:true,ledgerDelivered:true,attribution:'this-receipt'});
    }else if(events.length===0){const current=await sale.positions(item.key,{blockTag:s.blockNumber});if(!current.delivered||!same(current.wallet,item.wallet))fail('BATCH_DELIVERY_EVENT_MISMATCH');
     items.push({...item,receiptConfirmed:false,ledgerDelivered:true,attribution:'not-proven-by-this-receipt'});
    }else fail('BATCH_DELIVERY_EVENT_MISMATCH');
   }
   result.deliveryItems=jsonSafe(items);result.deliveryConfirmed=items.every(p=>p.receiptConfirmed);result.confirmedDeliveryCount=items.filter(p=>p.receiptConfirmed).length;
   result.deliveryStatus=result.deliveryConfirmed?'all-deliveries-proven-by-this-receipt':'transaction-confirmed-reconcile-concurrent-delivery';
  }else if(quote.action==='claim'){
   if(s.kind===2){
    const key=await sale.positionKey(BigInt(quote.identityId),wallet),amount=units*10n**18n;
    if(matching('Delivered',a=>same(a.key,key)&&same(a.wallet,wallet)&&a.amount===amount).length!==1)fail('DELIVERY_EVENT_MISMATCH');
    const transfers=receipt.logs.filter(l=>same(l.address,token.target)).map(l=>{try{return token.interface.parseLog(l);}catch{return null;}}).filter(Boolean);
    if(transfers.filter(l=>l.name==='Transfer'&&same(l.args.from,project)&&same(l.args.to,wallet)&&l.args.value===amount).length!==1)fail('ASSET_TRANSFER_MISMATCH');
   }else{
    for(const id of quote.ids.map(BigInt))if(matching('Delivered',a=>same(a.wallet,wallet)&&a.tokenId===id).length!==1||matching('Transfer',a=>zeroAddress(a.from)&&same(a.to,wallet)&&a.tokenId===id).length!==1)fail('NFT_DELIVERY_MISMATCH');
   }
   result.deliveryConfirmed=true;
  }else if(quote.action==='withdraw-credit'){
   if(matching('CreditWithdrawn',a=>same(a.recipient,wallet)&&a.amount===BigInt(quote.expectedReturnWei)).length!==1)fail('NATIVE_PAYMENT_EVENT_MISMATCH');
   result.nativePaymentConfirmed=true;result.grossBnbPaidWei=quote.expectedReturnWei;result.gasRefunded=false;
  }else{
   if(matching('CreditAdded',a=>same(a.recipient,wallet)&&a.amount===BigInt(quote.expectedReturnWei)).length!==1)fail('REFUND_CREDIT_EVENT_MISMATCH');
   if(quote.action==='exit'){
    const key=await sale.positionKey(BigInt(quote.identityId),wallet);
    if(matching('Exited',a=>same(a.key,key)&&a.units===units&&a.principal===BigInt(quote.principalWei)&&a.refund===BigInt(quote.expectedReturnWei)&&a.fee===BigInt(quote.platformFeeWei)).length!==1)fail('EXIT_EVENT_MISMATCH');
   }else if(quote.action==='refund'){
    if(matching('Refunded',a=>(s.kind===1?same(a.wallet,wallet):same(a.key,s.who.positionKey))&&a.principal===BigInt(quote.principalWei)).length!==1)fail('REFUND_EVENT_MISMATCH');
   }else fail('UNSUPPORTED_ACTION');
   result.creditCreated=true;result.next='withdraw-credit';result.nativePaymentConfirmed=false;
  }
  return result;
 }
 async #verifyCreationReceipt(transactionHash,quote){
  const {block,registry}=await this.#context(),[receipt,transaction]=await Promise.all([this.#provider.getTransactionReceipt(transactionHash),this.#provider.getTransaction(transactionHash)]);
  if(!receipt)return {status:transaction?'pending':'not-found',transactionHash,confirmed:false,broadcast:false};
  if(Number(receipt.status)!==1)return {status:'failed',transactionHash,confirmed:false,broadcast:false};
  if((await this.#provider.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)fail('REORGED_RECEIPT');
  const confirmations=block.number-receipt.blockNumber+1,min=Number(this.#config.minConfirmations??3);if(!Number.isInteger(min)||min<1||min>128)fail('INVALID_CONFIRMATION_POLICY');
  if(confirmations<min)return {status:'confirming',transactionHash,confirmations,requiredConfirmations:min,confirmed:false,broadcast:false};
  if(!transaction||!same(transaction.from,quote.wallet)||!same(transaction.to,quote.factory)||transaction.value!==0n||transaction.data!==quote.transaction.data||!same(registry.target,quote.registry))fail('TRANSACTION_MISMATCH');
  const {factory}=await this.#factoryContext(quote.versionId),state=await this.snapshot(quote.project);
  if(!same(factory.target,quote.factory)||!same(state.creator,quote.wallet)||!same(state.configHash,quote.configHash)||state.kind!==quote.kind)fail('CREATION_RECORD_MISMATCH');
  const created=receipt.logs.filter(l=>same(l.address,factory.target)).map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='Created');
  const registered=receipt.logs.filter(l=>same(l.address,registry.target)).map(l=>{try{return registry.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='ProjectRegistered');
  if(created.filter(l=>same(l.args.project,quote.project)&&same(l.args.creator,quote.wallet)&&same(l.args.requestKey,quote.requestKey)&&same(l.args.configHash,quote.configHash)).length!==1
   ||registered.filter(l=>same(l.args.project,quote.project)&&same(l.args.creator,quote.wallet)&&same(l.args.versionId,quote.versionId)&&l.args.identityId===BigInt(quote.identityId)&&same(l.args.configHash,quote.configHash)&&Number(l.args.kind)===quote.kind).length!==1)fail('CREATION_EVENT_MISMATCH');
  if(!same(await factory.projectForRequest(quote.requestKey,{blockTag:block.number}),quote.project))fail('CREATION_RECORD_MISMATCH');
  return {status:'confirmed',confirmed:true,creationConfirmed:true,transactionHash,project:quote.project,factory:quote.factory,configHash:quote.configHash,confirmations,blockNumber:receipt.blockNumber,
   saleStatus:state.phase,subscriptionConfirmed:false,deliveryConfirmed:false,broadcast:false,
   explorerUrl:this.#config.chainId===56?`https://bscscan.com/tx/${transactionHash}`:this.#config.chainId===97?`https://testnet.bscscan.com/tx/${transactionHash}`:null};
 }
}

export function bawPreviewArgs(prepared){
 if(prepared?.schema!=='echo-launch-unsigned/v1'||prepared.chainId!==56||prepared.localTestOnly||!prepared.executionReady)fail('NOT_READY_FOR_LIVE_WALLET');
 const t=prepared.transaction;
 if(!/^0x(?:[0-9a-fA-F]{2})*$/.test(t.data))fail('INVALID_CALLDATA');
 return ['contract-call','preview','--binanceChainId','56','--from',addr(t.from),'--to',addr(t.to),'--value',uint(t.value).toString(),'--inputData',t.data,'--json'];
}
