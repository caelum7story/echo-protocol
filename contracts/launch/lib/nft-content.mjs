import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import {importer} from 'ipfs-unixfs-importer';
import {fixedSize} from 'ipfs-unixfs-importer/chunker';
import {exporter} from 'ipfs-unixfs-exporter';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {CarReader,CarWriter} from '@ipld/car';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {keccak256,toUtf8Bytes} from 'ethers';

export const CONTENT_SCHEMA='echo-launch-nft-content/v1';
export const CONTENT_DOMAIN=keccak256(toUtf8Bytes('ECHO_LAUNCH_NFT_CONTENT_V1'));
export const LEAF_TYPES=['bytes32','uint256','uint256','bytes32','bytes32'];
const MANIFEST='_echo-content.json',MIB=1024*1024;
const fail=code=>{throw Error(code);};
const num=value=>{if(String(value).length>16||!/^[1-9][0-9]*$/.test(String(value))||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))fail('CONTENT_SUPPLY');return Number(value);};
function limits(options={}){
 const r={maxBytes:256*MIB,maxFileBytes:16*MIB,maxMetadataBytes:MIB,maxRecords:10000,...options};
 for(const key of ['maxBytes','maxFileBytes','maxMetadataBytes','maxRecords'])if(!Number.isSafeInteger(r[key])||r[key]<=0)fail('CONTENT_LIMIT_POLICY');
 return r;
}
function ordered(value,depth=0){
 if(depth>64)fail('CONTENT_JSON_DEPTH');
 if(typeof value==='number'&&(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)))fail('CONTENT_JSON_NUMBER');
 if(Array.isArray(value))return value.map(v=>ordered(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k],depth+1)]));
 if(value===undefined||typeof value==='bigint'||typeof value==='function')fail('CONTENT_JSON_TYPE');return value;
}
export const contentJson=value=>JSON.stringify(ordered(value));
const jsonBytes=value=>Buffer.from(contentJson(value),'utf8');
const readJson=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const cidString=value=>{let cid;try{cid=CID.parse(String(value));}catch{fail('CONTENT_CID');}if(cid.version!==1||cid.multihash.code!==sha256.code||![0x55,0x70].includes(cid.code))fail('CONTENT_CID_CODEC');return cid.toString();};
const hash32=value=>{if(!/^0x[0-9a-fA-F]{64}$/.test(String(value)))fail('CONTENT_ROOT');return value.toLowerCase();};
export function contentRootFromBaseURI(uri){const match=/^ipfs:\/\/([^/]+)\/$/.exec(String(uri));if(!match)fail('CONTENT_BASE_URI');const cid=cidString(match[1]);if(CID.parse(cid).code!==0x70)fail('CONTENT_DIRECTORY_CID_REQUIRED');return cid;}
export function imageType(bytes){
 const b=Buffer.from(bytes);
 if(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {extension:'png',mime:'image/png'};
 if(b[0]===255&&b[1]===216&&b[2]===255)return {extension:'jpg',mime:'image/jpeg'};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {extension:'webp',mime:'image/webp'};
 if(['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()))return {extension:'gif',mime:'image/gif'};
 fail('CONTENT_IMAGE_FORMAT');
}
// MemoryBlockstore keys by multihash and getAll reconstructs raw CIDs. Preserve the
// original codec-aware CIDs explicitly, so a CAR never mislabels a dag-pb block as raw.
class Blocks extends MemoryBlockstore{
 cids=new Map();
 put(cid,bytes,...rest){this.cids.set(cid.toString(),cid);return super.put(cid,bytes,...rest);}
 get(cid,...rest){if(!this.cids.has(cid.toString()))fail('CONTENT_MISSING_BLOCK');return super.get(cid,...rest);}
}
async function collect(source,max){const chunks=[];let size=0;for await(const part of source){size+=part.length;if(max!==undefined&&size>max)fail('CONTENT_SIZE_LIMIT');chunks.push(Buffer.from(part));}return Buffer.concat(chunks);}
const importOptions=wrapWithDirectory=>({cidVersion:1,rawLeaves:true,wrapWithDirectory,reduceSingleLeafToSelf:true,chunker:fixedSize({chunkSize:262144}),fileImportConcurrency:1,blockWriteConcurrency:1});
async function importFiles(files,store,wrap){let last;for await(const result of importer(files,store,importOptions(wrap)))last=result;if(!last)fail('CONTENT_EMPTY_IMPORT');return last.cid;}
async function carBytes(store,root,maxBytes){
 const blocks=[];let size=256;
 for(const cid of [...store.cids.values()].sort((a,b)=>a.toString()<b.toString()?-1:1)){const bytes=await collect(store.get(cid),maxBytes);size+=bytes.length+cid.bytes.length+16;if(size>maxBytes)fail('CONTENT_SIZE_LIMIT');blocks.push({cid,bytes});}
 const {writer,out}=CarWriter.create([root]);const result=collect(out);
 const write=(async()=>{for(const block of blocks)await writer.put(block);await writer.close();})();
 const [bytes]=await Promise.all([result,write]);return bytes;
}
function metadataInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.name!=='string')fail('CONTENT_METADATA');
 if(Object.keys(value).some(k=>!['name','description','attributes'].includes(k)))fail('CONTENT_UNSUPPORTED_METADATA_FIELD');
 if(value.description!==undefined&&typeof value.description!=='string'||value.attributes!==undefined&&!Array.isArray(value.attributes))fail('CONTENT_METADATA');
 return ordered(value);
}
const leaf=(supply,row)=>[CONTENT_DOMAIN,String(supply),String(row.tokenId),row.metadataHash,row.imageHash];
async function assetFile(root,relative,max){
 if(typeof relative!=='string'||path.isAbsolute(relative))fail('CONTENT_ASSET_PATH');
 const absolute=path.resolve(root,relative);if(!absolute.startsWith(root+path.sep))fail('CONTENT_ASSET_PATH');
 const real=await fs.realpath(absolute);if(!real.startsWith(root+path.sep))fail('CONTENT_ASSET_PATH');
 const stat=await fs.stat(real);if(!stat.isFile()||stat.size>max)fail('CONTENT_ASSET_SIZE');
 const bytes=await fs.readFile(real);if(bytes.length>max)fail('CONTENT_ASSET_SIZE');return bytes;
}
export async function buildNftContent(spec,{assetRoot,...options}={}){
 const l=limits(options),supply=num(spec?.supply),root=await fs.realpath(assetRoot);
 if(!Array.isArray(spec?.items)||spec.items.length!==supply||supply>l.maxRecords)fail('CONTENT_ITEM_COUNT');
 const source=[...spec.items].sort((a,b)=>num(a.tokenId)-num(b.tokenId)),store=new Blocks(),images=[],metadata=[],rows=[];let total=0;
 for(let i=0;i<supply;i++){
  const item=source[i],id=i+1;if(num(item.tokenId)!==id)fail('CONTENT_TOKEN_SEQUENCE');
  const bytes=await assetFile(root,item.imageFile,l.maxFileBytes);total+=bytes.length;if(total>l.maxBytes)fail('CONTENT_SIZE_LIMIT');
  const type=imageType(bytes),imageCid=await importFiles([{path:`${id}.${type.extension}`,content:bytes}],store,false),imagePath=`images/${id}.${type.extension}`;
  const body={...metadataInput(item.metadata),tokenId:String(id),image:'ipfs://'+imageCid.toString()},json=jsonBytes(body);total+=json.length;
  if(json.length>l.maxMetadataBytes||total>l.maxBytes)fail('CONTENT_SIZE_LIMIT');
  const metadataCid=await importFiles([{path:`${id}.json`,content:json}],store,false);
  images.push({path:imagePath,content:bytes});metadata.push({path:`${id}.json`,content:json});
  rows.push({tokenId:String(id),metadataPath:`${id}.json`,metadataCid:metadataCid.toString(),metadataHash:keccak256(json),metadataBytes:json.length,
   imagePath,imageCid:imageCid.toString(),imageHash:keccak256(bytes),imageBytes:bytes.length,imageMime:type.mime});
 }
 const tree=StandardMerkleTree.of(rows.map(r=>leaf(supply,r)),LEAF_TYPES);
 const manifest={schema:CONTENT_SCHEMA,supply:String(supply),commitment:{scheme:'openzeppelin-standard-merkle-tree-v1',leafTypes:LEAF_TYPES,domain:CONTENT_DOMAIN,metadataRoot:tree.root},
  entries:rows.map((row,i)=>({...row,proof:tree.getProof(i)})),profile:{cidVersion:1,rawLeaves:true,chunkBytes:262144,metadata:'sorted-key-utf8-json',imagesRecursivelyLinked:true}};
 const manifestBytes=jsonBytes(manifest);if(manifestBytes.length>l.maxBytes)fail('CONTENT_SIZE_LIMIT');
 const files=[...images,...metadata,{path:MANIFEST,content:manifestBytes}].sort((a,b)=>a.path<b.path?-1:1);
 const directory=await importFiles(files,store,true),car=await carBytes(store,directory,l.maxBytes);
 const reference={rootCid:directory.toString(),baseURI:`ipfs://${directory}/`,metadataRoot:tree.root,supply:String(supply)};
 await verifyNftCar(car,reference,l);
 return {schema:'echo-launch-nft-content-build/v1',...reference,car,carSha256:digest(car),carBytes:car.length,manifest,localContentVerified:true,publicationVerified:false,durablePinningVerified:false,uploaded:false};
}
async function loadCar(bytes,l){
 if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>l.maxBytes)fail('CONTENT_SIZE_LIMIT');
 const reader=await CarReader.fromBytes(bytes),roots=await reader.getRoots(),store=new Blocks();let total=0,count=0,duplicates=0;
 for await(const {cid,bytes:block} of reader.blocks()){
  cidString(cid.toString());const actual=await sha256.digest(block);
  if(!Buffer.from(actual.bytes).equals(Buffer.from(cid.multihash.bytes)))fail('CONTENT_BLOCK_HASH');
  total+=block.length;if(total>l.maxBytes||++count>l.maxRecords*32+1024)fail('CONTENT_SIZE_LIMIT');
  if(store.cids.has(cid.toString())){++duplicates;continue;}
  await store.put(cid,block);
 }
 return {roots,store,blocks:count,duplicates};
}
async function linkedFile(store,link,max){if(!link?.cid)fail('CONTENT_DIRECTORY_ENTRIES');const entry=await exporter(link.cid,store);if(!['file','raw'].includes(entry.type))fail('CONTENT_NOT_FILE');return {cid:entry.cid.toString(),bytes:await collect(entry.content(),max)};}
async function directoryEntries(store,cid,max){const entry=await exporter(cid,store);if(entry.type!=='directory')fail('CONTENT_NOT_DIRECTORY');const entries=new Map();
 for await(const item of entry.entries()){if(entries.size>=max)fail('CONTENT_SIZE_LIMIT');if(entries.has(item.name))fail('CONTENT_DIRECTORY_DUPLICATE_NAME');entries.set(item.name,item);}return entries;}
