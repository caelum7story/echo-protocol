import fs from 'node:fs';
const url=new URL('../test/contracts.test.mjs',import.meta.url);let text=fs.readFileSync(url,'utf8');
if(!text.includes('async function exitArgs('))text=text.replace('async function using(fn)',"async function exitArgs(f,s,id=2,wallet=f.addresses[2]){return [id,(await s.positions(await s.positionKey(id,wallet))).revision,await f.now()+300];}\nasync function using(fn)");
text=text.replace(/\.exitAll(\.staticCall)?\(2\)/g,(_,staticCall='')=>`.exitAll${staticCall}(...await exitArgs(f,s))`);
fs.writeFileSync(url,text);
console.log('Migrated all-position exits to explicit revision and deadline.');
