// A receipt may arrive after another hash or another modal has been selected.
export function createReceiptLookup({readReceipt,readIdentity,getIdentityName,onIdentity,onStart,onResult,onError,getView,isViewCurrent}){
 let request=0;
 return async hash=>{
  const current=++request,view=getView();
  const active=()=>current===request&&isViewCurrent(view);
  onStart(hash);
  try{
   const result=await readReceipt(hash);
   if(!active())return;
   if(result.status==='confirmed'&&result.name&&!getIdentityName()){
    try{
     const identity=await readIdentity(result.name);
     if(!active())return;
     if(!getIdentityName())onIdentity(identity);
    }catch{if(!active())return;}
   }
   if(active())onResult(result,hash);
  }catch(error){if(active())onError(error,hash);}
 };
}
