import {spawn} from 'node:child_process';
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
export const privateRoot=path.resolve(import.meta.dirname,'../../../echo-agentic-connect-20261118/.private/production-operator');
export async function vault(mode,input){return new Promise((resolve,reject)=>{const p=spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(import.meta.dirname,'agentic-vault.ps1'),'-Mode',mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.on('error',()=>reject(Error('KEY_VAULT_UNAVAILABLE')));p.on('close',code=>code===0?resolve(out.trim()):reject(Error('KEY_VAULT_FAILED')));p.stdin.end(input);});}
export async function loadOperatorKey(){const encrypted=await fs.readFile(path.join(privateRoot,'operator-key.dpapi'),'utf8');return createPrivateKey({key:Buffer.from(await vault('unprotect',encrypted),'base64'),format:'der',type:'pkcs8'});}
if(process.argv.includes('--prepare')){
 await fs.mkdir(privateRoot,{recursive:true});let key;
 try{key=await loadOperatorKey();}catch(e){if(e.code!=='ENOENT')throw e;key=generateKeyPairSync('ed25519').privateKey;const raw=key.export({format:'der',type:'pkcs8'});await fs.writeFile(path.join(privateRoot,'operator-key.dpapi'),await vault('protect',raw.toString('base64')),{flag:'wx'});raw.fill(0);}
 const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 await fs.writeFile(path.resolve(import.meta.dirname,'../worker/agentic-policy.json'),JSON.stringify({schema:'echo-agentic-queue/v1',enabled:true,operatorPublicKey:publicKey,sessionMs:1800000,maxSessions:4,chainId:56,scope:'ECHO Genesis Mint only'},null,2)+'\n');
 console.log(JSON.stringify({prepared:true,encryptedAtRest:true,signerType:'ed25519-queue-auth-only',walletSigningKey:false}));
}
