import fs from 'node:fs';
import path from 'node:path';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {inspectReleaseNetwork} from '../lib/release-preflight.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(process.argv.length>3)throw Error('Usage: node --use-env-proxy scripts/release-preflight.mjs [new-report.json]');
const destination=process.argv[2]?path.resolve(process.argv[2]):null;
if(destination&&fs.existsSync(destination))throw Error('Report already exists');
const configuration=inspectReleaseConfiguration(root),spec=JSON.parse(fs.readFileSync(path.join(root,'release/deployment-spec.confirmed.json'))),plan=await buildLaunchDeploymentPlan(spec),bindings=JSON.parse(fs.readFileSync(path.join(root,'evidence/public-bindings-bsc56.json')));
const endpoints=['https://bsc-dataseed.bnbchain.org','https://bsc-dataseed.bnbchain.org/'];
// A bounded retry on the same official host,not a silent switch to an unreviewed RPC.
let result;const attempts=[];
for(const endpoint of endpoints){const request=new FetchRequest(endpoint);request.timeout=12000;const provider=new JsonRpcProvider(request,{chainId:56,name:'bnb'},{staticNetwork:true,cacheTimeout:-1});try{result=await inspectReleaseNetwork(provider,{configuration,plan,bindings});attempts.push({endpoint,ok:true});break;}catch(error){attempts.push({endpoint,ok:false,error:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'RPC_READ_FAILED'});}finally{provider.destroy();}}
result=result?{...result,attempts}:{schema:'echo-launch-readonly-release-network/v1',observedAt:new Date().toISOString(),verified:false,attempts,readOnly:true,publicTransactions:false,executionReady:false,productionReady:false};
if(destination){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(result,null,2));if(result.verified===false)process.exitCode=1;
