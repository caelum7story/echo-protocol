import{verifyMessage}from'ethers';
const fail=c=>{throw Error(c);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export async function acceptDistributionHeartbeat(request,DB,policy,now=Date.now()){
 if(!policy?.enabled||!/^0x[\da-f]{40}$/i.test(policy.wallet??''))fail('DISTRIBUTOR_NOT_CONFIGURED');
 if(Number(request.headers.get('Content-Length')??0)>8192)fail('DISTRIBUTOR_REPORT_LIMIT');
 const reader=request.body?.getReader();if(!reader)fail('DISTRIBUTOR_REPORT_INVALID');let bytes=0,text='';const decoder=new TextDecoder();for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;if(bytes>8192){await reader.cancel();fail('DISTRIBUTOR_REPORT_LIMIT');}text+=decoder.decode(x.value,{stream:true});}text+=decoder.decode();let input;try{input=JSON.parse(text);}catch{fail('DISTRIBUTOR_REPORT_INVALID');}
 const {report:r,signature}=input??{};
 const keys=['schema','chainId','wallet','runtimeDigest','authorityHash','timestampMs','ready','status','cycle','blockNumber','blockHash','balanceWei','dailySpentWei'];
 if(!r||Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.schema!=='echo-launch-distributor-heartbeat/v1'||r.chainId!==56||!same(r.wallet,policy.wallet)||r.runtimeDigest!==policy.runtimeDigest||r.authorityHash!==policy.authorityHash||typeof r.ready!=='boolean'||typeof r.status!=='string'||r.status.length>80||!/^[A-Za-z0-9_-]+$/.test(r.status)||!Number.isSafeInteger(r.timestampMs)||r.timestampMs>now+15000||now-r.timestampMs>60000||!Number.isSafeInteger(r.blockNumber)||r.blockNumber<0||!Number.isSafeInteger(r.cycle)||r.cycle<1||!/^0x[\da-f]{64}$/i.test(r.blockHash)||!/^(0|[1-9]\d*)$/.test(r.balanceWei)||!/^(0|[1-9]\d*)$/.test(r.dailySpentWei)||!/^0x[\da-f]{130}$/i.test(signature??''))fail('DISTRIBUTOR_REPORT_INVALID');
 let sender;try{sender=verifyMessage(JSON.stringify(r),signature);}catch{fail('DISTRIBUTOR_REPORT_SIGNATURE');}if(!same(sender,policy.wallet))fail('DISTRIBUTOR_REPORT_SIGNATURE');
 if(policy.expiresAtMs<=now)fail('DISTRIBUTOR_AUTHORITY_EXPIRED');
 await DB.prepare('INSERT INTO echo_launch_observations (key,chain_id,block_number,block_hash,payload,observed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,payload=excluded.payload,observed_at=excluded.observed_at WHERE echo_launch_observations.observed_at < excluded.observed_at').bind('distribution-service',56,r.blockNumber,r.blockHash,JSON.stringify(r),r.timestampMs).run();
 return {accepted:true,financialExecutionAllowed:false};
}
export async function distributionHealth(DB,policy,now=Date.now()){
 if(!policy?.enabled)return {enabled:false,ready:false,status:'disabled',host:'local-windows',selfClaimAvailable:true};
 const row=await DB.prepare('SELECT payload FROM echo_launch_observations WHERE key=?').bind('distribution-service').first();let report;try{report=JSON.parse(row?.payload??'null');}catch{}
 const fresh=report&&report.wallet?.toLowerCase()===policy.wallet.toLowerCase()&&report.runtimeDigest===policy.runtimeDigest&&report.authorityHash===policy.authorityHash&&report.timestampMs<=now+15000&&now-report.timestampMs<=180000&&policy.expiresAtMs>now;
 return {enabled:true,ready:!!fresh&&report.ready===true,status:policy.expiresAtMs<=now?'authority-expired':fresh?report.status:'heartbeat-stale-or-missing',wallet:policy.wallet,host:'local-windows',requiresHostOnline:true,lastSeenAt:fresh?new Date(report.timestampMs).toISOString():row?.observed_at?new Date(row.observed_at).toISOString():null,balanceWei:fresh?report.balanceWei:null,dailySpentWei:fresh?report.dailySpentWei:null,selfClaimAvailable:true};
}
