// Read-only export for project-wallet reconciliation. Cannot sign or broadcast.
import fs from 'node:fs/promises';
import path from 'node:path';
import {connectClient,jsonSafe} from '../dist/chain.mjs';
import {readGrowthReport,reconcileGrowthPayouts} from '../dist/growth-campaign-chain.mjs';
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--out','--paid-ledger'].includes(args[i])||!args[i+1])throw Error('Use --out <new-report.json> [--paid-ledger <payments.json>]');options[args[i]]=args[i+1];}
if(!options['--out'])throw Error('Use --out <new-report.json> [--paid-ledger <payments.json>]');
const target=path.resolve(options['--out']);let client;
try{client=await connectClient();const raw=await readGrowthReport(client);const ledger=options['--paid-ledger']?JSON.parse(await fs.readFile(options['--paid-ledger'],'utf8')):[];const report=await reconcileGrowthPayouts(client,raw,ledger);await fs.writeFile(target,JSON.stringify(jsonSafe({createdAt:new Date().toISOString(),broadcast:false,ledgerProvided:!!options['--paid-ledger'],...report}),null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:target,block:report.snapshotBlock,eligibleOrders:report.eligibleOrders,teams:report.leaderboard.length,broadcast:false,ledgerProvided:!!options['--paid-ledger']}));}finally{client?.destroy();}
