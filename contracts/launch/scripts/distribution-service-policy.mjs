import {getAddress} from 'ethers';
import {budgetDigest} from './distribution-budget.mjs';
const fail=code=>{throw Error(code);},integer=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail('QUEUE_SERVICE_POLICY');return value;};
export function normalizeServicePolicy(input,{chainId,wallet}){
 if(input?.schema!=='echo-launch-readonly-service-policy/v1'||input.chainId!==chainId||typeof input.enabled!=='boolean')fail('QUEUE_SERVICE_POLICY');let normalized;try{normalized=getAddress(input.wallet).toLowerCase();if(normalized!==getAddress(wallet).toLowerCase())fail('QUEUE_SERVICE_POLICY');}catch{fail('QUEUE_SERVICE_POLICY');}
 const policy={schema:input.schema,chainId,wallet:normalized,enabled:input.enabled,intervalMs:integer(input.intervalMs,chainId===31337?100:10000,300000),leaseMs:integer(input.leaseMs,1000,300000),maxCycleAgeMs:integer(input.maxCycleAgeMs,1000,3600000),maxSweepAgeMs:integer(input.maxSweepAgeMs,1000,3600000),maxBlockAgeSeconds:integer(input.maxBlockAgeSeconds,10,600),monitorBatchSize:integer(input.monitorBatchSize,1,100),receiptBatchSize:integer(input.receiptBatchSize,1,100)};
 if(policy.leaseMs<policy.intervalMs*2||policy.maxCycleAgeMs<policy.intervalMs*2||policy.maxSweepAgeMs<policy.maxCycleAgeMs)fail('QUEUE_SERVICE_POLICY');return {...policy,policyHash:budgetDigest(policy),financialAuthorization:false};
}
