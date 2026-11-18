import fs from 'node:fs';
import {assertBuild} from './build-integrity.mjs';
assertBuild();
const deployment=JSON.parse(fs.readFileSync('deployment/verified-deployment.json'));
const stdJsonInput=JSON.parse(fs.readFileSync('artifacts/standard-input.json'));
const result=[];
for(const [name,key] of [['EchoLaunch','launch'],['EchoToken','token'],['EchoOracle','oracle']]){
 const address=deployment[key];
 try{
  const response=await fetch(`https://sourcify.dev/server/v2/verify/56/${address}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stdJsonInput,compilerVersion:'0.8.24+commit.e11b9ed9',contractIdentifier:`contracts/${name}.sol:${name}`,creationTransactionHash:deployment.hash}),signal:AbortSignal.timeout(30000)});
  const body=await response.json();result.push({name,address,httpStatus:response.status,...body});
 }catch(error){result.push({name,address,error:error.message});}
 fs.writeFileSync('deployment/sourcify-jobs.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.at(-1)));
}
