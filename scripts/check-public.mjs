import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]||path.join(import.meta.dirname,'..'));
const findings=[];let files=0,bytes=0;
const fixtureAllowlist=JSON.parse(await fs.readFile(path.join(root,'docs/secret-scan-fixtures.json'),'utf8').catch(()=>'{"entries":[]}')).entries;
const forbidden=/(?:^|\/)(?:\.env(?:\..*)?|\.operator-private|keys?|wallets?|sessions?)(?:\/|$)|\.(?:sqlite(?:3)?|db|pem|p12|pfx|key|dpapi|log)$/i;
const signatures=[
 ['private-key-pem',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
 ['cloudflare-api-token',/(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|api[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_-]{30,}["']/gi],
 ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
 ['slack-token',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
 ['literal-wallet-private-key',/(?:privateKey|private_key|PRIVATE_KEY)\s*[:=]\s*["'](?:0x)?[a-fA-F0-9]{64}["']/g],
 ['credential-in-url',/https?:\/\/[^\s/@:"']+:[^\s/@"']+@[^\s/"']+/g],
 ['jwt-token',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],
];
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 if(['node_modules','.git','.generated','.preview','artifacts','evidence','edr-cache'].includes(entry.name))continue;
 const full=path.join(dir,entry.name),relative=path.relative(root,full).replaceAll('\\','/');
 if(entry.isSymbolicLink()){findings.push({path:relative,kind:'symlink'});continue;}
 if(forbidden.test(relative)){findings.push({path:relative,kind:'private-file-name'});continue;}
 if(entry.isDirectory()){if(relative==='frontend/dist/server')continue;await walk(full);continue;}
 const data=await fs.readFile(full);files++;bytes+=data.length;
 if(!/\.(?:mjs|js|cjs|ts|sol|json|md|txt|html|css|yml|yaml|ps1|example)$/.test(entry.name)&&!['.gitignore','.gitattributes','LICENSE'].includes(entry.name))continue;
 const text=data.toString('utf8');for(const [kind,pattern]of signatures){pattern.lastIndex=0;for(const match of text.matchAll(pattern)){const line=text.slice(0,match.index).split('\n').length,digest=createHash('sha256').update(match[0]).digest('hex');if(!fixtureAllowlist.some(e=>e.path===relative&&e.kind===kind&&e.line===line&&e.matchSha256===digest))findings.push({path:relative,kind,line});}}
}}
await walk(root);
const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/source-manifest.json'),'utf8'));
let verifiedSourceFiles=0;
for(const file of manifest.files){const data=await fs.readFile(path.join(root,file.path));if(createHash('sha256').update(data).digest('hex')!==file.sha256)findings.push({path:file.path,kind:'export-hash-mismatch'});else verifiedSourceFiles++;}
const report={checkedAt:new Date().toISOString(),files,bytes,verifiedSourceFiles,findings,passed:findings.length===0,note:'Bounded pattern and path scan, plus export hash integrity. This is not a complete secret-detection guarantee or a contract audit.'};
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
