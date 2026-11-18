import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const schema='echo-launch-local-review-bundle/v1';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const backend='outputs/echo-launch-contracts-v1',frontend='outputs/echo-mint-preview-20261105',work='work/echo-launch-preview-20261113';
const denied=/(^|\/)(?:node_modules|\.git|\.codex|\.agents|\.env(?:\.[^/]*)?|\.npmrc|credentials?|wallets?|secrets?|private-testnet-wallet)(\/|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|p12|pfx|dpapi)$/i;
export function safeRelative(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.includes('\0')||path.posix.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..')||denied.test(value))throw Error('Unsafe review path');
 return value;
}
function absolute(root,file){return path.join(root,...safeRelative(file).split('/'));}
function regular(root,file){
 let target=root;for(const part of safeRelative(file).split('/')){target=path.join(target,part);if(fs.lstatSync(target).isSymbolicLink())throw Error('Symlink excluded: '+file);}
 if(!fs.statSync(target).isFile())throw Error('Expected regular file: '+file);return target;
}
export function collectReviewFiles(workspace){
 workspace=fs.realpathSync(workspace);const rows=new Map();
 function add(file,role='immutable-input'){
  file=safeRelative(file);regular(workspace,file);const prior=rows.get(file);if(prior&&prior!==role)throw Error('Conflicting review role: '+file);rows.set(file,role);
 }
 function tree(relative,extensions,role){
  const directory=absolute(workspace,relative);if(fs.lstatSync(directory).isSymbolicLink())throw Error('Symlink excluded: '+relative);
  for(const e of fs.readdirSync(directory,{withFileTypes:true})){const file=relative+'/'+e.name;if(e.isSymbolicLink())throw Error('Symlink excluded: '+file);if(e.isDirectory())tree(file,extensions,role);else if(extensions.test(e.name))add(file,role);}
 }
 for(const name of ['package.json','package-lock.json','release-gates.json','rules/user-decisions-20261115.json','rules/deployment-decisions-20261115.json','runtime-config.json'])add(backend+'/'+name);
 tree(backend+'/release',/\.json$/,'immutable-input');
 for(const name of fs.readdirSync(absolute(workspace,backend)))if(name.endsWith('.md'))add(backend+'/'+name);
 for(const folder of ['src','lib','agent','test','scripts'])tree(backend+'/'+folder,/\.(?:mjs|sol|ps1)$/,'immutable-input');
 tree(backend+'/references',/\.json$/,'immutable-input');tree(backend+'/artifacts',/\.json$/,'compiled-artifact');
 for(const file of ['README.md','source.yul','LICENSE'])add(backend+'/references/deterministic-deployment/'+file);
 // Root reports are historical snapshots; temporary databases, run directories and caches are not copied.
 for(const e of fs.readdirSync(absolute(workspace,backend+'/evidence'),{withFileTypes:true}))if(e.isFile()&&/\.(?:json|tap|sol|log)$/.test(e.name))add(backend+'/evidence/'+e.name,'evidence-snapshot');
 add(backend+'/evidence/baseline-agent41/TokenLaunch.json','immutable-input');
 tree(frontend+'/dist/launch',/\.(?:mjs|json|css|html|md|txt|svg|webp|png|jpg)$/,'immutable-input');
 for(const name of ['package.json','scripts/serve.mjs','scripts/test-launch-handoff.mjs','dist/echo-mark.svg','dist/assets/echo-sculpture-mark.webp','dist/assets/echo-sculpture-v4.webp'])add(frontend+'/'+name);
 tree(frontend+'/dist/assets/fonts',/\.(?:ttf|woff2?)$/,'immutable-input');
 for(const name of fs.readdirSync(absolute(workspace,frontend+'/test')))if(/^launch.*\.test\.mjs$/.test(name))add(frontend+'/test/'+name);
 // The five old Mint policy modules are required by pre-existing Launch-named regression tests.
 // Include their relative JS import closure, not the live Mint app or a hosting manifest.
 const visited=new Set();function moduleClosure(file){if(visited.has(file))return;visited.add(file);add(file);const source=fs.readFileSync(absolute(workspace,file),'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g))moduleClosure(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));}
 for(const name of ['launch-overview.mjs','launch-policy.mjs','model.mjs','referral.mjs','share-model.mjs'])moduleClosure(frontend+'/dist/'+name);
 for(const name of ['launch-rules-v1-confirmed.json','large-file-fixture-20261114.mjs'])add(work+'/'+name);
 for(const name of ['source-verification/standard-input.json','source-verification/manifest.json','tools/uv-download.json','tools/slither-package.json','network-preflight.json'])add(work+'/free-release-prep-20261115/'+name,name.startsWith('source-verification/')?'compiled-artifact':'evidence-snapshot');
 for(const name of ['collection.car','manifest.json','reference.json'])add(work+'/nft-content-20261114/'+name);
 for(const name of ['frontend-result.json','frontend-tests.tap'])add(work+'/agent-runtime-20261114/'+name,'evidence-snapshot');
 for(const name of ['browser-qa.json','participant-browser-observations-v2.json','pagination-browser-observations.json',
  'pagination-mobile-history-pending.jpg','pagination-mobile-history-first-batch.jpg','pagination-mobile-history-complete.jpg','pagination-mobile-receipts.jpg','pagination-mobile-nft-first.jpg','pagination-mobile-nft-last.jpg','pagination-mobile-nft-unminted.jpg','pagination-mobile-invalid-wallet.jpg','pagination-desktop-en.jpg','pagination-desktop-zh.jpg'])add(work+'/runtime-read-20261114/'+name,'evidence-snapshot');
 const boundary=work+'/boundary-browser-20261115',qa=JSON.parse(fs.readFileSync(absolute(workspace,boundary+'/browser-qa.json'),'utf8'));
 for(const name of ['preview.mjs','browser-qa.json','browser-observations-final.json','agent-command-current.txt','mobile-exit-cutoff.png','mobile-refund-paid.png','desktop-en-pool-timeout.png'])add(boundary+'/'+name,name==='preview.mjs'?'immutable-input':'evidence-snapshot');
 if(!qa.sourceRun?.startsWith(boundary+'/run-'))throw Error('Unexpected boundary evidence directory');
 add(safeRelative(qa.sourceRun)+'/walkthrough.json','evidence-snapshot');
 return [...rows].sort(([a],[b])=>a.localeCompare(b,'en')).map(([file,role])=>({path:file,role}));
}
export function buildReviewBundle(workspace,destination){
 workspace=fs.realpathSync(workspace);destination=path.resolve(destination);
 if(fs.existsSync(destination))throw Error('Use a new review destination; existing files are preserved');
 if(destination===workspace||workspace.startsWith(destination+path.sep))throw Error('Destination cannot contain the workspace');
 const selected=collectReviewFiles(workspace),files=[];fs.mkdirSync(destination,{recursive:true});
 for(const row of selected){const bytes=fs.readFileSync(regular(workspace,row.path)),target=absolute(destination,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(!bytes.equals(fs.readFileSync(target)))throw Error('Copy verification failed: '+row.path);files.push({...row,bytes:bytes.length,sha256:sha256(bytes)});}
 const manifest={schema,createdAt:new Date().toISOString(),purpose:'Local handoff for independent review,not an audit or release approval',productionReady:false,executionReady:false,audited:false,uploaded:false,publicTransactions:false,
  environment:{nodeMajor:24,localChainId:31337,dependencyInstall:'npm ci --ignore-scripts --no-audit --fund=false',compiler:'solc0.8.38;optimizer200;Shanghai'},
  exclusions:['node_modules','.git','.openai hosting identity','credentials and wallet files','runtime databases/WAL files and unselected rehearsal run files','unrelated projects','personal attachments'],
  confirmedDecisionRecord:'outputs/echo-launch-contracts-v1/rules/user-decisions-20261115.json',
  deploymentConfigurationRecord:'outputs/echo-launch-contracts-v1/rules/deployment-decisions-20261115.json',
  pendingDecisions:['funded and separately authorized production operations','independent security review and final release approval'],
  limitations:['Hashes detect inconsistency only when the manifest/archive digest is independently retained;not reviewer authentication.','Browser and prior reports are preserved timestamped snapshots,not a new browser run.','Kubo binary,public storage,real wallets,testnet/mainnet and funded operations are not supplied.','This bundle has deterministic synthetic local test accounts;never fund or reuse them on public chains.'],
  fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files};
 fs.writeFileSync(path.join(destination,'REVIEW-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return verifyReviewBundle(destination);
}
export function verifyReviewBundle(directory,{installed=false}={}){
 directory=fs.realpathSync(directory);const manifestFile=regular(directory,'REVIEW-MANIFEST.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(manifest.schema!==schema||!Array.isArray(manifest.files)||manifest.productionReady!==false||manifest.executionReady!==false||manifest.audited!==false||manifest.uploaded!==false||manifest.publicTransactions!==false)throw Error('Invalid review scope or manifest');
 const expected=new Set(['REVIEW-MANIFEST.json']);let total=0;
 for(const row of manifest.files){const file=safeRelative(row.path);if(expected.has(file)||!['immutable-input','compiled-artifact','evidence-snapshot'].includes(row.role)||!Number.isSafeInteger(row.bytes)||row.bytes<0||!/^[a-f0-9]{64}$/.test(row.sha256??''))throw Error('Invalid or duplicate review entry');expected.add(file);const bytes=fs.readFileSync(regular(directory,file));if(bytes.length!==row.bytes||sha256(bytes)!==row.sha256)throw Error('Review hash mismatch: '+file);total+=bytes.length;}
 if(manifest.fileCount!==manifest.files.length||manifest.totalBytes!==total)throw Error('Review totals mismatch');
 let observed=0;function walk(dir,relative=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=relative?relative+'/'+e.name:e.name;if(e.isSymbolicLink())throw Error('Symlink excluded: '+file);if(installed&&file===backend+'/node_modules'&&e.isDirectory())continue;if(e.isDirectory())walk(path.join(dir,e.name),file);else{observed++;if(!expected.has(file))throw Error('Unlisted review file: '+file);}}}walk(directory);
 if(observed!==expected.size)throw Error('Review file inventory mismatch');
 return {verified:true,manifestSha256:sha256(fs.readFileSync(manifestFile)),fileCount:manifest.fileCount,totalBytes:total,productionReady:false,audited:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2);
 if(command==='build'&&args.length===2)console.log(JSON.stringify(buildReviewBundle(...args)));
 else if(command==='verify'&&args.length===1)console.log(JSON.stringify(verifyReviewBundle(args[0])));
 else throw Error('Usage: node scripts/review-bundle.mjs build <workspace> <new-destination> | verify <bundle>');
}
