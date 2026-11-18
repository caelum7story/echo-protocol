import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {CarReader,CarWriter} from '@ipld/car';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {exporter} from 'ipfs-unixfs-exporter';
import {importer} from 'ipfs-unixfs-importer';
import {AbiCoder,concat,keccak256} from 'ethers';
import {buildNftContent,verifyNftCar,verifyNftItemProof,checkNftRetrieval,CONTENT_DOMAIN,LEAF_TYPES,contentRootFromBaseURI} from '../lib/nft-content.mjs';
import {root} from '../scripts/compile.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5aQAAAAASUVORK5CYII=','base64');
const folder=await fs.mkdtemp(path.join(root,'evidence/content-fixture-'));await fs.writeFile(path.join(folder,'one.png'),png);
const spec=(supply=3)=>({supply:String(supply),items:Array.from({length:supply},(_,i)=>({tokenId:String(i+1),imageFile:'one.png',metadata:{name:`ECHO local content #${i+1}`,description:'Synthetic local test data',attributes:[{trait_type:'Edition',value:i+1}]}}))});
const fixture=await buildNftContent(spec(),{assetRoot:folder});
const expect=f=>({rootCid:f.rootCid,metadataRoot:f.metadataRoot,supply:f.supply});
async function readFiles(f){const reader=await CarReader.fromBytes(f.car),store=new MemoryBlockstore();for await(const block of reader.blocks())await store.put(block.cid,block.bytes);
 return async file=>{const item=await exporter(`${f.rootCid}/${file}`,store),chunks=[];for await(const b of item.content())chunks.push(Buffer.from(b));return Buffer.concat(chunks);};}
async function rewriteCar(f,transform){const reader=await CarReader.fromBytes(f.car),{writer,out}=CarWriter.create(await reader.getRoots()),chunks=[];
 const read=(async()=>{for await(const b of out)chunks.push(Buffer.from(b));})();
 const write=(async()=>{for await(const block of reader.blocks()){const value=transform(block);if(value)await writer.put(value);}await writer.close();})();await Promise.all([read,write]);return Buffer.concat(chunks);}

