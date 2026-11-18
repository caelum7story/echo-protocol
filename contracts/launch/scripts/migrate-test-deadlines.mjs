import fs from 'node:fs';
const url=new URL('../test/contracts.test.mjs',import.meta.url);
const text=fs.readFileSync(url,'utf8'),changes=[];
for(const match of text.matchAll(/\.(subscribe|create)(?:\.staticCall)?\(/g)){
 const open=match.index+match[0].length-1,args=[];let start=open+1,nest=0,quote=null;
 for(let j=start;j<text.length;j++){
  const ch=text[j];if(quote){if(ch==='\\'){j++;continue;}if(ch===quote)quote=null;continue;}
  if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
  if('([{'.includes(ch)){nest++;continue;}
  if(ch===')'&&nest===0){args.push({start,end:j,value:text.slice(start,j).trim()});break;}
  if(')]}'.includes(ch)){nest--;continue;}
  if(ch===','&&nest===0){args.push({start,end:j,value:text.slice(start,j).trim()});start=j+1;}
 }
 if(match[1]==='subscribe'&&args.length===3&&args[2].value.startsWith('{value:'))changes.push({at:args[1].end,kind:'subscribe'});
 if(match[1]==='create'&&(args.length===3||(args.length===4&&args[3].value.startsWith('{gasLimit:'))))changes.push({at:args[2].end,kind:'create'});
}
let output=text;for(const c of changes.toSorted((a,b)=>b.at-a.at))output=output.slice(0,c.at)+',await f.now()+300'+output.slice(c.at);
output=output.replace(/revert\(\(\)=>/g,'revert(async()=>');
fs.writeFileSync(url,output);
console.log(JSON.stringify({subscriptions:changes.filter(c=>c.kind==='subscribe').length,creations:changes.filter(c=>c.kind==='create').length}));
