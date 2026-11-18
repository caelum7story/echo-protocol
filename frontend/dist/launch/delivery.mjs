import {RULES,integer,economics,normalizeIdentity,projectPhase,validatePosition,quoteSubscription,verifyQuote,exitQuote,deliveryStatus,parseMetadata,stringify} from './core.mjs';
export const NFT_LEDGER_SCHEMA='echo-launch-nft-reservations/v1';
const fail=code=>{throw Error(code);};
const count=(v,zero=true)=>{try{return integer(v,{zero});}catch{return fail('NFT_RANGE_INVALID');}};
export function nftRanges(input,{supply,units=null}={}){
 if(input!==undefined&&input!==null&&(typeof input!=='object'||Array.isArray(input)===false&&(!Object.hasOwn(input,'first')||!Object.hasOwn(input,'last'))))fail('NFT_RANGE_INVALID');
 const values=Array.isArray(input)?input:input&&typeof input==='object'?[input]:[];
 if(values.length>5000)fail('NFT_RANGE_LIMIT');
 const cap=count(supply,false),ranges=values.map(r=>{const first=count(r?.first,false),last=count(r?.last,false);if(first>last||last>cap)fail('NFT_RANGE_INVALID');return {first,last};}).sort((a,b)=>a.first<b.first?-1:a.first>b.first?1:0);
 let total=0n,previous=0n;for(const r of ranges){if(r.first<=previous)fail('NFT_RANGE_OVERLAP');total+=r.last-r.first+1n;previous=r.last;}
 if(units!==null&&total!==count(units))fail('NFT_RANGE_COUNT');
 return {ranges:ranges.map(r=>({first:String(r.first),last:String(r.last)})),units:total};
}
function strictPositions(session){
 if(!session?.positions||typeof session.positions!=='object'||Array.isArray(session.positions))fail('POSITION_LEDGER_INVALID');
 const values=Object.entries(session.positions);if(values.length>5000)fail('POSITION_LEDGER_LIMIT');
 for(const [key,p]of values){let name;try{name=normalizeIdentity(key);}catch{fail('POSITION_IDENTITY_CONFLICT');}if(name!==key||!p||typeof p!=='object'||Array.isArray(p))fail('POSITION_IDENTITY_CONFLICT');}
 return values;
}
export function settlementEvidence(project,position){
 const s=position?.settlement;if(s===undefined||s===null)return null;
 try{
  if(typeof s!=='object'||Array.isArray(s)||!['full-refund','voluntary-full-position-exit'].includes(s.kind))throw Error();
  if(String(position.units)!=='0'||String(position.principalWei)!=='0'||position.delivered)throw Error();
  const full=s.kind==='full-refund';if(full?position.refunded!==true:project.type!=='token'||position.lastExit!==true||position.refunded===true)throw Error();
  const units=integer(s.units),principal=units*economics(project).priceWei;
  if(s.roundingPolicy!==undefined&&s.roundingPolicy!==RULES.roundingPolicy)throw Error();
  const legacy=s.roundingPolicy===undefined;
  const refund=full?principal:legacy?principal*95n/100n:principal-principal*5n/100n,fee=principal-refund;
  if(s.principalWei!==String(principal)||s.refundWei!==String(refund)||s.platformFeeWei!==String(fee)||!Number.isFinite(Date.parse(s.recordedAt)))throw Error();
  if(project.type==='nft'&&(String(position.refundedNftUnits)!==String(units)||position.refundedPrincipalWei!==String(principal)))throw Error();
  return {kind:s.kind,units:String(units),principalWei:String(principal),refundWei:String(refund),platformFeeWei:String(fee),recordedAt:s.recordedAt,roundingPolicy:legacy?'legacy-refund-floor-v1':s.roundingPolicy,legacyRounding:legacy,scope:'browser-local-only',chainVerified:false,transactionHash:null};
 }catch{fail(project.type==='nft'?'NFT_REFUND_EVIDENCE':'POSITION_SETTLEMENT_CONFLICT');}
}
export function reviewSession(project,session,{now=Date.now()}={}){
 const phase=projectPhase(project,session.state,now),e=economics(project,{soldUnits:session.state.soldUnits??0}),positions=strictPositions(session);
 let active=0n,delivered=0n,refunded=0n,rangeCount=0;const booked=[];
 for(const [identity,p]of positions){
  const checked=validatePosition(project,session.state,p,phase);settlementEvidence(project,p);if(p.refunded&&!['failed','pool-failed','cancelled'].includes(phase))fail('POSITION_CONFLICT');active+=checked.units;if(p.delivered)delivered+=checked.units;
  if(project.type!=='nft')continue;
  const own=nftRanges(p.nftRanges,{supply:e.publicUnits,units:checked.units});
  let retired={ranges:[],units:0n};
  if(p.refunded){
   if(!['failed','cancelled'].includes(phase))fail('NFT_REFUND_STATE');
   if(!p.refundedNftRanges||!p.refundedNftUnits)fail('NFT_LEGACY_REFUND_EVIDENCE');
   retired=nftRanges(p.refundedNftRanges,{supply:e.publicUnits,units:p.refundedNftUnits});
   if(retired.units===0n||String(retired.units*e.priceWei)!==p.refundedPrincipalWei)fail('NFT_REFUND_EVIDENCE');
  }else if(p.refundedNftRanges?.length||p.refundedNftUnits&&String(p.refundedNftUnits)!=='0')fail('NFT_REFUND_EVIDENCE');
  refunded+=retired.units;rangeCount+=own.ranges.length+retired.ranges.length;if(rangeCount>5000)fail('NFT_RANGE_LIMIT');
  for(const range of [...own.ranges,...retired.ranges])booked.push({...range,identity,retired:p.refunded===true});
 }
 if(active>e.soldUnits)fail('POSITION_TOTAL_CONFLICT');
 if(project.type!=='nft'){
  if(session.scenario==='actual'&&active!==e.soldUnits)fail('POSITION_TOTAL_CONFLICT');
  return {phase,type:project.type,activeUnits:e.soldUnits,knownActiveUnits:active,deliveredKnownUnits:delivered,backgroundUnits:e.soldUnits-active,executionReady:false};
 }
 const stored=session.nftLedger;
 if(stored!==undefined&&stored?.schema!==NFT_LEDGER_SCHEMA)fail('NFT_LEDGER_SCHEMA');
 const through=stored===undefined?e.soldUnits:count(stored.reservedThrough);
 if(through>e.publicUnits||through!==e.soldUnits+refunded)fail('NFT_LEDGER_TOTAL');
 const ordered=booked.sort((a,b)=>BigInt(a.first)<BigInt(b.first)?-1:BigInt(a.first)>BigInt(b.first)?1:0);
 let last=0n;for(const r of ordered){if(BigInt(r.first)<=last)fail('NFT_RANGE_OVERLAP');if(BigInt(r.last)>through)fail('NFT_LEDGER_RANGE');last=BigInt(r.last);}
 const background=through-active-refunded;if(background<0n||session.scenario==='actual'&&background!==0n)fail('NFT_LEDGER_TOTAL');
 return {schema:'echo-launch-nft-ledger-review/v1',type:'nft',phase,reservedThrough:through,activeUnits:e.soldUnits,
  knownActiveUnits:active,deliveredKnownUnits:delivered,pendingKnownUnits:active-delivered,refundedUnits:refunded,
  backgroundUnits:background,booked:ordered,derivedFromLegacy:stored===undefined,executionReady:false,chainVerified:false};
}
function position(session,identity){return session.positions[identity]??{units:'0',principalWei:'0',delivered:false,refunded:false,nftRanges:[]};}
function setLedger(session,through){session.nftLedger={schema:NFT_LEDGER_SCHEMA,reservedThrough:String(through),scope:'browser-local-demo',executionReady:false};}
function finish(project,next,now){reviewSession(project,next,{now});return next;}
export function samplePosition(project,session,identity,{now=Date.now()}={}){
 const name=normalizeIdentity(identity),review=reviewSession(project,session,{now}),old=position(session,name);
 if(review.phase==='scheduled')fail('NO_SAMPLE_POSITION');
 if(BigInt(old.units)>0n)fail('POSITION_EXISTS');if(old.refunded)fail('SAMPLE_ALREADY_REFUNDED');
 const next=structuredClone(session),e=economics(project,{soldUnits:session.state.soldUnits}),units=project.type==='nft'?1n:1000000n;
 let ranges=[],through=review.reservedThrough,added=0n;
 if(project.type==='nft'){
  let cursor=1n;for(const r of review.booked){if(cursor<BigInt(r.first))break;cursor=BigInt(r.last)+1n;}
  if(cursor>through){if(review.phase!=='raising'||through>=e.publicUnits)fail('NO_SAMPLE_POSITION');through++;added=1n;cursor=through;}
  ranges=[{first:String(cursor),last:String(cursor)}];setLedger(next,through);
 }else if(review.backgroundUnits<units){if(review.phase!=='raising'||e.soldUnits+units-review.backgroundUnits>e.publicUnits)fail('NO_SAMPLE_POSITION');added=units-review.backgroundUnits;}
 next.state.soldUnits=String(e.soldUnits+added);
 if(BigInt(next.state.soldUnits)===e.publicUnits&&added>0n)next.state.closedAt=now;
 next.positions[name]={units:String(units),principalWei:String(units*e.priceWei),delivered:false,refunded:false,nftRanges:ranges};
 return {session:finish(project,next,now),units:String(units),reservedTokenIds:project.type==='nft'?ranges:null};
}
export function subscribePosition(project,session,quote,{projectId,now=Date.now()}={}){
 const review=reviewSession(project,session,{now}),name=normalizeIdentity(quote.identity),old=position(session,name);
 const expected=quoteSubscription(project,session.state,quote.quantity,{identity:name,identityUnits:old.units,projectId,now});
 verifyQuote(quote,expected,{now});if(stringify(quote.reservedTokenIds)!==stringify(expected.reservedTokenIds))fail('NFT_RANGE_CONFLICT');
 const next=structuredClone(session),units=BigInt(expected.quantity);
 next.positions[name]={units:String(BigInt(old.units)+units),principalWei:String(BigInt(old.principalWei)+BigInt(expected.paymentWei)),delivered:false,refunded:false,nftRanges:[...(old.nftRanges??[]),...(expected.reservedTokenIds?[expected.reservedTokenIds]:[])]};
 next.state.soldUnits=String(BigInt(session.state.soldUnits)+units);
 if(project.type==='nft')setLedger(next,review.reservedThrough+units);
 if(BigInt(next.state.soldUnits)===economics(project).publicUnits)next.state.closedAt=now;
 return {session:finish(project,next,now),quote:expected};
}
export function exitPosition(project,session,identity,{now=Date.now()}={}){
 const review=reviewSession(project,session,{now}),name=normalizeIdentity(identity),old=position(session,name),quote=exitQuote(project,session.state,old,{now}),next=structuredClone(session);
 next.state.soldUnits=String(BigInt(session.state.soldUnits)-BigInt(old.units));
 next.positions[name]={units:'0',principalWei:'0',refunded:quote.kind==='full-refund',lastExit:quote.kind!=='full-refund',delivered:false,nftRanges:[],
  settlement:{kind:quote.kind,units:old.units,principalWei:old.principalWei,refundWei:quote.refundWei,platformFeeWei:quote.platformFeeWei,roundingPolicy:quote.roundingPolicy,recordedAt:new Date(now).toISOString()}};
 if(project.type==='nft'){
  setLedger(next,review.reservedThrough);
  Object.assign(next.positions[name],{refundedNftUnits:old.units,refundedPrincipalWei:old.principalWei,refundedNftRanges:structuredClone(old.nftRanges)});
 }
 return {session:finish(project,next,now),quote,reservedTokenIds:project.type==='nft'?old.nftRanges:null};
}
export function deliverPosition(project,session,identity,{now=Date.now()}={}){
 const review=reviewSession(project,session,{now}),name=normalizeIdentity(identity),old=position(session,name),status=deliveryStatus(project,review.phase,old);
 if(!['claimable','pending-distribution'].includes(status))fail('NO_POSITION');
 const next=structuredClone(session);next.positions[name].delivered=true;
 if(project.type==='nft')setLedger(next,review.reservedThrough);
 return {session:finish(project,next,now),units:old.units,reservedTokenIds:project.type==='nft'?old.nftRanges:null};
}
export function positionEvidence(project,session,identity,{projectId,configDigest=null,now=Date.now()}={}){
 const name=normalizeIdentity(identity),review=reviewSession(project,session,{now}),p=position(session,name),ranges=p.refunded?p.refundedNftRanges??[]:p.nftRanges??[];
 const settlement=settlementEvidence(project,p);
 let metadata=null;
 if(project.type==='nft'){
  const normalized=nftRanges(ranges,{supply:project.nftSupply}).ranges;
  let index=0;metadata=parseMetadata(project.metadataText,{supply:integer(project.nftSupply),demo:true}).filter(item=>{const id=BigInt(item.tokenId);while(index<normalized.length&&id>BigInt(normalized[index].last))index++;return index<normalized.length&&id>=BigInt(normalized[index].first);});
 }
 return {schema:'echo-launch-position-evidence/v1',projectId,projectName:project.name,projectType:project.type,
  createdAt:new Date(now).toISOString(),projectConfigDigest:configDigest,identity:name,identityVerification:'format-only; ownership and wallet binding not verified',
  scenario:session.scenario,phase:review.phase,status:p.refunded?'refunded':project.type==='token'&&p.lastExit&&String(p.units)==='0'?'exited':deliveryStatus(project,review.phase,p),lastExit:project.type==='token'&&p.lastExit===true,
  units:p.units,principalWei:p.principalWei,refundedUnits:p.refunded?(settlement?.units??p.refundedNftUnits??null):null,refundedPrincipalWei:p.refunded?(settlement?.principalWei??p.refundedPrincipalWei??null):null,settlement,
  reservedTokenIds:ranges,metadata,ledger:{...review,booked:undefined},chainId:56,transactionHash:null,chainVerified:false,executionReady:false,unsignedTransaction:null,
  warning:'Browser-local demo evidence only, not an NFT ownership certificate, transfer receipt, wallet authorization or proof of minting. No transaction was submitted.'};
}
