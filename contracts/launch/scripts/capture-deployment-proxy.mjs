import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Transaction,getAddress,getCreateAddress,getBytes,hexlify,keccak256} from 'ethers';
const root=path.resolve(import.meta.dirname,'..'),directory=path.join(root,'references/deterministic-deployment');
const github='https://api.github.com/repos/Arachnid/deterministic-deployment-proxy/commits/master';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
async function http(url,json=false){const r=await fetch(url,{headers:{'User-Agent':'ECHO-local-readiness-check'},signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('PUBLIC_SOURCE_HTTP_'+r.status);return json?r.json():r.text();}
const commit=await http(github,true);assert.match(commit.sha,/^[a-f0-9]{40}$/);
const base='https://raw.githubusercontent.com/Arachnid/deterministic-deployment-proxy/'+commit.sha;
const [readme,yul,license]=await Promise.all(['README.md','source/deterministic-deployment-proxy.yul','LICENSE'].map(file=>http(base+'/'+file)));
fs.mkdirSync(directory,{recursive:true});
for(const [name,content]of [['README.md',readme],['source.yul',yul],['LICENSE',license]])fs.writeFileSync(path.join(directory,name),content);
const addressMatch=readme.match(/### Proxy Address\s+[\s`]*(0x[a-fA-F0-9]{40})\s/),transactionMatch=readme.match(/### Deployment Transaction\s+[\s`]*(0x[a-fA-F0-9]+)\s/);
assert.ok(addressMatch&&transactionMatch,'PRIMARY_README_FORMAT_CHANGED');
const address=getAddress(addressMatch[1]),serialized=transactionMatch[1],tx=Transaction.from(serialized);
assert.equal(tx.to,null);assert.equal(tx.nonce,0);assert.equal(getCreateAddress({from:tx.from,nonce:tx.nonce}),address);
// The primary README transaction uses this 14-byte constructor to return exactly 69 runtime bytes.
assert.equal(tx.data.slice(0,30),'0x604580600e600039806000f350fe');assert.equal(getBytes(tx.data).length,83);
const runtime=hexlify(getBytes(tx.data).subarray(14));assert.equal(getBytes(runtime).length,69);
const rpc='https://bsc-dataseed.bnbchain.org';let id=0;
async function readRpc(method,params){assert.ok(['eth_chainId','eth_getBlockByNumber','eth_getCode'].includes(method));const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(18000)});assert.equal(r.status,200);const json=await r.json();if(json.error)throw Error('PUBLIC_RPC_'+json.error.code);return json.result;}
assert.equal(BigInt(await readRpc('eth_chainId',[])),56n);const block=await readRpc('eth_getBlockByNumber',['latest',false]);
const observed=await readRpc('eth_getCode',[address,block.number]);assert.equal(observed.toLowerCase(),runtime.toLowerCase());
assert.equal((await readRpc('eth_getBlockByNumber',[block.number,false])).hash,block.hash);
const report={schema:'echo-launch-deployment-proxy-observation/v1',observedAt:new Date().toISOString(),source:{repository:'https://github.com/Arachnid/deterministic-deployment-proxy',commit:commit.sha,commitApi:github,readme:base+'/README.md',yul:base+'/source/deterministic-deployment-proxy.yul',readmeSha256:sha256(readme),yulSha256:sha256(yul),licenseSha256:sha256(license)},chainId:56,rpc,block:Number(BigInt(block.number)),blockHash:block.hash,address,runtime,runtimeHash:keccak256(runtime),runtimeBytes:69,primaryTransaction:serialized,derivedFromPrimaryTransaction:true,observedRuntimeMatches:true,readOnly:true,publicTransactions:false,realWalletUsed:false,independentSecurityReview:false,trustedForDeployment:false,productionReady:false,limitations:'Observed existing BSC code matches the runtime in the pinned primary README deployment transaction. No Launch deployment or wallet preview occurred. This is not an audit,release authorization or proof of wallet/backend compatibility.'};
fs.mkdirSync(directory,{recursive:true});for(const [name,content]of [['README.md',readme],['source.yul',yul],['LICENSE',license],['public-capture.json',JSON.stringify(report,null,2)+'\n']])fs.writeFileSync(path.join(directory,name),content);
console.log(JSON.stringify({readOnly:true,chainId:56,block:report.block,address,runtimeHash:report.runtimeHash,observedRuntimeMatches:true,productionReady:false}));
