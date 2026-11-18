import {prepareWalletReader} from './prepare-wallet-reader.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),publicRoot=path.join(root,'public');
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.woff2':'font/woff2','.xml':'application/xml; charset=utf-8','.zip':'application/zip'};
const assets={};
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.name.startsWith('.'))continue;const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('PUBLIC_ASSET_SYMLINK');if(item.isDirectory()){await walk(file);continue;}const type=types[path.extname(file)];if(!type)throw Error('PUBLIC_ASSET_TYPE:'+item.name);const bytes=await fs.readFile(file);assets['/'+path.relative(publicRoot,file).replaceAll('\\','/')]={base64:bytes.toString('base64'),type,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};}}
await prepareWalletReader();
await walk(publicRoot);if(!assets['/index.html']||!assets['/og.jpg']||!assets['/launch/index.html'])throw Error('REQUIRED_PAGES_OR_CARD_MISSING');
await fs.mkdir(path.join(root,'.generated'),{recursive:true});await fs.mkdir(path.join(root,'dist/server'),{recursive:true});
await fs.writeFile(path.join(root,'.generated/assets.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
await build({entryPoints:[path.join(root,'worker/index.mjs')],outfile:path.join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['browser','worker'],minify:true,sourcemap:false,legalComments:'eof'});
const entry=await fs.readFile(path.join(root,'dist/server/index.js'));const report={builtAt:new Date().toISOString(),assetCount:Object.keys(assets).length,staticBytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0),workerBytes:entry.length,workerSha256:createHash('sha256').update(entry).digest('hex'),projectId:null,hasDatabase:true,nftPublicStorage:false};
await fs.writeFile(path.join(root,'.generated/build-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
