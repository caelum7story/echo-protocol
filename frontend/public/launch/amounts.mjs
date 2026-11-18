export const PUBLIC_UNITS=555555555n,IDENTITY_CAP=22222222n,E18=10n**18n;
export function wei(input){if(typeof input!=='string'||input.length>80||!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(input))throw Error('INVALID_BNB');const [i,f='']=input.split('.');const n=BigInt(i)*E18+BigInt(f.padEnd(18,'0'));if(n>=1n<<256n)throw Error('BNB_OVERFLOW');return n;}
export function bnb(value){const n=BigInt(value),i=n/E18,f=(n%E18).toString().padStart(18,'0').replace(/0+$/,'');return i+(f?'.'+f:'');}
export const share=(n,d)=>BigInt(d)?(BigInt(n)*10000n/BigInt(d)/100n)+'.'+(BigInt(n)*10000n/BigInt(d)%100n).toString().padStart(2,'0')+'%':'—';
export function subscription({budget,unitPrice,remaining,used=0}){const price=BigInt(unitPrice),available=BigInt(remaining),identity=IDENTITY_CAP-BigInt(used);if(price<=0n||available<0n||identity<0n)throw Error('INVALID_STATE');const max=available<identity?available:identity,value=wei(budget),units=value/price;if(units<1n)throw Error('AMOUNT_TOO_SMALL');if(units>max)throw Error('QUOTA_EXCEEDED');return {units,payment:units*price,unused:value-units*price,max};}
export function creationDraft({name,symbol,unitPrice,minimumRaise}){
 const price=wei(unitPrice),minimum=wei(minimumRaise),max=PUBLIC_UNITS*price;
 if(typeof name!=='string'||!name.trim()||typeof symbol!=='string'||!symbol.trim())throw Error('NAME_AND_SYMBOL_REQUIRED');
 if(price<=0n||minimum<=0n||minimum>max||max>=1n<<256n)throw Error('INVALID_RAISE');
 // Only browser-entered economic terms. Legacy saved dates/recipients are not forwarded.
 return {terms:{name:name.trim(),symbol:symbol.trim(),unitPrice:String(price),minimumRaise:String(minimum)},maximumRaise:max,minimum,belowQuarter:minimum*4n<max};
}
export function creation(input,now=Date.now()){
 const draft=creationDraft(input),start=Math.floor(new Date(input.startsAt).getTime()/1000),recipient=input.creatorRecipient;
 if(!Number.isSafeInteger(start)||start<=now/1000)throw Error('START_MUST_BE_FUTURE');
 if(!/^0x[\da-fA-F]{40}$/.test(recipient)||/^0x0{40}$/i.test(recipient))throw Error('INVALID_RECIPIENT');
 return {...draft,terms:{...draft.terms,startsAt:String(start),creatorRecipient:recipient},endsAt:start+604800};
}
