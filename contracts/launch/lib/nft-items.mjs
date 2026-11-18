import fs from 'node:fs';
import {Contract,Interface,ZeroAddress,getAddress} from 'ethers';
import {readPinnedState} from './participant-history.mjs';
import {verifyParticipantEvents} from './participant-proof.mjs';
const artifact=JSON.parse(fs.readFileSync(new URL('../artifacts/NftLaunch.json',import.meta.url),'utf8')),iface=new Interface(artifact.abi);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),fail=code=>{throw Error(code);};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function decode(cursor){try{
 if(typeof cursor!=='string'||!/^[A-Za-z0-9_-]{1,1000}$/.test(cursor))throw Error();
 const value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
 if(encode(value)!==cursor||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(['b','h','k','l','o','p','v','w'])||value.v!==1||
  !Number.isSafeInteger(value.b)||value.b<0||!Number.isSafeInteger(value.k)||value.k< -1||!Number.isSafeInteger(value.l)||value.l< -1||
  !Number.isSafeInteger(value.o)||value.o<0||value.o>100)throw Error();return value;
 }catch{fail('NFT_ITEM_CURSOR');}}
const receipt=row=>({transactionHash:row.tx_hash,blockNumber:row.block_number,blockHash:row.block_hash,status:1});
export async function readNftItems({db,provider,config,project,wallet,blockNumber,blockHash,cursor,limit=20}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('NFT_ITEM_PAGE_LIMIT');
 if(!Number.isSafeInteger(blockNumber)||blockNumber<0||!/^0x[0-9a-fA-F]{64}$/.test(blockHash??''))fail('NFT_ITEM_BLOCK_REQUIRED');
 project=getAddress(project);wallet=getAddress(wallet);
 const scope={v:1,p:project.toLowerCase(),w:wallet.toLowerCase(),b:blockNumber,h:blockHash.toLowerCase()},after=cursor?decode(cursor):{...scope,k:-1,l:-1,o:0};
 if(!same(after.p,scope.p)||!same(after.w,scope.w)||after.b!==scope.b||!same(after.h,scope.h))fail('NFT_ITEM_SCOPE');
 const state=await readPinnedState({db,provider,config,project,wallet,blockNumber,blockHash});if(state.kind!==1)fail('NFT_ITEM_PROJECT_KIND');
 const rows=db.prepare(`SELECT * FROM events WHERE lower(address)=lower(?) AND name='Subscribed' AND lower(json_extract(args_json,'$.wallet'))=lower(?)
  AND block_number<=? AND (block_number>? OR (block_number=? AND log_index>=?)) ORDER BY block_number,log_index LIMIT ?`)
  .all(project,wallet,blockNumber,after.k,after.k,after.l,limit+2);
 if(cursor&&(!rows.length||rows[0].block_number!==after.k||rows[0].log_index!==after.l))fail('NFT_ITEM_CURSOR');
 await verifyParticipantEvents({provider,state,rows});
 const selected=[];let next=null;
 for(let i=0;i<rows.length&&selected.length<limit;i++){
  const row=rows[i],a=JSON.parse(row.args_json),first=BigInt(a.firstId),count=BigInt(a.count),offset=i===0?BigInt(after.o):0n;
  if(count<1n||count>100n||first<1n||first+count-1n>BigInt(state.base.capacity)||BigInt(a.principal)!==count*BigInt(state.base.unitPrice)||offset>count)fail('NFT_ITEM_PROOF_MISMATCH');
  let j=offset;for(;j<count&&selected.length<limit;j++)selected.push({tokenId:first+j,subscription:row});
  next=j<count||i<rows.length-1?encode({...scope,k:row.block_number,l:row.log_index,o:Number(j)}):null;
 }
 const sale=new Contract(project,artifact.abi,provider),items=[];
 for(let i=0;i<selected.length;i+=8)items.push(...await Promise.all(selected.slice(i,i+8).map(async({tokenId,subscription})=>{
  const at={blockTag:blockNumber},reservedWallet=await sale.reservedFor(tokenId,at);if(!same(reservedWallet,wallet))fail('NFT_ITEM_PROOF_MISMATCH');
  let currentOwner=null;
  try{currentOwner=await sale.ownerOf(tokenId,at);if(same(currentOwner,ZeroAddress))fail('NFT_ITEM_PROOF_MISMATCH');}
  catch(error){let parsed;const nested=error.info?.error?.data,data=typeof error.data==='string'?error.data:typeof nested==='string'?nested:nested?.data;try{if(typeof data==='string')parsed=iface.parseError(data);}catch{}
   if(error.code!=='CALL_EXCEPTION'||parsed?.name!=='ERC721NonexistentToken'||parsed.args.tokenId!==tokenId)fail('NFT_OWNER_READ_UNAVAILABLE');}
  const delivered=db.prepare(`SELECT * FROM events WHERE lower(address)=lower(?) AND block_number<=? AND name='Delivered' AND json_extract(args_json,'$.tokenId')=? LIMIT 2`).all(project,blockNumber,String(tokenId));
  if(delivered.length!==(currentOwner?1:0))fail('NFT_ITEM_PROOF_MISMATCH');
  if(delivered.length)await verifyParticipantEvents({provider,state,rows:delivered});
  const contentURI=state.extra.contentBaseURI+tokenId+'.json';if(contentURI.length>16384)fail('NFT_ITEM_CONTENT_PATH_LIMIT');
  const tokenURI=currentOwner?await sale.tokenURI(tokenId,at):null;if(currentOwner&&tokenURI!==contentURI)fail('NFT_ITEM_PROOF_MISMATCH');
  return {tokenId:String(tokenId),reservedWallet,minted:!!currentOwner,currentOwner,contentURI,tokenURI,subscriptionReceipt:receipt(subscription),deliveryReceipt:delivered.length?receipt(delivered[0]):null};
 })));
 if(!same(db.prepare('SELECT hash FROM blocks WHERE number=?').get(blockNumber)?.hash,blockHash)||!same((await provider.getBlock(blockNumber))?.hash,blockHash))fail('HISTORY_CURSOR_REORG');
 return {schema:'echo-launch-nft-items/v1',project,wallet,blockNumber,blockHash,scope:'page-only',items,nextCursor:next,historical:true,contentVerified:false,executionReady:false,financialExecutionAllowed:false};
}