export async function verifyNftCar(bytes,expected,options={}){
 const l=limits(options),rootCid=cidString(expected?.rootCid),metadataRoot=hash32(expected?.metadataRoot),supply=num(expected?.supply);
 if(supply>l.maxRecords)fail('CONTENT_ITEM_COUNT');
 const {roots,store,blocks,duplicates}=await loadCar(bytes,l);if(roots.length!==1||roots[0].toString()!==rootCid)fail('CONTENT_CAR_ROOT');
 const rootEntries=await directoryEntries(store,rootCid,supply+3),raw=await linkedFile(store,rootEntries.get(MANIFEST),l.maxBytes),manifest=readJson(raw.bytes);
 if(manifest?.schema!==CONTENT_SCHEMA||manifest.supply!==String(supply)||!Array.isArray(manifest.entries)||manifest.entries.length!==supply
  ||contentJson(manifest.commitment?.leafTypes)!==contentJson(LEAF_TYPES)||manifest.commitment?.domain!==CONTENT_DOMAIN||manifest.commitment?.metadataRoot?.toLowerCase()!==metadataRoot)fail('CONTENT_MANIFEST');
 if(!raw.bytes.equals(jsonBytes(manifest)))fail('CONTENT_NONCANONICAL_MANIFEST');
 const expectedNames=[MANIFEST,'images',...Array.from({length:supply},(_,i)=>`${i+1}.json`)].sort();
 if(contentJson([...rootEntries.keys()].sort())!==contentJson(expectedNames))fail('CONTENT_DIRECTORY_ENTRIES');
 const imageEntries=await directoryEntries(store,rootEntries.get('images').cid,supply+1);
 const rows=[],imageNames=[];let total=raw.bytes.length;
 for(let i=0;i<supply;i++){
  const row=manifest.entries[i],id=String(i+1);
  if(row.tokenId!==id||row.metadataPath!==`${id}.json`||!new RegExp(`^images/${id}\\.(png|jpg|gif|webp)$`).test(row.imagePath))fail('CONTENT_TOKEN_SEQUENCE');
  const [meta,image]=await Promise.all([linkedFile(store,rootEntries.get(row.metadataPath),l.maxMetadataBytes),linkedFile(store,imageEntries.get(row.imagePath.slice(7)),l.maxFileBytes)]);
  total+=meta.bytes.length+image.bytes.length;if(total>l.maxBytes)fail('CONTENT_SIZE_LIMIT');
  if(meta.cid!==cidString(row.metadataCid)||image.cid!==cidString(row.imageCid)||keccak256(meta.bytes)!==row.metadataHash||keccak256(image.bytes)!==row.imageHash
   ||meta.bytes.length!==row.metadataBytes||image.bytes.length!==row.imageBytes||imageType(image.bytes).mime!==row.imageMime)fail('CONTENT_ENTRY_HASH');
  const body=readJson(meta.bytes),{image:uri,tokenId,...userMetadata}=body;metadataInput(userMetadata);
  if(tokenId!==id||uri!=='ipfs://'+image.cid||!meta.bytes.equals(jsonBytes(body)))fail('CONTENT_METADATA_BINDING');
  if(!StandardMerkleTree.verify(metadataRoot,LEAF_TYPES,leaf(supply,row),row.proof))fail('CONTENT_MERKLE_PROOF');
  rows.push(row);imageNames.push(row.imagePath.slice(7));
 }
 if(contentJson([...imageEntries.keys()].sort())!==contentJson(imageNames.sort()))fail('CONTENT_IMAGE_DIRECTORY');
 if(StandardMerkleTree.of(rows.map(row=>leaf(supply,row)),LEAF_TYPES).root.toLowerCase()!==metadataRoot)fail('CONTENT_COLLECTION_ROOT');
 return {schema:'echo-launch-nft-content-verification/v1',rootCid,baseURI:`ipfs://${rootCid}/`,metadataRoot,supply:String(supply),
  blocks,duplicateBlocks:duplicates,carSha256:digest(bytes),completeMetadataVerified:true,completeImagesVerified:true,imagesRecursivelyLinked:true,
  localContentVerified:true,publicationVerified:false,durablePinningVerified:false,sourceAuthenticityVerified:false};
}
export function verifyNftItemProof({supply,tokenId,metadataBytes,imageBytes,proof,metadataRoot}){
 try{const row={tokenId:String(num(tokenId)),metadataHash:keccak256(metadataBytes),imageHash:keccak256(imageBytes)};
  return num(tokenId)<=num(supply)&&StandardMerkleTree.verify(hash32(metadataRoot),LEAF_TYPES,leaf(num(supply),row),proof);
 }catch{return false;}
}
export async function verifyNftCarFile(file,expected,options={}){const l=limits(options),stat=await fs.stat(file);if(!stat.isFile()||stat.size>l.maxBytes)fail('CONTENT_SIZE_LIMIT');return verifyNftCar(await fs.readFile(file),expected,l);}

