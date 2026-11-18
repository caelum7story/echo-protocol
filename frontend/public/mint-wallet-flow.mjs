import {DEPLOYMENT,launchInterface} from './chain.mjs';

const address=v=>/^0x[0-9a-f]{40}$/i.test(v||'')&&!/^0x0{40}$/i.test(v);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const key='echo.browser-mint.pending.v1';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const pendingKey=key;
export function assertMintTransaction(tx,wallet){
 if(!tx||!address(wallet)||!same(tx.from,wallet)||!same(tx.to,DEPLOYMENT.launch)||BigInt(tx.chainId)!==56n)throw Error('INVALID_MINT_TRANSACTION');
 if(Object.keys(tx).some(k=>!['chainId','from','to','value','data','gas','gasPrice'].includes(k)))throw Error('INVALID_MINT_TRANSACTION');
 let m;try{m=launchInterface.decodeFunctionData('mint',tx.data)[0];}catch{throw Error('INVALID_MINT_TRANSACTION');}
 if(m.shares<1n||m.shares>10n||m.maxCost!==BigInt(tx.value)||BigInt(tx.value)<0n||BigInt(tx.gas)<=0n||BigInt(tx.gasPrice)<=0n)throw Error('INVALID_MINT_TRANSACTION');
 return m;
}
export function walletTransport(provider){
 const current=async()=>{const accounts=await provider.request({method:'eth_accounts'});if(!Array.isArray(accounts)||!address(accounts[0]))throw Error('WALLET_DISCONNECTED');if(BigInt(await provider.request({method:'eth_chainId'}))!==56n)throw Error('WRONG_WALLET_NETWORK');return accounts[0];};
 return {
  async connect(){await provider.request({method:'eth_requestAccounts'});return current();},current,
  async send(tx){const owner=await current();assertMintTransaction(tx,owner);return provider.request({method:'eth_sendTransaction',params:[{...tx}]});},
  watch(changed){const account=()=>changed();provider.on?.('accountsChanged',account);provider.on?.('chainChanged',account);provider.on?.('disconnect',account);return()=>{for(const name of ['accountsChanged','chainChanged','disconnect'])provider.removeListener?.(name,account);};},
  async disconnect(){await provider.disconnect?.();}
 };
}

