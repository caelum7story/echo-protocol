import {EventEmitter} from 'node:events';
import {EdrContext,ContractDecoder,GENERIC_CHAIN_TYPE,genericChainProviderFactory,l1GenesisState,l1HardforkFromString,MineOrdering,GasEstimationMode} from '@nomicfoundation/edr';
import {Wallet,getBytes,toBeHex} from 'ethers';

// Exact-pinned native EDR, exposed only in-process. Deterministic synthetic keys below are TEST fixtures.
// No external RPC, HTTP server, wallet file, secret or remote signer is read by this harness.
const context=new EdrContext();
await context.registerProviderFactory(GENERIC_CHAIN_TYPE,genericChainProviderFactory());
const accounts=Array.from({length:40},(_,i)=>new Wallet(toBeHex(i+1,32)));
const balance=10_000n*10n**18n;
export async function createLocalChain({runtimeCodes=[]}={}){
 for(const {address,code} of runtimeCodes){
  if(!/^0x[0-9a-fA-F]{40}$/.test(address)||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)||accounts.some(w=>w.address.toLowerCase()===address.toLowerCase()))throw Error('Invalid isolated runtime fixture');
 }
 const config={
  allowBlocksWithSameTimestamp:true,allowUnlimitedContractSize:false,
  bailOnCallFailure:true,bailOnTransactionFailure:true,
  chainId:31337n,networkId:31337n,coinbase:new Uint8Array(20),
  defaultTransactionGasLimit:30_000_000n,gasEstimationMode:GasEstimationMode.NoInternalOutOfGas,
  genesisState:[...l1GenesisState(l1HardforkFromString('shanghai')),...accounts.map(w=>({address:getBytes(w.address),balance,code:new Uint8Array()})),
   ...runtimeCodes.map(c=>({address:getBytes(c.address),balance:0n,code:getBytes(c.code)}))],
  hardfork:'shanghai',initialBaseFeePerGas:1_000_000_000n,minGasPrice:0n,
  mining:{autoMine:true,blockGasLimit:30_000_000n,memPool:{order:MineOrdering.Fifo}},
  network:{genesisBlockGasLimit:30_000_000n,genesisBlockTime:1_794_000_000n},
  observability:{},ownedAccounts:accounts.map(w=>w.privateKey),precompileOverrides:[]
 };
 let native=await context.createProvider(GENERIC_CHAIN_TYPE,config,
  {enable:false,decodeConsoleLogInputsCallback:()=>[],printLineCallback:()=>{}},
  {subscriptionCallback:()=>{}},new ContractDecoder());
 let id=0,closed=false;
 const provider=new EventEmitter();
 provider.request=async({method,params=[]})=>{
  if(closed)throw Error('Local test provider closed');
  const response=await native.handleRequest(JSON.stringify({jsonrpc:'2.0',id:++id,method,params}));
  const data=typeof response.data==='string'?JSON.parse(response.data):response.data;
  if(data.error)throw Object.assign(new Error(data.error.message),data.error);
  return data.result;
 };
 return {provider,close:async()=>{closed=true;provider.removeAllListeners();native=undefined;}};
}
