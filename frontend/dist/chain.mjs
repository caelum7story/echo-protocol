import {Contract,Interface,JsonRpcProvider,FetchRequest,keccak256,toUtf8Bytes,formatEther,zeroPadValue,toBeHex,ZeroAddress} from './vendor/ethers.mjs';
import {DEPLOYMENT,LAUNCH_ABI,TOKEN_ABI,IDENTITY_ABI,ORACLE_ABI} from './deployment.mjs';

export {DEPLOYMENT,formatEther};
export const launchInterface=new Interface(LAUNCH_ABI);
export const normalizeHandle=value=>{
 const handle=String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().toLowerCase().replace(/\.ai$/,'');
 if(!/^[a-z0-9]{1,64}$/.test(handle))throw Error('INVALID_IDENTITY');
 return handle;
};
export const identityId=value=>BigInt(keccak256(toUtf8Bytes(normalizeHandle(value))));
export const jsonSafe=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
export const quantity=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>10)throw Error('INVALID_QUANTITY');return n;};
export const stateAvailable=s=>!!s.mintEnabled&&!s.paused&&!s.retired&&!s.closed&&s.totalMinted<10000;

export class EchoClient {
 constructor(provider,{deployment=DEPLOYMENT,verify=true}={}){this.provider=provider;this.deployment=deployment;this.verify=verify;this.checked=false;this.launch=new Contract(deployment.launch,LAUNCH_ABI,provider);this.token=new Contract(deployment.token,TOKEN_ABI,provider);this.registry=new Contract(deployment.config.identity,IDENTITY_ABI,provider);this.oracle=new Contract(deployment.oracle,ORACLE_ABI,provider);}
 async verifyDeployment(){
  if(this.checked)return;
  const d=this.deployment;
  if(Number(BigInt(await this.provider.send('eth_chainId',[])))!==56)throw Error('WRONG_CHAIN');
  const refs={...d.codeHashes,identity:d.config.identityCodeHash,router:d.reference.routerCodeHash,factory:d.reference.factoryCodeHash,wbnb:d.reference.wbnbCodeHash};
  await Promise.all(Object.entries(refs).map(async([k,hash])=>{const address=d[k]||d.config[k]||d.reference[k];if(keccak256(await this.provider.getCode(address))!==hash)throw Error('CODE_MISMATCH:'+k);}));
  const reads=await Promise.all([this.launch.token(),this.launch.oracle(),this.launch.pair(),this.launch.identity(),this.launch.router(),this.token.controller()]);
  const expected=[d.token,d.oracle,d.pair,d.config.identity,d.config.router,d.launch];
  if(reads.some((a,i)=>a.toLowerCase()!==expected[i].toLowerCase()))throw Error('BINDING_MISMATCH');
  this.checked=true;
 }
 async state(){
  if(this.verify)await this.verifyDeployment();
  const block=Number(BigInt(await this.provider.send('eth_blockNumber',[]))),o={blockTag:block};
  const names=['mintEnabled','paused','retired','closed','opened','totalMinted','totalPaid','freeClaimed','pricingVersion','pricing','pendingLiquidityBnb','successfulInvites'];
  const methods=names.slice(0,-1),values=await Promise.all(methods.map(n=>this.launch[n](o)));
  const s=Object.fromEntries(methods.map((k,i)=>[k,values[i]]));
  const [stamp,openedAt,totalSupply]=await Promise.all([this.provider.getBlock(block),this.token.openedAt(o),this.token.totalSupply(o)]);
  return {block,timestamp:stamp.timestamp,...s,totalMinted:Number(s.totalMinted),totalPaid:Number(s.totalPaid),freeClaimed:Number(s.freeClaimed),pricingVersion:Number(s.pricingVersion),pricing:{preOpenPrice:s.pricing[0],premiumBps:Number(s.pricing[1]),maxDeviationBps:Number(s.pricing[2]),minBnbReserve:s.pricing[3],maxOracleAge:Number(s.pricing[4])},openedAt:Number(openedAt),totalSupply};
 }
 async identity(name,snapshot){
  if(this.verify)await this.verifyDeployment();
  const handle=normalizeHandle(name),id=identityId(handle),o=snapshot?{blockTag:snapshot.block}:{};
  let wallet;try{wallet=await this.registry.ownerOf(id,o);}catch(e){if(e.code==='CALL_EXCEPTION')throw Error('IDENTITY_NOT_FOUND');throw e;}
  const [reverse,minted,invites,firstReferrer]=await Promise.all([this.registry.handleOf(wallet,o),this.launch.mintedById(id,o),this.launch.successfulInvites(id,o),this.launch.firstReferrer(id,o)]);
  if(reverse!==handle||identityId(reverse)!==id)throw Error('IDENTITY_MISMATCH');
  return {handle,name:handle+'.ai',id,wallet,minted:Number(minted),invites:Number(invites),allowance:10+Number(invites),remaining:Math.max(0,10+Number(invites)-Number(minted)),firstReferrer};
 }
 async referrer(who,inbound,snapshot){
  if(who.minted>0)return {id:who.firstReferrer,locked:true,name:who.firstReferrer===0n?null:await this.nameOfId(who.firstReferrer,snapshot)};
  if(!inbound)return {id:0n,locked:false,name:null};
  const ref=await this.identity(inbound,snapshot);
  if(ref.id===who.id||ref.wallet.toLowerCase()===who.wallet.toLowerCase())throw Error('SELF_REFERRAL');
  return {id:ref.id,name:ref.name,locked:false};
 }
 async nameOfId(id,snapshot){if(BigInt(id)===0n)return null;const o=snapshot?{blockTag:snapshot.block}:{};const owner=await this.registry.ownerOf(id,o);const handle=await this.registry.handleOf(owner,o);if(identityId(handle)!==BigInt(id))throw Error('IDENTITY_MISMATCH');return handle+'.ai';}
 async nameOfWallet(wallet){const handle=await this.registry.handleOf(wallet);if(!handle)return null;const owner=await this.registry.ownerOf(identityId(handle));return owner.toLowerCase()===wallet.toLowerCase()?handle+'.ai':null;}
 async quote(name,shares,inbound=null){
  shares=quantity(shares);const state=await this.state(),who=await this.identity(name,state),ref=await this.referrer(who,inbound,state);
  if(!stateAvailable(state))return {state,identity:who,referrer:ref,available:false,reason:state.closed?'SOLD_OUT_OR_RETIRED':'MINT_CLOSED'};
  if(shares>who.remaining)throw Error('IDENTITY_QUOTA_EXCEEDED');
  if(state.totalMinted+shares>10000)throw Error('GLOBAL_QUOTA_EXCEEDED');
  if(!state.opened&&state.totalMinted+shares>5000)throw Error('PHASE_BOUNDARY:'+String(5000-state.totalMinted));
  let q;try{q=await this.launch.quote(who.wallet,who.id,shares,ref.id,{blockTag:state.block});}catch(e){const data=e.data||e.info?.error?.data;let parsed;try{parsed=launchInterface.parseError(typeof data==='string'?data:data?.data);}catch{}if(parsed?.name==='PriceNotReady')throw Error('ORACLE_NOT_READY');throw e;}
  return {state,identity:who,referrer:ref,available:true,shares,cost:q.cost,free:Number(q.free),paid:Number(q.paid),tokens:q.tokens,unitPrice:q.unitPrice,version:Number(q.version),stateHash:q.stateHash};
 }
 async prepareMint({name,shares,referrer=null,wallet,maxCost,gasCap,expectedVersion}){
  const q=await this.quote(name,shares,referrer);if(!q.available)throw Error(q.reason);
  if(!wallet||wallet.toLowerCase()!==q.identity.wallet.toLowerCase())throw Error('WALLET_IDENTITY_MISMATCH');
  if(maxCost===undefined||gasCap===undefined)throw Error('BOUNDED_PAYMENT_AND_GAS_CONSENT_REQUIRED');
  if(expectedVersion!==undefined&&Number(expectedVersion)!==q.version)throw Error('PRICING_VERSION_CHANGED');
  const ceiling=BigInt(maxCost),feeCeiling=BigInt(gasCap);if(ceiling<0n||feeCeiling<=0n||q.cost>ceiling)throw Error('CONSENT_LIMIT_EXCEEDED');
  const deadline=q.state.timestamp+300;
  const data=launchInterface.encodeFunctionData('mint',[{identityId:q.identity.id,shares:q.shares,referrerId:q.referrer.id,quoteHash:q.stateHash,maxCost:ceiling,deadline}]);
  const tx={from:wallet,to:this.deployment.launch,value:'0x'+q.cost.toString(16),data};
  const balance=await this.provider.getBalance(wallet);
  if(balance<q.cost)throw Error('INSUFFICIENT_BNB');
  await this.provider.call(tx);
  const [estimatedGas,price]=await Promise.all([this.provider.estimateGas(tx),this.provider.send('eth_gasPrice',[])]);
  const gas=estimatedGas*120n/100n+10000n,fee=gas*BigInt(price);
  if(fee>feeCeiling)throw Error('GAS_CAP_EXCEEDED');if(balance<q.cost+fee)throw Error('INSUFFICIENT_BNB');
  return {status:'unsigned-mint-transaction',quote:jsonSafe(q),deadline,estimatedGas:estimatedGas.toString(),maximumGasWei:fee.toString(),consent:{wallet,identityId:q.identity.id.toString(),shares:q.shares,referrerId:q.referrer.id.toString(),pricingVersion:q.version,maxCostWei:ceiling.toString(),gasCapWei:feeCeiling.toString(),deadline},transaction:{chainId:'0x38',...tx,gas:'0x'+gas.toString(16),gasPrice:price},broadcast:false};
 }
 async receipt(hash){
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('INVALID_TRANSACTION_HASH');if(this.verify)await this.verifyDeployment();
  const [receipt,tx]=await Promise.all([this.provider.getTransactionReceipt(hash),this.provider.getTransaction(hash)]);
  if(!receipt)return {status:tx?'pending':'not-found',hash};
  if(receipt.status!==1)return {status:'failed',hash,block:receipt.blockNumber};
  if(tx?.to?.toLowerCase()!==this.deployment.launch.toLowerCase())throw Error('WRONG_TRANSACTION_CONTRACT');
  const events=receipt.logs.filter(l=>l.address.toLowerCase()===this.deployment.launch.toLowerCase()).map(l=>{try{return launchInterface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='Minted');
  if(events.length!==1)throw Error('MINT_EVENT_MISSING');
  const a=events[0].args;
  const transferred=receipt.logs.some(l=>{if(l.address.toLowerCase()!==this.deployment.token.toLowerCase())return false;try{const e=this.token.interface.parseLog(l);return e?.name==='Transfer'&&e.args.from.toLowerCase()===this.deployment.launch.toLowerCase()&&e.args.to.toLowerCase()===a.wallet.toLowerCase()&&e.args.value===a.tokens;}catch{return false;}});
  if(!transferred)throw Error('TOKEN_DELIVERY_EVENT_MISSING');
  return {status:'confirmed',hash,block:receipt.blockNumber,wallet:a.wallet,identityId:a.identityId.toString(),referrerId:a.referrerId.toString(),shares:Number(a.shares),freeShares:Number(a.freeShares),costWei:a.cost.toString(),tokens:a.tokens.toString(),confirmations:await receipt.confirmations(),name:await this.nameOfWallet(a.wallet),tokenDelivered:true};
 }
 async activity({name=null,beforeBlock=null,beforeIndex=null,chunks=4}={}){
  if(this.verify)await this.verifyDeployment();
  const latest=Number(BigInt(await this.provider.send('eth_blockNumber',[]))),end=Math.min(beforeBlock??latest,latest),start=this.deployment.block,topic=launchInterface.getEvent('Minted').topicHash;
  const topics=name?[topic,null,zeroPadValue(toBeHex(identityId(name)),32)]:[topic];let cursor=end,logs=[];
  for(let n=0;n<chunks&&cursor>=start;n++){const from=Math.max(start,cursor-4999);const batch=await this.provider.getLogs({address:this.deployment.launch,topics,fromBlock:from,toBlock:cursor});logs.push(...batch.filter(l=>!l.removed));cursor=from-1;if(logs.length>=24)break;}
  logs=logs.filter(l=>beforeIndex===null||l.blockNumber!==end||l.index<beforeIndex);
  logs.sort((a,b)=>b.blockNumber-a.blockNumber||b.index-a.index);
  const rows=await Promise.all(logs.slice(0,40).map(async l=>{const a=launchInterface.parseLog(l).args;return {hash:l.transactionHash,index:l.index,block:l.blockNumber,wallet:a.wallet,name:await this.nameOfWallet(a.wallet),identityId:a.identityId.toString(),referrerId:a.referrerId.toString(),shares:Number(a.shares),freeShares:Number(a.freeShares),costWei:a.cost.toString(),tokens:a.tokens.toString()};}));
  const last=rows.at(-1),nextCursor=logs.length>40?{block:last.block,index:last.index}:cursor>=start?{block:cursor,index:null}:null;
  return {events:rows,fromBlock:Math.max(start,cursor+1),toBlock:end,nextBlock:nextCursor?.block??null,nextCursor,complete:nextCursor===null};
 }
 async prepareMaintenance({gasCap}){
  const s=await this.state();if(!s.opened)throw Error('POOL_NOT_OPEN');
  const started=await this.oracle.started();if(!started)throw Error('ORACLE_NOT_STARTED');
  const sampledAt=Number(await this.oracle.sampledAt());
  if(s.timestamp-sampledAt<300)return {status:'wait',retryAt:sampledAt+300,broadcast:false};
  const data=new Interface(ORACLE_ABI).encodeFunctionData('update',[]);
  return {status:'unsigned-oracle-update',transaction:{chainId:'0x38',to:this.deployment.oracle,value:'0x0',data},gasCapWei:gasCap===undefined?null:String(gasCap),broadcast:false,note:s.timestamp-sampledAt>3600?'Observation expired: this update restarts sampling; wait at least 300 seconds and update again.':'After confirmation, request a fresh Mint quote.'};
 }
 destroy(){this.provider.destroy?.();}
}

export async function connectClient(){
 let error;
 // The log-capable endpoint is preferred; no private API credential is used.
 for(const url of DEPLOYMENT.rpcUrls){const request=new FetchRequest(url);request.timeout=12000;const p=new JsonRpcProvider(request,56,{staticNetwork:true,batchMaxCount:20});const c=new EchoClient(p);try{await c.verifyDeployment();return c;}catch(e){error=e;c.destroy();}}
 throw error||Error('RPC_UNAVAILABLE');
}
