import {createLocalChain} from '../test/local-chain.mjs';
const connection=await createLocalChain();
try{
 const chainId=await connection.provider.request({method:'eth_chainId',params:[]});
 const accounts=await connection.provider.request({method:'eth_accounts',params:[]});
 console.log(JSON.stringify({engine:'EDR0.25.1',chainId:Number(BigInt(chainId)),testAccounts:accounts.length,externalRpc:false,serverStarted:false}));
}finally{await connection.close();}
