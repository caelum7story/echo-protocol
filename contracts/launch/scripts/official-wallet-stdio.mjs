// Terminal transport only. No keys or session tokens are read by this adapter.
// Commands are pinned to the installed official CLI; caller owns consent/journal gates.
import fs from 'node:fs';import path from 'node:path';import{pathToFileURL}from'node:url';
import {officialWalletArguments} from '../lib/official-wallet-arguments.mjs';
let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>200000)throw Error('WALLET_TRANSPORT_SIZE');}const input=JSON.parse(text);
const cli='C:/Users/PC/AppData/Roaming/npm/node_modules/@binance/agentic-wallet/dist/index.js',pkg=JSON.parse(fs.readFileSync(path.resolve(cli,'../../package.json'),'utf8'));
if(pkg.name!=='@binance/agentic-wallet'||pkg.version!=='1.12.0'||pkg.bin?.baw!=='dist/index.js')throw Error('REVIEW_CHANGED_OFFICIAL_CLI');const args=officialWalletArguments(input);
process.argv=[process.execPath,cli,...args,'--json'];await import(pathToFileURL(cli).href);
