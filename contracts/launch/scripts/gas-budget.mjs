import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..'),MAX=(1n<<256n)-1n;
function uint(value,{positive=false,max=MAX}={}){
 if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw Error('BUDGET_INTEGER');
 const n=BigInt(value);if(n>max||(positive&&n===0n))throw Error('BUDGET_RANGE');return n;
}
export function quoteGasBudget(measurement,plan,{gasPriceWei,marginBps='3000',availableWei=null}={}){
 if(measurement?.schema!=='echo-launch-local-gas/v1'||measurement.chainId!==31337||measurement.localOnly!==true||measurement.remoteWrites!==false||measurement.realWalletUsed!==false||measurement.completed!==true)throw Error('LOCAL_MEASUREMENT_REQUIRED');
 if(!Array.isArray(measurement.measurements)||!Array.isArray(plan)||!plan.length||plan.length>1000)throw Error('BUDGET_PLAN');
 const price=uint(gasPriceWei,{positive:true}),margin=uint(marginBps,{max:10000n}),available=availableWei===null?null:uint(availableWei);
 const known=new Map();for(const row of measurement.measurements){if(typeof row.id!=='string'||known.has(row.id))throw Error('MEASUREMENT_IDS');known.set(row.id,row);}
 const seen=new Set(),items=[];let total=0n;
 for(const item of plan){
  if(!item||typeof item.id!=='string'||seen.has(item.id)||!known.has(item.id))throw Error('BUDGET_OPERATION');seen.add(item.id);
  const count=uint(item.count,{positive:true,max:1000000n}),row=known.get(item.id),used=uint(row.gasUsed,{positive:true}),estimated=uint(row.estimatedGas,{positive:true});
  const baseline=used>estimated?used:estimated,reservedGas=(baseline*(10000n+margin)+9999n)/10000n,cost=reservedGas*price*count;
  if(cost>MAX||total+cost>MAX)throw Error('BUDGET_OVERFLOW');total+=cost;
  items.push({id:item.id,count:String(count),measuredGasUsed:String(used),estimatedGas:String(estimated),reservedGasPerTransaction:String(reservedGas),gasCostWei:String(cost)});
 }
 return {schema:'echo-launch-gas-budget/v1',gasPriceWei:String(price),gasPriceSource:'explicit-user-supplied-scenario;not-live-network',marginBps:String(margin),items,totalGasCostWei:String(total),availableWei:available===null?null:String(available),shortfallWei:available===null?null:String(total>available?total-available:0n),
  balanceChecked:false,funded:false,transactionValueIncluded:false,executionReady:false,financialExecutionAllowed:false,
  limitations:'Local receipt estimates are not a mainnet fee cap. Re-estimate each exact call and inspect the real wallet preview. Excludes principal,storage,RPC,review and operator costs;no budget or spending authority is granted.'};
}
export function verifyMeasurementInputs(measurement){
 if(!measurement?.inputHashes||!Object.keys(measurement.inputHashes).length)throw Error('MEASUREMENT_HASHES_REQUIRED');
 for(const [file,digest] of Object.entries(measurement.inputHashes)){
  const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==digest)throw Error('STALE_GAS_MEASUREMENT');
 }
 return true;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const {values:v}=parseArgs({options:{measurement:{type:'string'},plan:{type:'string'},'gas-price-wei':{type:'string'},'margin-bps':{type:'string'},'available-wei':{type:'string'}}});
  if(!v.plan||!v['gas-price-wei'])throw Error('PLAN_AND_GAS_PRICE_REQUIRED');
  const m=JSON.parse(fs.readFileSync(v.measurement??path.join(root,'evidence/gas-measurement.json'),'utf8'));verifyMeasurementInputs(m);
  console.log(JSON.stringify(quoteGasBudget(m,JSON.parse(fs.readFileSync(v.plan,'utf8')),{gasPriceWei:v['gas-price-wei'],marginBps:v['margin-bps']??'3000',availableWei:v['available-wei']??null}),null,2));
 }catch(error){console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'BUDGET_FAILED',executionReady:false}));process.exitCode=1;}
}
