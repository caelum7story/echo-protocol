#!/usr/bin/env node
// Read-only preparation: this program cannot sign or broadcast a transaction.
import {connectClient,jsonSafe} from '../chain.mjs';
const args=process.argv.slice(2),command=args.shift()||'status',options={};
for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||args[i+1]===undefined)throw Error('Use --option value');options[args[i].slice(2)]=args[i+1];}
const c=await connectClient();
try{
 let result;
 if(command==='status')result=await c.state();
 else if(command==='identity'){const name=options.name||await c.registry.handleOf(options.wallet);if(!name)throw Error('NO_OFFICIAL_IDENTITY');result=await c.identity(name,await c.state());}
 else if(command==='quote')result=await c.prepareMint({name:options.name,shares:options.shares,referrer:options.referrer,wallet:options.wallet,maxCost:options['max-cost-wei'],gasCap:options['gas-cap-wei'],expectedVersion:options['expected-version']});
 else if(command==='receipt')result=await c.receipt(options.hash);
 else if(command==='activity')result=await c.activity({name:options.name,beforeBlock:options['before-block']===undefined?null:Number(options['before-block']),beforeIndex:options['before-index']===undefined?null:Number(options['before-index'])});
 else if(command==='maintenance')result=await c.prepareMaintenance({gasCap:options['gas-cap-wei']});
 else throw Error('Commands: status, identity, quote, receipt, activity, maintenance');
 console.log(JSON.stringify(jsonSafe({ok:true,chainId:56,broadcast:false,result}),null,2));
}catch(e){console.log(JSON.stringify({ok:false,broadcast:false,error:e.shortMessage||e.message}));process.exitCode=1;}finally{c.destroy();}
