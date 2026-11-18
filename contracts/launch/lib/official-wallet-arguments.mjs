// Pure argument construction. No CLI import,credentials,network or execution.
const fail=code=>{throw Error(code);};
export function officialWalletArguments(input){
 if(input.command==='settings')return ['wallet','settings'];
 if(input.command==='address')return ['wallet','address'];
 if(input.command==='execute'&&/^[A-Za-z0-9_-]{16,128}$/.test(input.requestId??''))return ['contract-call','execute','--requestId',input.requestId];
 if(input.command!=='preview')fail('WALLET_TRANSPORT_COMMAND');
 const tx=input.transaction;
 if(tx?.chainId!==56||!/^0x[0-9a-fA-F]{40}$/.test(tx.from??'')||!/^0x[0-9a-fA-F]{40}$/.test(tx.to??'')||String(tx.value)!=='0'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data??''))fail('WALLET_PREVIEW_SCOPE');
 const args=['contract-call','preview','--binanceChainId','56','--from',tx.from,'--to',tx.to,'--value','0','--inputData',tx.data];
 if(tx.gasLimit!==undefined){if(!/^[0-9]+$/.test(String(tx.gasLimit))||!Number.isSafeInteger(Number(tx.gasLimit))||Number(tx.gasLimit)<21000||Number(tx.gasLimit)>15000000)fail('WALLET_GAS_LIMIT_RANGE');args.push('--gasLimit',String(tx.gasLimit));}
 return args;
}
