import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EchoClient,DEPLOYMENT,normalizeHandle,identityId,launchInterface} from '../dist/chain.mjs';
import {buildLiveBrief,OFFICIAL_ORIGIN} from '../dist/live-brief.mjs';

test('live identity IDs normalize to the official keccak handle and reject injected names',()=>{
 assert.equal(normalizeHandle('ＣＣＨＥＮＪ.ai'),'cchenj');
 assert.equal(identityId('cchenj.ai').toString(),'65821149167781267211114398195832661484118989601885991434852065272232311585884');
 for(const name of ['<script>','a/b','someone.ai/','x?secret=1','a b',''])assert.throws(()=>normalizeHandle(name));
});

test('live Agent briefs preserve readiness, bounded consent, phase and pricing-version gates',()=>{
 const args={name:'cchenj',shares:2,referrer:'maomaojie',pricingVersion:1,preOpenCeilingWei:'4000000000000000'};
 for(const language of ['zh','en']){const brief=buildLiveBrief({...args,language});assert.match(brief,/executionReady/);assert.match(brief,/4000000000000000/);assert.match(brief,/pricingVersion/);assert.match(brief,/300/);assert.match(brief,/Transfer/);assert.match(brief,/--gas-cap-wei/);assert.match(brief,/ORACLE_NOT_READY/);assert.match(brief,/echobsc\.fun\/network\.json/);assert.match(brief,/bscscan\.com\/tx\//);}
 assert.throws(()=>buildLiveBrief({...args,referrer:'cchenj'}),/SELF_REFERRAL/);
 assert.throws(()=>buildLiveBrief({...args,shares:11}),/INVALID_QUANTITY/);
 const en=buildLiveBrief({...args,language:'en'}),zh=buildLiveBrief({...args,language:'zh'});
 assert.match(en,/not user payment consent/);assert.match(zh,/不是用户付款授权/);
 assert.match(en,/only after my explicit confirmation/);assert.match(zh,/取得我明确确认后/);
 for(const brief of [en,zh]){assert.match(brief,/binance\/binance-skills-hub/);assert.match(brief,/contract-call preview/);assert.match(brief,/sign-message preview/);assert.doesNotMatch(brief,/agentlife\.fun|WlRequest|wlSig|priceOf\(|100 ALIFE|mint\.active/);}
});

test('Agent metadata, bilingual briefs and result links use the verified custom origin',()=>{
 const network=JSON.parse(fs.readFileSync(new URL('../dist/network.json',import.meta.url)));
 const agent=JSON.parse(fs.readFileSync(new URL('../dist/agent.json',import.meta.url)));
 assert.equal(OFFICIAL_ORIGIN,'https://echobsc.fun');assert.equal(network.officialOrigin,OFFICIAL_ORIGIN);assert.equal(agent.officialOrigin,OFFICIAL_ORIGIN);
 assert.equal(network.launchPolicy.executionReady,network.executionReady,'Mint readiness must agree across public config sections');
 assert.equal(agent.executionReady,network.executionReady,'Agent and network Mint readiness must agree');
 assert.equal(network.rescuePolicy.executionReady,false,'Rescue execution is a separate authorization, not Mint readiness');
 for(const language of ['zh','en']){const brief=buildLiveBrief({name:'cchenj',shares:1,language});assert.match(brief,/https:\/\/echobsc\.fun\/agent\.json/);assert.match(brief,/https:\/\/echobsc\.fun\/\?tx=/);assert.doesNotMatch(brief,/zestyyew1024/);}
});

test('same-block activity pagination neither skips nor duplicates events',async()=>{
 const wallet='0x0282F738816d39bB07EAD0d5ea626Ff1b1FC1761';
 const logs=Array.from({length:100},(_,index)=>({...launchInterface.encodeEventLog(launchInterface.getEvent('Minted'),[wallet,identityId('cchenj'),0,1,1,0,10n**21n]),address:DEPLOYMENT.launch,blockNumber:100,index,transactionHash:'0x'+BigInt(index+1).toString(16).padStart(64,'0'),removed:false}));
 const provider={send:async()=> '0x64',getLogs:async({fromBlock,toBlock})=>fromBlock<=100&&toBlock>=100?logs:[]};
 const client=new EchoClient(provider,{deployment:{...DEPLOYMENT,block:1},verify:false});client.nameOfWallet=async()=> 'cchenj.ai';
 let beforeBlock=null,beforeIndex=null,seen=[];
 for(let n=0;n<4;n++){const page=await client.activity({beforeBlock,beforeIndex});seen.push(...page.events.map(e=>e.index));if(!page.nextCursor)break;beforeBlock=page.nextCursor.block;beforeIndex=page.nextCursor.index;}
 assert.equal(seen.length,100);assert.equal(new Set(seen).size,100);assert.equal(Math.min(...seen),0);assert.equal(Math.max(...seen),99);
});

test('the participant page has no wallet connection or transaction broadcaster and no simulated Mint action',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../dist/live-ui.mjs',import.meta.url),'utf8');
 assert.match(html,/live-ui.mjs/);assert.doesNotMatch(html,/src="\.\/app.js"|模拟一次 Mint|本机模拟订单|PRIVATE PREVIEW/);
 assert.doesNotMatch(ui,/eth_sendTransaction|eth_requestAccounts|personal_sign|eth_signTypedData/);
});
