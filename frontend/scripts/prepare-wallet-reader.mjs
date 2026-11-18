import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
export async function prepareWalletReader(){
  const root=path.resolve(import.meta.dirname,'..');
  const result=await build({metafile:true,entryPoints:[path.join(root,'scripts/wallet-reader-entry.mjs')],outfile:path.join(root,'public/vendor/binance-wallet-reader.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
  const inputs=Object.keys(result.metafile.inputs);
  if(inputs.some(p=>/node_modules\/(?:axios|eip1193-provider|@json-rpc-tools)\//.test(p)))throw Error('UNUSED_LEGACY_HTTP_DEPENDENCY_IN_BROWSER_BUNDLE');
  const mint=await build({metafile:true,entryPoints:[path.join(root,'scripts/wallet-mint-entry.mjs')],outfile:path.join(root,'public/vendor/binance-wallet-mint.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
  if(Object.keys(mint.metafile.inputs).some(p=>/node_modules\/(?:axios|eip1193-provider|@json-rpc-tools)\//.test(p)))throw Error('UNUSED_LEGACY_HTTP_DEPENDENCY_IN_MINT_BUNDLE');
  await build({entryPoints:[path.join(root,'scripts/agentic-qr-entry.mjs')],outfile:path.join(root,'public/vendor/agentic-qr.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
  await fs.mkdir(path.join(root,'.generated'),{recursive:true});
  await fs.writeFile(path.join(root,'.generated/wallet-sdk-report.json'),JSON.stringify({version:'1.1.13',inputs,legacyHttpDependenciesBundled:false,signingMethodsExposed:false},null,2));
  const size=(await fs.stat(path.join(root,'public/vendor/binance-wallet-reader.mjs'))).size;
  console.log(JSON.stringify({walletReaderBundled:true,bytes:size,version:'1.1.13',signingExposed:false}));
}
if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'))await prepareWalletReader();
