import {BrowserProvider,Contract,Interface,keccak256,getAddress} from 'ethers';
import {LaunchAgentClient} from './agent-client.mjs';
import {artifacts} from './protocol.mjs';
import config from './runtime-config.json' with {type:'json'};
import {chainContext,requestProvider,recheck,logsAt,integer,fail} from './rpc.mjs';
import {acceptDistributionHeartbeat,distributionHealth} from './distribution-health.mjs';
import {readJsonBounded,previewProfile,publishProfile,readProfile} from './profiles.mjs';
import {verifyPayout} from './payout-proof.mjs';
import {verifyLaunchReceipt} from './receipt-proof.mjs';
import {walletRecordsPage} from './wallet-records.mjs';
const address=v=>{try{return getAddress(v);}catch{fail('INVALID_ADDRESS');}};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const stringify=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const pageInt=(v,defaultValue,max)=>{if(v===null)return defaultValue;if(!/^(0|[1-9][0-9]{0,9})$/.test(v))fail('INVALID_PAGE');const n=Number(v);if(n>max)fail('INVALID_PAGE');return n;};
let active=0,windowStart=0,requests=0;
export async function launchApi(request,env,{fetchImpl=fetch,runtime=config,now=Math.floor(Date.now()/1000)}={}){
 const json=(status,data)=>{const body=stringify(data);return new Response(body.length>1048576?'{"error":"API_RESPONSE_LIMIT"}':body,{status:body.length>1048576?503:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});};
 const url=new URL(request.url),route=url.pathname.slice('/launch-api/'.length);
 if(route==='distribution-heartbeat'){
  if(request.method!=='POST'||url.search)return json(405,{error:'SIGNED_HEARTBEAT_POST_ONLY'});
  if(!env.DB)return json(503,{error:'DATABASE_UNAVAILABLE'});
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json(403,{error:'SAME_ORIGIN_REQUIRED'});
  if(active>=2)return json(503,{error:'READ_CAPACITY'});active++;
  try{const rate=await env.DB.prepare('INSERT INTO echo_launch_rate_window (window,count) VALUES (?,1) ON CONFLICT(window) DO UPDATE SET count=count+1 RETURNING count').bind(Math.floor(now/60)).first();if(!rate||rate.count>60)return json(429,{error:'READ_CAPACITY'});return json(200,await acceptDistributionHeartbeat(request,env.DB,runtime.distributor,now*1000));}catch(e){return json(403,{error:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'DISTRIBUTOR_REPORT_INVALID'});}finally{active--;}
 }
 const profileWrite=request.method==='POST'&&['profile','profile-preview'].includes(route);
 if(request.method!=='GET'&&!profileWrite)return json(405,{error:'READ_ONLY_API',financialExecutionAllowed:false});
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json(403,{error:'SAME_ORIGIN_REQUIRED'});
 const allowed={status:[],config:[],projects:['offset','limit'],'wallet-projects':['wallet','mode','offset','limit','handle'],state:['address','wallet','handle'],events:['address','from','blocks'],profile:['address','version'],'profile-preview':[],payout:['address','wallet','hash'],receipt:['address','wallet','hash']}[route];
 if(!allowed)return json(404,{error:'API_ROUTE_NOT_FOUND'});
 if(url.search.length>2048||[...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1))return json(400,{error:'INVALID_PARAMETERS'});
 if(profileWrite&&url.search)return json(400,{error:'PROFILE_BODY_ONLY'});
 if(now-windowStart>=60){windowStart=now;requests=0;}if(++requests>120)return json(429,{error:'READ_CAPACITY'});
 if(active>=2)return json(503,{error:'READ_CAPACITY'});active++;
 let provider;
 try{
  if(!env.DB)fail('DATABASE_UNAVAILABLE');await env.DB.prepare('SELECT key FROM echo_launch_observations LIMIT 1').all();
  const rate=await env.DB.prepare('INSERT INTO echo_launch_rate_window (window,count) VALUES (?,1) ON CONFLICT(window) DO UPDATE SET count=count+1 RETURNING count').bind(Math.floor(now/60)).first();
  if(!rate||rate.count>60)return json(429,{error:'READ_CAPACITY'});
  if(runtime.schema!=='echo-launch-runtime/v1'||runtime.chainId!==56||runtime.mode!=='production'||runtime.minConfirmations!==12||runtime.maxBlockAgeSeconds!==120||runtime.features.nftCreation!==false||runtime.features.nftSubscriptions!==false)fail('RUNTIME_POLICY_INVALID');
  await env.DB.prepare('DELETE FROM echo_launch_rate_window WHERE window IN (SELECT window FROM echo_launch_rate_window WHERE window<? LIMIT 100)').bind(Math.floor(now/60)-60).run();
  const delivery=await distributionHealth(env.DB,runtime.distributor,now*1000);
  if(route==='config')return json(200,{...runtime,automaticDistributionEnabled:delivery.ready,distributionService:delivery,publicApiSchema:'echo-launch-public-config/v1',nftPublicStorageDeferred:true,source:'site-pinned-runtime',financialExecutionAllowed:false,review:{...runtime.review,independentAudit:false}});
  const context=await chainContext({fetchImpl,now});
  const configured=!!runtime.registry?.address&&!!runtime.registry?.runtimeHash;
  let registry,templateVerified=false;
  if(configured){
   provider=new BrowserProvider(requestProvider({fetchImpl}),undefined,{cacheTimeout:-1});
   registry=new Contract(runtime.registry.address,artifacts.LaunchRegistry.abi,provider);
   if(keccak256(await provider.getCode(runtime.registry.address,context.number))!==runtime.registry.runtimeHash)fail('REGISTRY_CODE_MISMATCH');
   const [admin,recipient,environmentOk]=await Promise.all([registry.platformAdmin({blockTag:context.number}),registry.platformRecipient({blockTag:context.number}),registry.environmentUnchanged({blockTag:context.number})]);
   if(!same(admin,runtime.platformAdmin)||!same(recipient,runtime.platformRecipient)||!environmentOk)fail('REGISTRY_ENVIRONMENT_CHANGED');
   for(const pin of runtime.approvedTemplates){const entry=await registry.templates(pin.versionId,{blockTag:context.number});if(!same(entry.factory,pin.factory)||!same(entry.factoryRuntimeHash,pin.factoryRuntimeHash)||!same(entry.creationCodeHash,pin.creationCodeHash)||Number(entry.kind)!==pin.kind||keccak256(await provider.getCode(pin.factory,context.number))!==pin.factoryRuntimeHash)fail('TEMPLATE_BINDING_CHANGED');if(pin.kind===2)templateVerified=entry.enabled;}
  }
  const status={schema:'echo-launch-production-status/v1',chainId:56,databaseConnected:true,apiOnline:true,configured,templateVerified,releasePhase:runtime.releasePhase,context,features:runtime.features,independentAudit:false,automaticDistributionEnabled:delivery.ready,distributionService:delivery,executionReady:runtime.executionReady&&templateVerified,financialExecutionAllowed:false};
  if(route==='status'){
   await recheck(context,{fetchImpl});
   await env.DB.prepare('INSERT INTO echo_launch_observations (key,chain_id,block_number,block_hash,payload,observed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,payload=excluded.payload,observed_at=excluded.observed_at WHERE echo_launch_observations.observed_at<=?').bind('status',56,context.number,context.hash,stringify(status),now,now-30).run();
   return json(200,status);
  }
  if(!configured)return json(503,{error:'LAUNCH_NOT_DEPLOYED',configured:false,chainId:56,context,financialExecutionAllowed:false});
  const client=new LaunchAgentClient({provider,config:{...runtime,executionReady:false}});
  const scope=56+':'+runtime.registry.address.toLowerCase()+':'+runtime.registry.runtimeHash;
  if(profileWrite){
   const body=await readJsonBounded(request),project=address(body.project??body.envelope?.project);
   const snapshot=await client.historicalSnapshot(project,{blockNumber:context.number});
   if(snapshot.kind!==2)fail('TOKEN_PROFILE_ONLY');
   const bindings={runtime,project,creator:snapshot.creator,configHash:snapshot.configHash};
   await recheck(context,{fetchImpl});
   const result=route==='profile-preview'?await previewProfile(env.DB,bindings,body.profile,now):await publishProfile(env.DB,bindings,body,{now,provider,block:context.number});
   return json(200,{schema:'echo-launch-profile-response/v1',context,...result});
  }
  if(route==='profile-preview')return json(405,{error:'PROFILE_PREVIEW_POST_ONLY'});
  if(route==='projects'){
   const offset=pageInt(url.searchParams.get('offset'),0,1000000),limit=pageInt(url.searchParams.get('limit'),5,10);if(limit<1)fail('INVALID_PAGE');
   const [addresses,count]=await Promise.all([registry.listProjects(offset,limit,{blockTag:context.number}),registry.projectCount({blockTag:context.number})]);
   const projects=await Promise.all(Array.from(addresses).map(async(project,i)=>{
    const record=await registry.projects(project,{blockTag:context.number}),template=await registry.templates(record.versionId,{blockTag:context.number});
    const pin=runtime.approvedTemplates.find(p=>same(p.versionId,record.versionId)&&Number(p.kind)===Number(record.kind));
    const trusted=!!pin&&same(pin.creationCodeHash,template.creationCodeHash)&&same(pin.factoryRuntimeHash,template.factoryRuntimeHash)&&same(template.factory,record.factory)&&keccak256(await provider.getCode(record.factory,context.number))===pin.factoryRuntimeHash;
    const row={address:project,ordinal:offset+i,kind:Number(record.kind),creator:record.creator,factory:record.factory,versionId:record.versionId,configHash:record.configHash,createdAt:String(record.createdAt),trustedTemplate:trusted,audited:false};
    if(trusted){
     const sale=new Contract(project,artifacts[row.kind===1?'NftLaunch':'TokenLaunch'].abi,provider);
     const [price,activeUnits,capacity,principal,asset]=await Promise.all([sale.unitPrice({blockTag:context.number}),sale.activeUnits({blockTag:context.number}),sale.capacity({blockTag:context.number}),sale.activePrincipal({blockTag:context.number}),row.kind===1?project:sale.token({blockTag:context.number})]);
     const token=new Contract(asset,artifacts[row.kind===1?'NftLaunch':'LaunchToken'].abi,provider),[name,symbol]=await Promise.all([token.name({blockTag:context.number}),token.symbol({blockTag:context.number})]);
     Object.assign(row,{name,symbol,unitPrice:String(price),activeUnits:String(activeUnits),capacity:String(capacity),activePrincipal:String(principal)});
     const [startsAt,endsAt,open,cancelled,refundable,pausedAt,closeTime,poolCreated]=await Promise.all([sale.startsAt({blockTag:context.number}),sale.endsAt({blockTag:context.number}),sale.subscriptionsOpen({blockTag:context.number}),sale.cancelled({blockTag:context.number}),sale.refundEligible({blockTag:context.number}),sale.pausedAt({blockTag:context.number}),sale.closeTime({blockTag:context.number}),row.kind===2?sale.poolCreated({blockTag:context.number}):false]);
     Object.assign(row,{startsAt:String(startsAt),endsAt:String(endsAt),phase:cancelled?'cancelled':refundable?'refundable':poolCreated?'succeeded':context.timestamp>=Number(closeTime)?'awaiting-liquidity':context.timestamp<Number(startsAt)?'scheduled':pausedAt!==0n?'paused':open?'open':'closed'});
     row.profile=await readProfile(env.DB,{runtime,project,creator:record.creator,configHash:record.configHash},{provider,block:context.number});
    }
    return row;
   }));
   await recheck(context,{fetchImpl});
   if(projects.length)await env.DB.batch(projects.map(p=>env.DB.prepare('INSERT INTO echo_launch_projects (scope,ordinal,address,kind,creator,factory,version_id,config_hash,block_number,block_hash,payload,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope,ordinal) DO UPDATE SET address=excluded.address,kind=excluded.kind,creator=excluded.creator,factory=excluded.factory,version_id=excluded.version_id,config_hash=excluded.config_hash,block_number=excluded.block_number,block_hash=excluded.block_hash,payload=excluded.payload,observed_at=excluded.observed_at').bind(scope,p.ordinal,p.address,p.kind,p.creator,p.factory,p.versionId,p.configHash,context.number,context.hash,stringify(p),now)));
   return json(200,{schema:'echo-launch-production-projects/v1',configured:true,context,projects,registryTotal:String(count),nextOffset:BigInt(offset+projects.length)<count?offset+projects.length:null,financialExecutionAllowed:false});
  }
  if(route==='wallet-projects'){
   const wallet=address(url.searchParams.get('wallet')),mode=url.searchParams.get('mode')??'records';
   const offset=pageInt(url.searchParams.get('offset'),0,1000000),limit=pageInt(url.searchParams.get('limit'),2,3);
   let handle=url.searchParams.get('handle')||undefined,identityLookup='provided';
   if(!handle){try{const identity=new Contract(await registry.identity({blockTag:context.number}),['function handleOf(address) view returns(string)'],provider);handle=await identity.handleOf(wallet,{blockTag:context.number})||undefined;identityLookup=handle?'current-handle':'no-current-handle';}catch{identityLookup='unavailable';}}
   const result=await walletRecordsPage({registry,client,wallet,handle,mode,offset,limit,blockNumber:context.number});
   await recheck(context,{fetchImpl});return json(200,{schema:'echo-launch-wallet-records/v1',context,identityLookup,...result});
  }
  const project=address(url.searchParams.get('address'));
  let resolvedHandle=url.searchParams.get('handle')??undefined;
  if(route==='state'&&url.searchParams.has('wallet')&&!resolvedHandle){try{const identity=new Contract(await registry.identity({blockTag:context.number}),['function handleOf(address) view returns(string)'],provider);resolvedHandle=await identity.handleOf(address(url.searchParams.get('wallet')),{blockTag:context.number})||undefined;}catch{}}
  const snapshot=await client.historicalSnapshot(project,{blockNumber:context.number,wallet:url.searchParams.has('wallet')?address(url.searchParams.get('wallet')):undefined,handle:resolvedHandle});
  if(snapshot.kind===2){const asset=new Contract(snapshot.extra.token,artifacts.LaunchToken.abi,provider);const [name,symbol]=await Promise.all([asset.name({blockTag:context.number}),asset.symbol({blockTag:context.number})]);snapshot.assetInfo={name,symbol};}
  if(snapshot.blockHash!==context.hash)fail('SNAPSHOT_HEADER_MISMATCH');
  if(route==='profile'){
   const version=url.searchParams.has('version')?pageInt(url.searchParams.get('version'),1,1000000):undefined;if(version===0)fail('INVALID_PROFILE_VERSION');
   const bindings={runtime,project,creator:snapshot.creator,configHash:snapshot.configHash};
   const profile=await readProfile(env.DB,bindings,{version,provider,block:context.number});
   const history=await env.DB.prepare('SELECT version,digest,previous_digest,accepted_at FROM echo_launch_project_profiles WHERE scope=? AND project=? ORDER BY version DESC LIMIT 10').bind(scope,project.toLowerCase()).all();
   await recheck(context,{fetchImpl});return json(200,{profile,history:history.results??[],historyPageLimit:10,versionLookupAvailable:true,financialExecutionAllowed:false});
  }
  if(route==='receipt'){
   const proof=await verifyLaunchReceipt({provider,snapshot,wallet:address(url.searchParams.get('wallet')),hash:url.searchParams.get('hash'),context});await recheck(context,{fetchImpl});return json(200,{context,...proof});
  }
  if(route==='payout'){
   const wallet=address(url.searchParams.get('wallet'));const proof=await verifyPayout({provider,project,wallet,hash:url.searchParams.get('hash'),context});await recheck(context,{fetchImpl});return json(200,{context,...proof});
  }
  if(route==='state'){
   snapshot.profile=await readProfile(env.DB,{runtime,project,creator:snapshot.creator,configHash:snapshot.configHash},{provider,block:context.number});
   await recheck(context,{fetchImpl});return json(200,{schema:'echo-launch-production-state/v1',context,state:snapshot,quoteAuthority:false,financialExecutionAllowed:false});
  }
  const start=pageInt(url.searchParams.get('from'),runtime.registry.deploymentBlock,context.number),blocks=pageInt(url.searchParams.get('blocks'),8,16);
  if(!Number.isSafeInteger(start)||start<runtime.registry.deploymentBlock||blocks<1)fail('INVALID_EVENT_RANGE');
  const end=Math.min(context.number,start+blocks-1),logs=await logsAt({address:project,fromBlock:'0x'+start.toString(16),toBlock:'0x'+end.toString(16)},{fetchImpl});
  if(!Array.isArray(logs)||logs.length>500)fail('EVENT_RESPONSE_LIMIT');const iface=new Interface(artifacts[snapshot.kind===1?'NftLaunch':'TokenLaunch'].abi),events=[];
  for(const log of logs){if(log.removed||!same(log.address,project)||integer(log.blockNumber)<start||integer(log.blockNumber)>end)fail('EVENT_PROVENANCE');let parsed;try{parsed=iface.parseLog(log);}catch{continue;}if(parsed)events.push({name:parsed.name,transactionHash:log.transactionHash,blockNumber:integer(log.blockNumber),blockHash:log.blockHash,logIndex:integer(log.logIndex),args:parsed.args.toObject()});}
  const unique=[...new Set(events.map(e=>e.blockNumber))];
  const actual=await Promise.all(unique.map(number=>provider.getBlock(number)));
  if(events.some(e=>actual.find(b=>b?.number===e.blockNumber)?.hash!==e.blockHash))fail('EVENT_HEADER_MISMATCH');await recheck(context,{fetchImpl});
  const payload={schema:'echo-launch-production-events/v1',context,project,fromBlock:start,toBlock:end,nextBlock:end<context.number?end+1:null,historyComplete:false,rangeOnly:true,events,financialExecutionAllowed:false,notice:'A bounded event range is not complete wallet entitlement proof. Agent must verify actual receipts and the on-chain ledger.'};
  await env.DB.prepare('INSERT INTO echo_launch_event_ranges (scope,project,from_block,to_block,anchor_hash,payload,observed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(scope,project,from_block,to_block) DO UPDATE SET anchor_hash=excluded.anchor_hash,payload=excluded.payload,observed_at=excluded.observed_at').bind(scope,project,start,end,context.hash,stringify(payload),now).run();
  await env.DB.prepare('DELETE FROM echo_launch_event_ranges WHERE rowid IN (SELECT rowid FROM echo_launch_event_ranges WHERE observed_at<? LIMIT 100)').bind(now-86400).run();return json(200,payload);
 }catch(error){return json(503,{error:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message??'')?error.message:'READ_UNAVAILABLE',financialExecutionAllowed:false});}
 finally{active--;provider?.destroy();}
}