const privateNetworks=new BlockList();
for(const [ip,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])privateNetworks.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix] of [['::',96],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]])privateNetworks.addSubnet(ip,prefix,'ipv6');
const publicAddress=ip=>{const family=isIP(ip);return !!family&&!privateNetworks.check(ip,family===4?'ipv4':'ipv6')&&(family===4||/^[23]/.test(ip));};
async function retrievalResponse(origin,rootCid,mode,timeoutMs){
 const url=new URL(`${origin}/ipfs/${rootCid}?format=car&dag-scope=all&car-dups=n&car-version=1`),host=url.hostname.replace(/^\[|\]$/g,''),resolved=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
 if(mode==='public'&&(!resolved.length||resolved.some(p=>!publicAddress(p.address))))fail('CONTENT_PRIVATE_GATEWAY');
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{method:'GET',signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/vnd.ipld.car; version=1','Accept-Encoding':'identity'},
   lookup(_host,options,callback){if(options.all)callback(null,resolved);else callback(null,resolved[0].address,resolved[0].family);}},resolve);
  request.on('error',reject);request.end();
 });
}

// Public retrieval is read-only and accepts operator-configured gateway origins,never
// metadata URLs. Two origins are observations,not proof of independent ownership or permanence.
export async function checkNftRetrieval(expected,{gateways,mode='public',maxBytes=256*MIB,timeoutMs=20000,...options}={}){
 if(!['public','local-test'].includes(mode)||!Array.isArray(gateways)||gateways.length<2||gateways.length>4)fail('CONTENT_GATEWAY_POLICY');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail('CONTENT_GATEWAY_POLICY');
 limits({...options,maxBytes});
 const rootCid=cidString(expected?.rootCid),origins=[];
 for(const gateway of gateways){const url=new URL(gateway),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'&&!local||mode==='local-test'&&local&&url.protocol==='http:'))fail('CONTENT_GATEWAY_POLICY');
  if(origins.includes(url.origin))fail('CONTENT_DUPLICATE_GATEWAY');origins.push(url.origin);
 }
 const results=await Promise.allSettled(origins.map(async origin=>{
  const response=await retrievalResponse(origin,rootCid,mode,timeoutMs);
  if(response.statusCode!==200||!String(response.headers['content-type']).includes('application/vnd.ipld.car')||response.headers['content-encoding']&&!['identity'].includes(response.headers['content-encoding'])){response.destroy();fail('CONTENT_GATEWAY_RESPONSE');}
  let bytes;try{bytes=await collect(response,maxBytes);}catch(error){response.destroy();throw error;}
  const proof=await verifyNftCar(bytes,expected,{...options,maxBytes});return {origin,at:new Date().toISOString(),carSha256:proof.carSha256,allContentVerified:true};
 }));
 const failure=results.find(p=>p.status==='rejected');if(failure)throw failure.reason;const observations=results.map(p=>p.value);
 return {schema:'echo-launch-nft-retrieval/v1',at:new Date().toISOString(),rootCid,metadataRoot:hash32(expected.metadataRoot),supply:String(num(expected.supply)),observations,
  localRetrievalVerified:mode==='local-test',publicRetrievalObserved:mode==='public',publicationVerified:false,durablePinningVerified:false,
  limitation:'Retrieval observations do not prove operator independence,source authorship,long-term pinning or publication authorization. No upload was performed.'};
}