export class MintWalletFlow {
 constructor({getClient,now=()=>Date.now(),storage,onChange=()=>{}}){this.getClient=getClient;this.now=now;this.storage=storage;this.onChange=onChange;this.epoch=0;this.wallet=null;this.transport=null;this.preview=null;this.sending=false;this.pending=null;try{const p=JSON.parse(storage?.getItem(key)||'null');if(p){assertMintTransaction(p.tx,p.wallet);if(p.hash&&!/^0x[0-9a-f]{64}$/i.test(p.hash))throw Error();this.pending=p;}}catch{this.pending={unreadable:true};}}
 changed(){this.onChange();}
 invalidate(){this.epoch++;this.preview=null;this.changed();}
 async connect(transport,{timeoutMs=120000}={}){
  this.invalidate();const epoch=this.epoch;let timer,wallet;
  try{wallet=await Promise.race([transport.connect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WALLET_CONNECTION_TIMEOUT')),timeoutMs);})]);}
  catch(error){if(error.message==='WALLET_CONNECTION_TIMEOUT'){if(epoch===this.epoch)this.invalidate();Promise.resolve().then(()=>transport.disconnect?.()).catch(()=>{});}throw error;}
  finally{clearTimeout(timer);}
  if(epoch!==this.epoch)throw Error('WALLET_CHANGED');const previous=this.transport;this.stopWatch?.();if(previous&&previous!==transport&&!(previous.kind==='agentic'&&transport.kind==='agentic'))await previous.disconnect?.();if(epoch!==this.epoch)throw Error('WALLET_CHANGED');this.transport=transport;this.wallet=wallet;this.stopWatch=transport.watch(()=>{this.wallet=null;this.invalidate();});this.changed();return wallet;
 }
 async refreshAccount(){if(!this.transport)throw Error('WALLET_DISCONNECTED');const wallet=await this.transport.current();if(!same(wallet,this.wallet)){this.wallet=wallet;this.invalidate();}return wallet;}
 async disconnect(){this.stopWatch?.();this.wallet=null;this.invalidate();const previous=this.transport;this.transport=null;await previous?.disconnect();}
 async account(){const epoch=this.epoch,wallet=await this.refreshAccount(),client=await this.getClient();const [name,balance]=await Promise.all([client.nameOfWallet(wallet),client.provider.getBalance(wallet)]);if(epoch!==this.epoch||!same(wallet,await this.transport.current()))throw Error('WALLET_CHANGED');return {wallet,name,balance};}
 async review({shares,referrer=null}){
  if(this.sending||this.pending)throw Error('MINT_PENDING');this.preview=null;const epoch=this.epoch,wallet=await this.refreshAccount(),client=await this.getClient();
  const name=await client.nameOfWallet(wallet);if(!name)throw Error('NO_OFFICIAL_IDENTITY');
  // Revalidate pinned code and bindings for every new payment review.
  client.checked=false;const q=await client.quote(name,shares,referrer);if(!q.available)throw Error(q.reason);
  if(!same(q.identity.wallet,wallet))throw Error('WALLET_IDENTITY_MISMATCH');
  if(Math.abs(this.now()/1000-q.state.timestamp)>120)throw Error('STALE_CHAIN_STATE');
  const balance=await client.provider.getBalance(wallet);if(balance<=q.cost)throw Error('INSUFFICIENT_BNB');
  // This is unsigned preparation only. The review below narrows the displayed gas ceiling.
  const p=this.transport.prepare?await this.transport.prepare({shares,referrer}):await client.prepareMint({name,shares,referrer,wallet,maxCost:q.cost,gasCap:balance-q.cost,expectedVersion:q.version});
  const fee=BigInt(p.maximumGasWei);if(fee<=0n||fee!==BigInt(p.transaction.gas)*BigInt(p.transaction.gasPrice))throw Error('INVALID_MINT_TRANSACTION');
  assertMintTransaction(p.transaction,wallet);
  const intent=assertMintTransaction(p.transaction,wallet);
  if(intent.shares!==BigInt(shares)||intent.identityId!==BigInt(q.identity.id)||intent.referrerId!==BigInt(q.referrer.id)||BigInt(p.quote.cost)>BigInt(q.cost)||BigInt(p.transaction.value)!==BigInt(p.quote.cost))throw Error('RECEIPT_MISMATCH');
  if(epoch!==this.epoch||!same(wallet,await this.transport.current()))throw Error('WALLET_CHANGED');
  if(Math.abs(this.now()/1000-p.quote.state.timestamp)>120)throw Error('STALE_CHAIN_STATE');
  const snapshot=JSON.parse(JSON.stringify({...p,consent:{...p.consent,gasCapWei:fee.toString()}}));
  this.preview=freeze({id:crypto.randomUUID(),wallet,prepared:snapshot,epoch,expiresAt:Math.min(p.deadline*1000,p.official?.expiresAt??Infinity,this.now()+90000)});this.changed();return this.preview;
 }
 persist(){if(this.pending){if(!this.storage)throw Error('STORAGE_UNAVAILABLE');this.storage.setItem(key,JSON.stringify(this.pending));}else this.storage?.removeItem(key);}
 async submit(id){
  const run=async()=>{try{const saved=this.storage?.getItem(key);if(saved&&!this.pending){this.pending=JSON.parse(saved);this.changed();}}catch{this.pending={unreadable:true};}return this.submitLocked(id);};
  if(globalThis.navigator?.locks)return navigator.locks.request('echo-browser-mint',{ifAvailable:true},lock=>{if(!lock)throw Error('MINT_PENDING');return run();});
  return run();
 }
 async submitLocked(id){
  if(this.sending||this.pending)throw Error('MINT_PENDING');const review=this.preview;if(!review||review.id!==id)throw Error('REVIEW_REQUIRED');
  if(review.epoch!==this.epoch||this.now()>=review.expiresAt){this.invalidate();throw Error('REVIEW_EXPIRED');}
  this.sending=true;this.preview=null;this.changed();let attempted=false;
  try{
   const wallet=await this.transport.current();if(!same(wallet,review.wallet)||this.epoch!==review.epoch)throw Error('WALLET_CHANGED');
   const client=await this.getClient(),tx=review.prepared.transaction;
   assertMintTransaction(tx,wallet);await client.provider.call(tx);
   if(this.now()>=review.expiresAt||this.epoch!==review.epoch||!same(wallet,await this.transport.current()))throw Error('REVIEW_EXPIRED');
   this.pending={wallet,tx:{...tx},createdAt:this.now(),hash:null,agenticPreviewId:review.prepared.previewId??null};this.persist();attempted=true;
   const hash=await this.transport.send(tx);if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('UNKNOWN_TRANSACTION_RESULT');
   this.pending.hash=hash;this.persist();this.changed();return hash;
  }catch(error){if(!attempted||Number(error?.code)===4001||error?.notSubmitted===true){this.pending=null;this.persist();}throw error;}
  finally{this.sending=false;this.changed();}
 }
 async recover(hash){
  if(this.sending||!this.pending||this.pending.unreadable)throw Error('NO_PENDING_MINT');
  if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('INVALID_TRANSACTION_HASH');
  const client=await this.getClient(),tx=await client.provider.getTransaction(hash),p=this.pending;
  if(!tx||!same(tx.from,p.wallet)||!same(tx.to,p.tx.to)||BigInt(tx.value)!==BigInt(p.tx.value)||tx.data.toLowerCase()!==p.tx.data.toLowerCase())throw Error('WRONG_RECOVERY_TRANSACTION');
  p.hash=hash;this.persist();return this.check();
 }
 async check(){
  if(!this.pending?.hash)throw Error('TRANSACTION_HASH_REQUIRED');const p=this.pending,client=await this.getClient();
  const tx=await client.provider.getTransaction(p.hash);
  if(!tx||!same(tx.from,p.wallet)||!same(tx.to,p.tx.to)||BigInt(tx.value)!==BigInt(p.tx.value)||tx.data.toLowerCase()!==p.tx.data.toLowerCase())throw Error('WRONG_RECOVERY_TRANSACTION');
  const r=await client.receipt(p.hash),m=assertMintTransaction(p.tx,p.wallet);
  if(r.status==='confirmed'&&(!same(r.wallet,p.wallet)||BigInt(r.identityId)!==m.identityId||BigInt(r.referrerId)!==m.referrerId||BigInt(r.shares)!==m.shares||BigInt(r.costWei)!==BigInt(p.tx.value)||!r.tokenDelivered))throw Error('RECEIPT_MISMATCH');
  if(r.status==='failed'||r.status==='confirmed'&&r.confirmations>=2){this.pending=null;this.persist();}
  this.changed();return r;
 }
 clearUnsubmitted(acknowledged){if(this.sending||!acknowledged||this.pending?.hash)throw Error('PENDING_REQUIRES_VERIFICATION');this.pending=null;this.persist();this.changed();}
}
