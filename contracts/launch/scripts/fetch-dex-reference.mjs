import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'references/pancake-v2');fs.mkdirSync(folder,{recursive:true});
const repository='pancakeswap/pancake-contracts',sourcePath='projects/exchange-protocol/contracts';
const results=[];let commit=null;
try{
 const response=await fetch(`https://api.github.com/repos/${repository}/commits?path=${sourcePath}/PancakePair.sol&per_page=1`,{headers:{'User-Agent':'ECHO-Launch-read-only-source-review'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Commit lookup HTTP${response.status}`);
 const entries=await response.json();commit=entries[0]?.sha;if(!/^[0-9a-f]{40}$/.test(commit))throw Error('No commit returned');
 for(const name of ['PancakeFactory.sol','PancakePair.sol','PancakeERC20.sol']){
  const url=`https://raw.githubusercontent.com/${repository}/${commit}/${sourcePath}/${name}`;
  const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok){results.push({name,url,status:r.status,verified:false});continue;}
  const content=await r.text();fs.writeFileSync(path.join(folder,name),content);
  results.push({name,url,status:r.status,sha256:createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content),verified:true});
 }
}catch(error){results.push({verified:false,error:error.message});}
const record={observedAt:new Date().toISOString(),officialPointer:'https://developer.pancakeswap.finance/contracts/v2/addresses',repository,commit,results,
 scope:'Read-only source snapshot from the official documentation repository link. Not compiled, executed, deployed, audited or proven equal to deployed BSC runtime.'};
fs.writeFileSync(path.join(folder,'source-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
