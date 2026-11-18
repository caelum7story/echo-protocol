import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertMintTransaction} from '../public/mint-wallet-flow.mjs';
export function commandArgs(command,o={}){
 const commands={signin:['auth','signin'],signout:['auth','signout'],status:['wallet','status'],address:['wallet','address'],settings:['wallet','settings'],lock:['wallet','tx-lock','--binanceChainId','56'],version:['cli-check','--required-version','1.12.0'],skill:['skill-check','--skill-name','binance-agentic-wallet','--current-version','1.15.0']};
 if(command==='verify'){if(!/^[a-zA-Z0-9-]{1,128}$/.test(o.qrCodeId??''))throw Error('INVALID_QR_ID');return ['auth','verify','--qrCodeId',o.qrCodeId,'--json'];}
 if(command==='preview'){assertMintTransaction(o.transaction,o.wallet);return ['contract-call','preview','--binanceChainId','56','--from',o.wallet,'--to',o.transaction.to,'--value',BigInt(o.transaction.value).toString(),'--inputData',o.transaction.data,'--json'];}
 if(command==='execute'){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(o.requestId??''))throw Error('INVALID_PREVIEW_ID');return ['contract-call','execute','--requestId',o.requestId,'--json'];}
 if(!Object.hasOwn(commands,command))throw Error('COMMAND_NOT_ALLOWED');return [...commands[command],'--json'];
}
export function bscAddress(data){const all=[...new Set((data?.addresses??[]).filter(a=>String(a.binanceChainId)==='56').map(a=>a.address))];if(all.length!==1||!/^0x[\da-f]{40}$/i.test(all[0])||/^0x0{40}$/i.test(all[0]))throw Error('BSC_ADDRESS_UNVERIFIED');return all[0];}
export class OfficialCli{
 constructor({privateRoot,cliEntry='C:/Users/PC/AppData/Roaming/npm/node_modules/@binance/agentic-wallet/dist/index.js',runner=spawn}){this.privateRoot=path.resolve(privateRoot);this.cliEntry=path.resolve(cliEntry);this.packageRoot=path.dirname(path.dirname(this.cliEntry));this.runner=runner;}
 async profile(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('INVALID_PROFILE');const dir=path.join(this.privateRoot,id);await fs.mkdir(dir,{recursive:true});return {id,dir,instanceId:id};}
 spec(profile,command,o={}){
  if(!profile?.dir||!path.resolve(profile.dir).startsWith(this.privateRoot+path.sep)||path.basename(profile.dir)!==profile.id||!/^[a-f0-9-]{36}$/i.test(profile.id))throw Error('INVALID_PROFILE');
  const keys=['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'];const env=Object.fromEntries(keys.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  Object.assign(env,{BINANCE_BAW_DIR:profile.dir,BINANCE_INSTANCE_ID:profile.instanceId,NODE_USE_ENV_PROXY:'1'});
  // Keytar's global baw/agentSessionId entry is not visitor-specific. Deny
  // native addons and all other filesystem roots to force isolated CLI files.
  return {executable:process.execPath,args:['--permission','--allow-fs-read='+this.packageRoot,'--allow-fs-read='+profile.dir,'--allow-fs-write='+profile.dir,this.cliEntry,...commandArgs(command,o)],options:{cwd:profile.dir,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']}};
 }
 run(profile,command,o={}){const s=this.spec(profile,command,o),child=this.runner(s.executable,s.args,s.options);let out='',bytes=0;const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('OFFICIAL_CLI_TIMEOUT'));},command==='verify'?310000:60000);child.on('error',()=>{clearTimeout(timer);reject(Error('OFFICIAL_CLI_UNAVAILABLE'));});child.stdout.on('data',b=>{bytes+=b.length;if(bytes>512000){child.kill();return;}out+=b;});child.stderr.on('data',()=>{});child.on('close',code=>{clearTimeout(timer);if(bytes>512000)return reject(Error('OFFICIAL_RESPONSE_TOO_LARGE'));let j;try{j=JSON.parse(out.trim());}catch{return reject(Error('OFFICIAL_CLI_RESULT_INVALID'));}if(code!==0||j.success!==true){const e=Error('OFFICIAL_CLI_REJECTED');e.providerError={code:j.error?.code??null,name:j.error?.name??null,message:j.error?.message??null};return reject(e);}resolve(j.data);});});return {child,done};}
}
