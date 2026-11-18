import fs from'node:fs';import{createHash}from'node:crypto';
export function assertBuild(){
 const input=JSON.parse(fs.readFileSync(new URL('../artifacts/standard-input.json',import.meta.url),'utf8'));const report=JSON.parse(fs.readFileSync(new URL('../artifacts/build-report.json',import.meta.url),'utf8'));
 for(const[name,s]of Object.entries(input.sources)){const local=new URL('../'+(name.startsWith('contracts/')?name:'node_modules/'+name),import.meta.url);let content=fs.readFileSync(local,'utf8');if(name.startsWith('contracts/'))content=content.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');if(content!==s.content)throw Error('Compiled artifact is stale: '+name+'; run npm run compile');}
 if(createHash('sha256').update(JSON.stringify(input)).digest('hex')!==report.sourceSha256)throw Error('Build-input hash mismatch');return report;
}
if(process.argv[1]?.endsWith('build-integrity.mjs'))console.log(JSON.stringify({fresh:true,...assertBuild()}));