test('complete deterministic CAR binds every sequential NFT metadata/image and keeps all images recursively linked',async()=>{
 const verified=await verifyNftCar(fixture.car,expect(fixture));assert.equal(verified.completeImagesVerified,true);assert.equal(verified.imagesRecursivelyLinked,true);assert.equal(verified.publicationVerified,false);assert.equal(verified.durablePinningVerified,false);
 const reversed=spec();reversed.items.reverse();const again=await buildNftContent(reversed,{assetRoot:folder});assert.equal(again.rootCid,fixture.rootCid);assert.equal(again.metadataRoot,fixture.metadataRoot);assert.ok(again.car.equals(fixture.car));
 const read=await readFiles(fixture);for(const item of fixture.manifest.entries){assert.ok((await read(item.imagePath)).equals(png));const metadata=JSON.parse(await read(item.metadataPath));assert.equal(metadata.image,'ipfs://'+item.imageCid);assert.equal(metadata.tokenId,item.tokenId);}
});
test('single-item proof uses double-keccak ABI leaves and sorted-pair hashes compatible with OpenZeppelin',async()=>{
 const read=await readFiles(fixture),coder=AbiCoder.defaultAbiCoder();
 for(const item of fixture.manifest.entries){const metadataBytes=await read(item.metadataPath),imageBytes=await read(item.imagePath);
  assert.equal(verifyNftItemProof({supply:fixture.supply,tokenId:item.tokenId,metadataBytes,imageBytes,proof:item.proof,metadataRoot:fixture.metadataRoot}),true);
  let value=keccak256(keccak256(coder.encode(LEAF_TYPES,[CONTENT_DOMAIN,fixture.supply,item.tokenId,item.metadataHash,item.imageHash])));
  for(const sibling of item.proof)value=keccak256(concat([value,sibling].sort()));assert.equal(value,fixture.metadataRoot);
  assert.equal(verifyNftItemProof({supply:'4',tokenId:item.tokenId,metadataBytes,imageBytes,proof:item.proof,metadataRoot:fixture.metadataRoot}),false);
  assert.equal(verifyNftItemProof({supply:fixture.supply,tokenId:item.tokenId,metadataBytes:Buffer.from('changed attributes'),imageBytes,proof:item.proof,metadataRoot:fixture.metadataRoot}),false);
 }
});
test('changed or missing block fails before metadata can be accepted',async()=>{
 let changed=false;const corrupt=await rewriteCar(fixture,block=>{if(!changed){changed=true;const bytes=Buffer.from(block.bytes);bytes[0]^=1;return {...block,bytes};}return block;});
 await assert.rejects(()=>verifyNftCar(corrupt,expect(fixture)),/CONTENT_BLOCK_HASH/);
 const missing=await rewriteCar(fixture,block=>block.cid.toString()===fixture.manifest.entries[0].imageCid?null:block);
 await assert.rejects(()=>verifyNftCar(missing,expect(fixture)),/CONTENT_MISSING_BLOCK|not found/i);
});
test('wrong root,supply,metadata commitment and truncated archives cannot become verified publication',async()=>{
 await assert.rejects(()=>verifyNftCar(fixture.car,{...expect(fixture),metadataRoot:'0x'+'00'.repeat(32)}),/CONTENT_MANIFEST/);
 await assert.rejects(()=>verifyNftCar(fixture.car,{...expect(fixture),supply:'2'}),/CONTENT_MANIFEST/);
 const different=spec();different.items[0].metadata.attributes[0].value=99;const other=await buildNftContent(different,{assetRoot:folder});
 await assert.rejects(()=>verifyNftCar(other.car,expect(fixture)),/CONTENT_CAR_ROOT/);await assert.rejects(()=>verifyNftCar(fixture.car.subarray(0,50),expect(fixture)));
});
test('duplicate/missing token IDs and unsupported external media stop content building',async()=>{
 const duplicate=spec();duplicate.items[1].tokenId='1';await assert.rejects(()=>buildNftContent(duplicate,{assetRoot:folder}),/CONTENT_TOKEN_SEQUENCE/);
 const missing=spec();missing.items.pop();await assert.rejects(()=>buildNftContent(missing,{assetRoot:folder}),/CONTENT_ITEM_COUNT/);
 const mutable=spec();mutable.items[0].metadata.animation_url='https://untrusted.invalid/mutable';await assert.rejects(()=>buildNftContent(mutable,{assetRoot:folder}),/CONTENT_UNSUPPORTED_METADATA_FIELD/);
});
test('local assets are bounded and path traversal or active SVG content is rejected',async()=>{
 const traversal=spec(1);traversal.items[0].imageFile='../outside.png';await assert.rejects(()=>buildNftContent(traversal,{assetRoot:folder}),/CONTENT_ASSET_PATH/);
 await fs.writeFile(path.join(folder,'active.svg'),'<svg><script>alert(1)</script></svg>');const svg=spec(1);svg.items[0].imageFile='active.svg';await assert.rejects(()=>buildNftContent(svg,{assetRoot:folder}),/CONTENT_IMAGE_FORMAT/);
 await assert.rejects(()=>buildNftContent(spec(),{assetRoot:folder,maxFileBytes:5}),/CONTENT_ASSET_SIZE/);
 await assert.rejects(()=>verifyNftCar(fixture.car,expect(fixture),{maxBytes:10}),/CONTENT_SIZE_LIMIT/);
 await assert.rejects(()=>buildNftContent(spec(),{assetRoot:folder,maxRecords:2}),/CONTENT_ITEM_COUNT/);
});
test('chunked image data remains retrievable with independent UnixFS export',async()=>{
 const image=Buffer.concat([png,Buffer.alloc(300000,7)]);await fs.writeFile(path.join(folder,'large.png'),image);const one=spec(1);one.items[0].imageFile='large.png';
 const built=await buildNftContent(one,{assetRoot:folder});assert.ok((await(await readFiles(built))(built.manifest.entries[0].imagePath)).equals(image));assert.equal((await verifyNftCar(built.car,expect(built))).completeImagesVerified,true);
});
test('base URI is a canonical immutable directory CID,not IPNS,a mutable URL or a raw file CID',()=>{
 assert.equal(contentRootFromBaseURI(fixture.baseURI),fixture.rootCid);assert.throws(()=>contentRootFromBaseURI('https://example.com/'),/CONTENT_BASE_URI/);
 assert.throws(()=>contentRootFromBaseURI('ipns://example/'),/CONTENT_BASE_URI/);assert.throws(()=>contentRootFromBaseURI('ipfs://'+fixture.manifest.entries[0].imageCid+'/'),/CONTENT_DIRECTORY_CID_REQUIRED/);
});
async function server(body=fixture.car,{contentType='application/vnd.ipld.car',status=200,headers={}}={}){const requests=[],s=http.createServer((req,res)=>{requests.push(req.url);res.writeHead(status,{'Content-Type':contentType,...headers});res.end(body);});await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${s.address().port}`,requests,close:()=>new Promise(resolve=>s.close(resolve))};}
test('two local read-only retrieval paths verify all blocks without claiming public pinning or permanence',async()=>{
 const a=await server(),b=await server();try{const result=await checkNftRetrieval(expect(fixture),{gateways:[a.url,b.url],mode:'local-test'});assert.equal(result.localRetrievalVerified,true);assert.equal(result.publicRetrievalObserved,false);assert.equal(result.publicationVerified,false);assert.equal(result.observations.length,2);assert.equal(result.durablePinningVerified,false);assert.ok(a.requests.every(url=>url===`/ipfs/${fixture.rootCid}?format=car&dag-scope=all&car-dups=n&car-version=1`));}finally{await Promise.all([a.close(),b.close()]);}
});
test('a failed retrieval,wrong media type or duplicate gateway prevents successful availability evidence',async()=>{
 const a=await server(),b=await server(fixture.car,{contentType:'text/html'});try{await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:[a.url,b.url],mode:'local-test'}),/CONTENT_GATEWAY_RESPONSE/);await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:[a.url,a.url],mode:'local-test'}),/CONTENT_DUPLICATE_GATEWAY/);await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:[a.url,b.url]}),/CONTENT_GATEWAY_POLICY/);}finally{await Promise.all([a.close(),b.close()]);}
});
test('public retrieval refuses private literal addresses before making a request',async()=>{
 await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:['https://127.0.0.2','https://10.1.2.3']}),/CONTENT_PRIVATE_GATEWAY/);
});
test('valid duplicate CAR blocks remain interoperable and are hash-checked before deduplication',async()=>{
 const reader=await CarReader.fromBytes(fixture.car),{writer,out}=CarWriter.create(await reader.getRoots()),chunks=[];
 const read=(async()=>{for await(const b of out)chunks.push(Buffer.from(b));})();
 const write=(async()=>{for await(const block of reader.blocks()){await writer.put(block);await writer.put(block);}await writer.close();})();await Promise.all([read,write]);
 const result=await verifyNftCar(Buffer.concat(chunks),expect(fixture));assert.ok(result.duplicateBlocks>0);assert.equal(result.completeImagesVerified,true);
});
test('actual content CLI builds,verifies and refuses to overwrite its reviewable local artifact',async()=>{
 const run=promisify(execFile),input=path.join(folder,'input.json'),out=path.join(folder,'cli-output');await fs.writeFile(input,JSON.stringify(spec()));
 const cli=async args=>JSON.parse((await run(process.execPath,['agent/echo-nft-content.mjs',...args],{cwd:root,timeout:20000})).stdout);
 const built=await cli(['build','--input',input,'--asset-root',folder,'--out-dir',out]);assert.equal(built.localContentVerified,true);assert.equal(built.uploaded,false);assert.equal(built.rootCid,fixture.rootCid);
 const verified=await cli(['verify','--car',path.join(out,'collection.car'),'--reference',path.join(out,'reference.json')]);assert.equal(verified.completeMetadataVerified,true);assert.equal(verified.publicationVerified,false);
 await assert.rejects(()=>cli(['build','--input',input,'--asset-root',folder,'--out-dir',out]));
 await fs.writeFile(path.join(root,'evidence/nft-content-local-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),reference:built,verification:verified,sourceImages:'synthetic1x1PNG',uploaded:false,publicPinning:false},null,2)+'\n');
});
test('a1024-item collection verifies every linked file with a single directory-index pass',{timeout:120000},async()=>{
 const built=await buildNftContent(spec(1024),{assetRoot:folder});const result=await verifyNftCar(built.car,expect(built));
 assert.equal(result.supply,'1024');assert.equal(result.completeMetadataVerified,true);assert.equal(result.completeImagesVerified,true);
});
test('a genuinely HAMT-sharded UnixFS directory preserves the same committed metadata and image proofs',async()=>{
 class Tracked extends MemoryBlockstore{cids=new Map();put(cid,bytes){this.cids.set(cid.toString(),cid);return super.put(cid,bytes);}}
 const store=new Tracked(),reader=await CarReader.fromBytes(fixture.car),read=await readFiles(fixture),files=[];
 for await(const block of reader.blocks())await store.put(block.cid,block.bytes);
 for(const row of fixture.manifest.entries)for(const file of [row.metadataPath,row.imagePath])files.push({path:file,content:await read(file)});
 files.push({path:'_echo-content.json',content:await read('_echo-content.json')});let directory;
 for await(const entry of importer(files,store,{cidVersion:1,rawLeaves:true,wrapWithDirectory:true,shardSplitThresholdBytes:128}))directory=entry.cid;
 assert.equal((await exporter(directory,store)).unixfs.type,'hamt-sharded-directory');
 const {writer,out}=CarWriter.create([directory]),chunks=[];
 const consume=(async()=>{for await(const b of out)chunks.push(Buffer.from(b));})();
 const produce=(async()=>{for(const cid of store.cids.values()){const parts=[];for await(const bytes of store.get(cid))parts.push(Buffer.from(bytes));await writer.put({cid,bytes:Buffer.concat(parts)});}await writer.close();})();
 await Promise.all([consume,produce]);const result=await verifyNftCar(Buffer.concat(chunks),{...expect(fixture),rootCid:directory.toString()});assert.equal(result.completeImagesVerified,true);assert.equal(result.metadataRoot,fixture.metadataRoot);
});
test('asset-directory junctions cannot escape the selected local asset boundary',async()=>{
 const outside=await fs.mkdtemp(path.join(root,'evidence/content-external-'));await fs.writeFile(path.join(outside,'one.png'),png);
 await fs.symlink(outside,path.join(folder,'linked-assets'),process.platform==='win32'?'junction':'dir');const input=spec(1);input.items[0].imageFile='linked-assets/one.png';
 await assert.rejects(()=>buildNftContent(input,{assetRoot:folder}),/CONTENT_ASSET_PATH/);
});
test('retrieval refuses redirects and oversized bodies without following an unconfigured destination',async()=>{
 const a=await server(),target=await server(),redirect=await server(fixture.car,{status:302,headers:{Location:target.url+'/unconfigured'}});
 try{await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:[a.url,redirect.url],mode:'local-test'}),/CONTENT_GATEWAY_RESPONSE/);
  assert.equal(target.requests.length,0);await assert.rejects(()=>checkNftRetrieval(expect(fixture),{gateways:[a.url,target.url],mode:'local-test',maxBytes:10}),/CONTENT_SIZE_LIMIT/);
 }finally{await Promise.all([a.close(),target.close(),redirect.close()]);}
});
test('patched transitive UUID keeps the CJS v4 API actually used by MetaMask utils',()=>{
 const require=createRequire(import.meta.url),fromUtils=createRequire(require.resolve('@metamask/utils')),uuid=fromUtils('uuid');
 assert.match(uuid.v4(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
