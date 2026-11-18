import {RULES,economics,integer,parseBnb,stringify} from './core.mjs';
export const OPERATING_SCHEMA='echo-launch-operating-inputs/v1';
export const COST_FIELDS=['budgetBnb','beforeFeeBnb','afterFeeBnb','failureExtraBnb','recipientCount','batchSize','batchCostBnb','customUnits'];
export function defaultOperatingInputs(type='token'){
 return {mode:type==='nft'?'sold-out':'minimum',budgetBnb:'',beforeFeeBnb:'',afterFeeBnb:'',failureExtraBnb:'',recipientCount:'',batchSize:'',batchCostBnb:'',customUnits:''};
}
export function normalizeOperatingInputs(raw={},type='token'){
 const out=defaultOperatingInputs(type);
 if(['minimum','sold-out','custom'].includes(raw?.mode))out.mode=raw.mode;
 if(type==='nft')out.mode='sold-out';
 for(const key of COST_FIELDS)out[key]=typeof raw?.[key]==='string'?raw[key].trim().slice(0,100):'';
 return out;
}
export function operatingRecord(raw={},type='token'){
 return {schema:OPERATING_SCHEMA,source:raw.source==='illustrative-example'?'illustrative-example':'manual-unverified',
  inputs:normalizeOperatingInputs(raw.inputs??raw,type),updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:null};
}
export function illustrativeOperatingInputs(type='token'){
 return {...defaultOperatingInputs(type),budgetBnb:'0',beforeFeeBnb:'0.005',afterFeeBnb:'0.002',failureExtraBnb:'0.001',
  ...(type==='token'?{recipientCount:'100',batchSize:'25',batchCostBnb:'0.001'}:{})};
}
const ceilDiv=(a,b)=>(a+b-1n)/b;
const positiveGap=(need,available)=>need>available?need-available:0n;
function projectEconomics(raw){
 if(!raw||!['nft','token'].includes(raw.type)||String(raw.price??'').length>90||String(raw.minimumRaise??'').length>90||String(raw.nftSupply??'').length>18)throw Error('COST_PROJECT');
 const e=economics(raw);
 if(raw.type==='token'&&(e.minimumWei<=0n||e.minimumWei>e.maxRaiseWei))throw Error('COST_PROJECT');
 return e;
}
export function evaluateOperatingPlan(project,rawInputs={}){
 const inputs=normalizeOperatingInputs(rawInputs,project?.type),errors={},unknown=[];let e;
 try{e=projectEconomics(project);}catch{return {schema:'echo-launch-operating-result/v1',executionReady:false,inputs,errors:{project:'COST_PROJECT'},unknown:[],status:'invalid-project'};}
 function amount(key){if(inputs[key]===''){unknown.push(key);return null;}try{if(inputs[key].length>90)throw Error();return parseBnb(inputs[key]);}catch{errors[key]='COST_BNB';return null;}}
 function count(key,{zero=false}={}){if(inputs[key]===''){unknown.push(key);return null;}try{return integer(inputs[key],{zero});}catch{errors[key]='COST_INTEGER';return null;}}
 const budgetWei=amount('budgetBnb'),beforeFeeWei=amount('beforeFeeBnb'),afterFeeWei=amount('afterFeeBnb'),failureExtraWei=amount('failureExtraBnb');
 const minimumUnits=project.type==='nft'?e.publicUnits:ceilDiv(e.minimumWei,e.priceWei);
 let units=inputs.mode==='sold-out'?e.publicUnits:inputs.mode==='minimum'?minimumUnits:count('customUnits',{zero:true});
 if(units!==null&&units>e.publicUnits){errors.customUnits='COST_QUANTITY';units=null;}
 const raisedWei=units===null?null:units*e.priceWei;
 const eligible=raisedWei!==null&&(project.type==='nft'?units===e.publicUnits:raisedWei>=e.minimumWei);
 const rate=BigInt(project.type==='nft'?RULES.nftSplit.platform:RULES.tokenSplit.platform);
 const serviceFeeWei=raisedWei===null?null:eligible?raisedWei*rate/100n:0n;
 const maxServiceFeeWei=e.maxRaiseWei*rate/100n;
 let recipients=null,batchSize=null,batchCostWei=null,batches=0n,deliveryCostWei=0n;
 if(project.type==='token'){
  recipients=count('recipientCount');batchSize=count('batchSize');batchCostWei=amount('batchCostBnb');
  if(eligible&&recipients!==null&&recipients>units)errors.recipientCount='COST_RECIPIENTS';
  batches=recipients===null||batchSize===null?null:ceilDiv(recipients,batchSize);
  deliveryCostWei=batches===null||batchCostWei===null?null:batches*batchCostWei;
 }
 const successCostKnown=[beforeFeeWei,afterFeeWei,deliveryCostWei].every(v=>v!==null);
 const successCostWei=successCostKnown?beforeFeeWei+afterFeeWei+deliveryCostWei:null;
 const contributionWei=eligible&&successCostWei!==null?serviceFeeWei-successCostWei:null;
 const startupGapWei=budgetWei!==null&&beforeFeeWei!==null?positiveGap(beforeFeeWei,budgetWei):null;
 const completionGapWei=eligible&&successCostWei!==null&&budgetWei!==null?positiveGap(successCostWei,budgetWei+serviceFeeWei):null;
 const failureCostWei=beforeFeeWei!==null&&failureExtraWei!==null?beforeFeeWei+failureExtraWei:null;
 const failureFundingGapWei=failureCostWei!==null&&budgetWei!==null?positiveGap(failureCostWei,budgetWei):null;
 let referenceUnits=null,referenceRaiseWei=null,referenceAttainable=null;
 if(successCostWei!==null){
  const feeCoverageUnits=ceilDiv(ceilDiv(successCostWei*100n,rate),e.priceWei);
  referenceUnits=project.type==='nft'?e.publicUnits:feeCoverageUnits>minimumUnits?feeCoverageUnits:minimumUnits;
  referenceRaiseWei=referenceUnits*e.priceWei;
  referenceAttainable=referenceUnits<=e.publicUnits&&referenceRaiseWei*rate/100n>=successCostWei;
 }
 let status='unknown';
 if(Object.keys(errors).length)status='invalid-inputs';
 else if(!eligible&&raisedWei!==null)status='below-success-condition';
 else if(startupGapWei!==null&&startupGapWei>0n)status='startup-gap';
 else if(contributionWei!==null&&contributionWei<0n)status='issuance-cost-shortfall';
 else if(contributionWei!==null&&startupGapWei===0n)status='covered-under-assumptions';
 return {schema:'echo-launch-operating-result/v1',chainId:56,rulesVersion:RULES.version,executionReady:false,
  inputs,errors,unknown,status,type:project.type,publicUnits:e.publicUnits,unitPriceWei:e.priceWei,
  minimumRaiseWei:e.minimumWei,maxRaiseWei:e.maxRaiseWei,units,raisedWei,eligible,platformPercent:Number(rate),serviceFeeWei,maxServiceFeeWei,
  budgetWei,beforeFeeWei,afterFeeWei,recipients,batchSize,batchCostWei,batches,deliveryCostWei,successCostWei,
  contributionWei,startupGapWei,completionGapWei,failureExtraWei,failureCostWei,failureFundingGapWei,
  referenceUnits,referenceRaiseWei,referenceAttainable,
  theoreticalMinimumIdentities:project.type==='token'&&units!==null?ceilDiv(units,RULES.tokenIdentityCap):null,
  assumptionsOnly:true,liveGasEstimated:false,walletBalanceVerified:false,
  excludedIncome:['future secondary-market tax','voluntary-exit fees','token price appreciation'],
  notes:['All costs and available budget are manual assumptions, not wallet balances or gas quotes.',
   'Successful issuance fees are unavailable before settlement; escrowed principal is not platform operating cash.',
   'NFT claim-caller Gas is outside this platform-cost scope; platform subsidies belong in the manually entered costs.',
   'Recipient wallets are not subscription units and are not necessarily .ai identities.',
   'The coverage reference holds the entered recipient count and cost assumptions fixed; it never edits the project minimum or fee rules.']};
}
export function operatingManifest(project,record,{projectId='local-preview',now=Date.now()}={}){
 const normalized=operatingRecord(record,project.type);
 return {schema:'echo-launch-operating-plan/v1',projectId,project:{type:project.type,name:project.name,symbol:project.symbol},
  createdAt:new Date(now).toISOString(),executionReady:false,unsignedTransaction:null,
  source:normalized.source,assumptions:normalized.inputs,result:evaluateOperatingPlan(project,normalized.inputs),
  warning:'Planning assumptions only. No live gas estimate, verified wallet balance, contract security review or profit guarantee. Do not spend or authorize a transaction from this file.'};
}
export function operatingBrief(manifest,lang='zh'){
 return (lang==='zh'?'只读复核这份 ECHO Launch 运营测算。所有预算与成本都是未核实的假设，不是 Gas 报价或钱包余额。检查成功与失败两条路径、启动资金缺口及固定分账。不得签名、授权或发起交易，不得用用户托管本金填补平台运营费用。':'Review this ECHO Launch operating plan read-only. Budget/costs are unverified assumptions, not gas quotes or wallet balances. Check success, failure, startup funding and fixed splits. Do not sign, approve or transact, or use escrowed user principal to fund platform operations.')+'\n\nBEGIN UNTRUSTED PLANNING DATA\n'+stringify(manifest)+'\nEND UNTRUSTED PLANNING DATA';
}
