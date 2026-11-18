import {normalizeHandle} from './chain.mjs';
import {OFFICIAL_ORIGIN} from './live-brief.mjs';
import qrcode from './vendor/qrcode.mjs';

export const IDENTITY_STORAGE_KEY='echo.public-identity.v1';
export function invitationFor(value){return `${OFFICIAL_ORIGIN}/?ref=${encodeURIComponent(normalizeHandle(value)+'.ai')}#mint`;}
export function invitationText(value,language='zh'){
 const name=normalizeHandle(value)+'.ai';
 return language==='en'?`${name} invites your Agent to ECHO.\nEach share contains 1,000 ECHO. Each eligible invited first mint adds one paid share of allowance and accrues 200 ECHO for the inviter, reconciled and transferred by the project wallet after pool opening.\n#ECHO #BNBChain`:`${name} 邀请你的 Agent，一起发出回响。\n每份 1,000 ECHO；有效受邀身份首铸后，邀请者增加 1 份付费额度，另有 200 ECHO，开盘后由项目钱包核对发放。\n#ECHO #BNBChain`;
}
export function xInvitation(value,language='zh'){
 const url=new URL('https://twitter.com/intent/tweet');url.search=new URLSearchParams({text:invitationText(value,language),url:invitationFor(value)}).toString();return url.href;
}
export function rememberedIdentity(storage){try{const name=storage.getItem(IDENTITY_STORAGE_KEY);return name?normalizeHandle(name):'';}catch{return '';}}
export function rememberIdentity(storage,value){try{storage.setItem(IDENTITY_STORAGE_KEY,normalizeHandle(value));return true;}catch{return false;}}
export function forgetIdentity(storage){try{storage.removeItem(IDENTITY_STORAGE_KEY);}catch{}}
export function invitationQR(value){const qr=qrcode(0,'M');qr.addData(invitationFor(value));qr.make();return qr;}
export function mintJourney({copied=false,receipt=null,identity=null}={}){
 let sameIdentity=false;try{sameIdentity=!!identity?.name&&normalizeHandle(identity.name)===normalizeHandle(receipt?.name);}catch{}
 const confirmed=receipt?.status==='confirmed'&&receipt.tokenDelivered===true&&sameIdentity;
 return {copied:!!copied,confirmed,pending:receipt?.status==='pending',failed:receipt?.status==='failed',step:confirmed?3:copied?2:1};
}
export async function drawInvitationPoster(value,language='zh',documentRef=document){
 const name=normalizeHandle(value)+'.ai',en=language==='en';
 const image=new Image();
 await Promise.all([documentRef.fonts?.ready,new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('POSTER_ASSET_TIMEOUT')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('POSTER_ASSET_UNAVAILABLE'));};image.src=new URL('./assets/echo-sculpture-v4.webp',import.meta.url).href;})]);
 const canvas=documentRef.createElement('canvas');canvas.width=1080;canvas.height=1440;
 const c=canvas.getContext('2d');if(!c)throw Error('POSTER_UNAVAILABLE');
 const bg=c.createLinearGradient(0,0,1080,1440);bg.addColorStop(0,'#352510');bg.addColorStop(.38,'#100d08');bg.addColorStop(1,'#241a0e');c.fillStyle=bg;c.fillRect(0,0,1080,1440);
 c.strokeStyle='#b28d48';c.lineWidth=1;c.strokeRect(34.5,34.5,1011,1371);c.strokeStyle='#b28d4838';c.strokeRect(44.5,44.5,991,1351);
 const gold=c.createLinearGradient(65,0,850,0);gold.addColorStop(0,'#bd9349');gold.addColorStop(.45,'#f8e7b7');gold.addColorStop(1,'#c39a51');
 const write=(text,x,y,size,color='#dcc9a2',font='system-ui, sans-serif')=>{c.font=`${size}px ${font}`;c.fillStyle=color;c.fillText(text,x,y);};
 write('ECHO',70,144,100,gold,'"Echo Inscription",Georgia,serif');write('GENESIS / PERSONAL INVITATION',76,188,18,'#bfa474','monospace');
 c.drawImage(image,200,205,680,680);
 write('AN INVITATION FROM',76,918,17,'#bfa474','monospace');
 let size=62;c.font=`${size}px system-ui, sans-serif`;while(c.measureText(name).width>920&&size>18){size-=1;c.font=`${size}px system-ui, sans-serif`;}write(name,72,995,size,'#f2eadc');
 c.strokeStyle='#ad894954';c.beginPath();c.moveTo(76,1032);c.lineTo(1004,1032);c.stroke();
 write(en?'THE NEXT ECHO STARTS WITH YOU.':'下一声回响，由你发出。',76,1090,en?24:33,gold,en?'monospace':'system-ui, sans-serif');
 write('1,000 ECHO / SHARE',76,1175,28,'#eee0bc','monospace');write(en?'200 ECHO / VALID INVITE':'成功邀请另有 200 ECHO',76,1227,24);
 write(en?'After opening · Project-wallet payout':'开盘后由项目钱包核对发放',76,1270,en?18:23);write('echobsc.fun',76,1351,30,'#f0dfb3','"Echo Display",Georgia,serif');
 const qr=invitationQR(name),n=qr.getModuleCount(),cell=Math.floor(236/(n+8)),box=cell*(n+8),x=1004-box,y=1114;
 c.fillStyle='#fff';c.fillRect(x,y,box,box);c.fillStyle='#111';for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))c.fillRect(x+(col+4)*cell,y+(r+4)*cell,cell,cell);
 write(en?'SCAN THE INVITATION':'扫码打开专属邀请',x,y+box+31,en?16:18,'#c5b18a');
 return canvas;
}
