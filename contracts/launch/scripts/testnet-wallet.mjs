import fs from 'node:fs/promises';
import path from 'node:path';
import {FetchRequest, JsonRpcProvider, formatEther} from 'ethers';
import {createTestWallet, testWalletInfo, verifyTestWallet} from '../lib/testnet-wallet.mjs';

const [action, directory, output] = process.argv.slice(2);
if (!['init','status','verify','preflight'].includes(action) || !directory) throw Error('Usage: testnet-wallet.mjs init|status|verify|preflight <private-directory> [new-public-report.json]');
let result;
if (action === 'init') result = await createTestWallet(directory);
else if (action === 'verify') result = await verifyTestWallet(directory);
else if (action === 'status') result = await testWalletInfo(directory);
else {
  const info = await verifyTestWallet(directory);
  const request = new FetchRequest('https://bsc-testnet-dataseed.bnbchain.org');
  request.timeout = 12000;
  const provider = new JsonRpcProvider(request, undefined, {cacheTimeout:-1});
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== 97n) throw Error('TEST_WALLET_WRONG_CHAIN');
    const block = await provider.getBlock('latest');
    if (!block || Date.now()/1000-block.timestamp > 120 || block.timestamp > Date.now()/1000+30) throw Error('TEST_WALLET_STALE_BLOCK');
    const [balance, nonce, gasPrice] = await Promise.all([provider.getBalance(info.address, block.number),provider.getTransactionCount(info.address, block.number),provider.send('eth_gasPrice',[])]);
    const recheck = await provider.getBlock(block.number);
    if (recheck?.hash !== block.hash) throw Error('TEST_WALLET_BLOCK_CHANGED');
    result = {...info, observedAt:new Date().toISOString(), block:{number:block.number,hash:block.hash,timestamp:block.timestamp},
      balanceWei:String(balance), balanceTbnb:formatEther(balance), nonce, gasPriceWei:String(BigInt(gasPrice)),
      hasTestFunds:balance>0n, publicRpcVerified:true, readOnly:true, transactionSent:false};
  } finally { provider.destroy(); }
}
if (output) {await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(result,null,2));
