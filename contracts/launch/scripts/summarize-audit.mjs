import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync(new URL('../evidence/dependency-audit.json',import.meta.url),'utf8'));
console.log(JSON.stringify(Object.entries(j.vulnerabilities??{}).map(([name,v])=>({name,severity:v.severity,direct:v.isDirect,range:v.range,nodes:v.nodes,fix:v.fixAvailable,via:v.via.filter(x=>typeof x==='object').map(x=>({title:x.title,url:x.url,range:x.range}))})),null,2));
