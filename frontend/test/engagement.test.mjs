import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationFor,xInvitation,invitationText,rememberedIdentity,rememberIdentity,forgetIdentity,IDENTITY_STORAGE_KEY,mintJourney,invitationQR} from '../dist/engagement.mjs';

test('public invitation and X drafts never inherit private query parameters',()=>{
 assert.equal(invitationFor('ＣＣＨＥＮＪ.ai'),'https://echobsc.fun/?ref=cchenj.ai#mint');
 for(const value of ['name.ai?token=SECRET','https://evil.example/name','<script>','name/other']){
  assert.throws(()=>invitationFor(value));assert.throws(()=>xInvitation(value));
 }
 for(const language of ['zh','en']){
  const draft=new URL(xInvitation('cchenj',language));assert.equal(draft.origin,'https://twitter.com');assert.equal(draft.searchParams.get('url'),invitationFor('cchenj'));
  assert.match(invitationText('cchenj',language),/cchenj.ai/);
  if(language==='en')assert.doesNotMatch(draft.searchParams.get('text'),/[\u4e00-\u9fff]/);
 }
});
test('only a canonical public identity is retained; storage denial does not break participation',()=>{
 const data=new Map([['other-setting','keep']]);const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 assert.equal(rememberIdentity(storage,'ＣＣＨＥＮＪ.ai'),true);assert.equal(rememberedIdentity(storage),'cchenj');assert.equal(data.get(IDENTITY_STORAGE_KEY),'cchenj');assert.equal(data.size,2);
 forgetIdentity(storage);assert.equal(rememberedIdentity(storage),'');assert.equal(data.get('other-setting'),'keep');
 data.set(IDENTITY_STORAGE_KEY,'bad.ai?token=SECRET');assert.equal(rememberedIdentity(storage),'');
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
 assert.equal(rememberedIdentity(denied),'');assert.equal(rememberIdentity(denied,'cchenj'),false);assert.doesNotThrow(()=>forgetIdentity(denied));
});
test('copying, submitting and a successful-looking transaction cannot imply verified delivery',()=>{
 assert.equal(mintJourney({copied:true}).confirmed,false);
 for(const receipt of [null,{status:'pending'},{status:'failed'},{status:'not-found'},{status:1},{hash:'0x123'}])assert.equal(mintJourney({copied:true,receipt}).confirmed,false);
 assert.equal(mintJourney({receipt:{status:'pending'}}).pending,true);
 assert.equal(mintJourney({receipt:{status:'failed'}}).failed,true);
 assert.equal(mintJourney({receipt:{status:'confirmed'}}).confirmed,false);
 const identity={name:'cchenj.ai'},receipt={status:'confirmed',name:'cchenj.ai',tokenDelivered:true};
 assert.equal(mintJourney({identity,receipt}).confirmed,true);
 assert.equal(mintJourney({identity,receipt:{...receipt,name:'another.ai'}}).confirmed,false);
 assert.equal(mintJourney({identity,receipt:{...receipt,tokenDelivered:false}}).confirmed,false);
});
test('QR generation supports the longest official identity and includes high-contrast finder patterns',()=>{
 for(const name of ['cchenj','a'.repeat(64)]){const qr=invitationQR(name),n=qr.getModuleCount();assert.ok(n>=21&&n<=177);assert.equal(n%4,1);assert.equal(qr.isDark(0,0),true);assert.equal(qr.isDark(1,1),false);assert.equal(qr.isDark(3,3),true);}
});
