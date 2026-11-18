import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptLookup} from '../dist/receipt-lookup.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function setup(){
 const pending=[],identities=[],results=[],errors=[];
 const state={view:1,open:true,name:'',receipt:{status:'confirmed',hash:'previous'}};
 const query=createReceiptLookup({
  readReceipt:hash=>{const d=deferred();pending.push({...d,hash});return d.promise;},
  readIdentity:name=>{const d=deferred();identities.push({...d,name});return d.promise;},
  getIdentityName:()=>state.name,onIdentity:who=>{state.name=who.name;},
  getView:()=>state.view,isViewCurrent:view=>state.open&&view===state.view,
  onStart:()=>{state.receipt=null;},onResult:(receipt,hash)=>{state.receipt={...receipt,hash};results.push(state.receipt);},
  onError:error=>{errors.push(error.message);}
 });
 return {query,pending,identities,results,errors,state};
}
test('a slow earlier hash cannot replace the current pending receipt',async()=>{
 const h=setup(),first=h.query('older'),second=h.query('newer');
 h.pending[1].resolve({status:'pending'});await second;
 h.pending[0].resolve({status:'confirmed'});await first;
 assert.deepEqual(h.results,[{status:'pending',hash:'newer'}]);
 assert.equal(h.state.receipt.hash,'newer');
});
test('a fresh lookup clears old confirmation and a read failure leaves it cleared',async()=>{
 const h=setup(),query=h.query('newer');assert.equal(h.state.receipt,null);
 h.pending[0].reject(new Error('RPC_UNAVAILABLE'));await query;
 assert.equal(h.state.receipt,null);assert.deepEqual(h.errors,['RPC_UNAVAILABLE']);
});
test('closing or replacing the modal prevents late success and error updates',async()=>{
 for(const action of ['close','replace']){
  for(const failure of [false,true]){
   const h=setup(),query=h.query('old-view');if(action==='close')h.state.open=false;else h.state.view++;
   if(failure)h.pending[0].reject(new Error('late error'));else h.pending[0].resolve({status:'confirmed'});
   await query;assert.deepEqual(h.results,[]);assert.deepEqual(h.errors,[]);assert.equal(h.state.receipt,null);
  }
 }
});
test('a superseded identity lookup cannot fill the name or overwrite the newer receipt',async()=>{
 const h=setup(),first=h.query('older');h.pending[0].resolve({status:'confirmed',name:'older.ai'});
 await Promise.resolve();assert.equal(h.identities.length,1);
 const second=h.query('newer');h.pending[1].resolve({status:'pending'});await second;
 h.identities[0].resolve({name:'older.ai'});await first;
 assert.equal(h.state.name,'');assert.deepEqual(h.results,[{status:'pending',hash:'newer'}]);
});
test('a current confirmed receipt retains its matching hash and optional identity',async()=>{
 const h=setup(),query=h.query('current');h.pending[0].resolve({status:'confirmed',name:'current.ai'});
 await Promise.resolve();h.identities[0].resolve({name:'current.ai'});await query;
 assert.equal(h.state.name,'current.ai');assert.deepEqual(h.results,[{status:'confirmed',name:'current.ai',hash:'current'}]);
});
test('an optional identity failure does not discard a valid current receipt',async()=>{
 const h=setup(),query=h.query('current');h.pending[0].resolve({status:'confirmed',name:'current.ai'});
 await Promise.resolve();h.identities[0].reject(new Error('identity unavailable'));await query;
 assert.equal(h.state.name,'');assert.equal(h.state.receipt.status,'confirmed');assert.equal(h.state.receipt.hash,'current');
 assert.deepEqual(h.errors,[]);
});
