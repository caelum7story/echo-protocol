import {Interface} from 'ethers';
import {DEPLOYMENT,LAUNCH_ABI} from '../public/deployment.mjs';
const iface=new Interface(LAUNCH_ABI),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export const fail=code=>{throw Error(code);};
export function validAddress(a){return /^0x[\da-f]{40}$/i.test(a??'')&&!/^0x0{40}$/i.test(a);}
export function officialQr(v,now){let u;try{u=new URL(v.urlForWeb);}catch{fail('INVALID_OFFICIAL_QR');}if(u.protocol!=='https:'||u.username||u.password||u.port||!((u.hostname==='web3.binance.com'&&/^\/(?:en\/)?agent-login\/?$/.test(u.pathname))||(u.hostname==='app.binance.com'&&/^\/uni-qr\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)))||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=now||v.expiresAt>now+600000||!/^[a-zA-Z0-9]{4,16}$/.test(v.pairingCode??''))fail('INVALID_OFFICIAL_QR');return {urlForWeb:v.urlForWeb,pairingCode:v.pairingCode,expiresAt:v.expiresAt};}
export function validatePrepared(p,wallet,now){
 const tx=p?.transaction,q=p?.quote;let m;try{m=iface.decodeFunctionData('mint',tx.data)[0];}catch{fail('INVALID_MINT_TRANSACTION');}
 if(!validAddress(wallet)||!same(tx.from,wallet)||!same(tx.to,DEPLOYMENT.launch)||BigInt(tx.chainId)!==56n||Object.keys(tx).some(k=>!['from','to','chainId','value','data','gas','gasPrice'].includes(k)))fail('INVALID_MINT_TRANSACTION');
 if(!q||!same(q.identity?.wallet,wallet)||!Number.isInteger(q.shares)||q.shares<1||q.shares>10||m.shares!==BigInt(q.shares)||m.identityId!==BigInt(q.identity.id)||m.referrerId!==BigInt(q.referrer.id)||m.maxCost!==BigInt(tx.value)||BigInt(q.cost)!==BigInt(tx.value)||m.deadline!==BigInt(p.deadline)||m.deadline*1000n<=BigInt(now))fail('INVALID_MINT_TRANSACTION');
 if(!Number.isSafeInteger(q.state?.timestamp)||q.state.timestamp*1000>now+15000||now-q.state.timestamp*1000>120000||BigInt(tx.gas)<=0n||BigInt(tx.gasPrice)<=0n||BigInt(p.maximumGasWei)!==BigInt(tx.gas)*BigInt(tx.gasPrice))fail('STALE_OR_INVALID_MINT_REVIEW');
 const a=p.official;
 if(!a||a.simulationResult?.simulationCode!=='000000000'||!Number.isSafeInteger(a.expiresAt)||a.expiresAt<=now||(a.simulationResult.authorityChanges??[]).length||(a.simulationResult.allowanceChanges??[]).length)fail('OFFICIAL_PREVIEW_REJECTED');
 if((a.risks?.riskDetails??[]).some(r=>r.riskType==='RISK')||(a.risks?.riskBehaviors??[]).length||Object.values(a.risks?.addresses??{}).some(a=>(a.riskDetails??[]).some(r=>r.riskType==='RISK')))fail('OFFICIAL_PREVIEW_HIGH_RISK');
 return p;
}
export const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
export const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function reviewDigest(prepared){const t=prepared.transaction;return digest(JSON.stringify([t.chainId,t.from.toLowerCase(),t.to.toLowerCase(),t.value,t.data.toLowerCase(),t.gas,t.gasPrice,prepared.previewId,prepared.official.expiresAt]));}
