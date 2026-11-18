import fs from 'node:fs';
const url=new URL('../test/contracts.test.mjs',import.meta.url);let text=fs.readFileSync(url,'utf8');
if(!text.includes('const nextSubscription='))text=text.replace("const PRICE=", "let subscriptionSequence=0;\nconst nextSubscription=()=>keccak256(toUtf8Bytes('local-request-'+(++subscriptionSequence)));\nconst PRICE=");
// All previously migrated direct subscriptions use this explicit third-argument deadline.
let changed=0;text=text.replace(/(\.subscribe(?:\.staticCall)?\([^\n]*?),await f\.now\(\)\+300,\{value:/g,match=>{
 if(match.includes('nextSubscription()'))return match;changed++;return match.replace(',await f.now()+300,{value:',',nextSubscription(),await f.now()+300,{value:');
});
fs.writeFileSync(url,text);console.log(JSON.stringify({changed}));
