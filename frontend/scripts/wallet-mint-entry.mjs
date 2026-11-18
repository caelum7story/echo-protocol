import {Buffer} from 'buffer';
import {walletTransport} from '../public/mint-wallet-flow.mjs';
if(!globalThis.Buffer)globalThis.Buffer=Buffer;
export async function createMintWallet({language='zh',kind='binance'}={}){
 if(kind==='browser'){
  const provider=globalThis.binancew3w?.ethereum??globalThis.ethereum;
  if(!provider?.request)throw Error('NO_BROWSER_WALLET');
  return walletTransport(provider);
 }
 const {default:BinanceW3WProvider}=await import('@binance/w3w-ethereum-provider');
 return walletTransport(new BinanceW3WProvider({chainId:56,lng:language==='en'?'en':'zh-CN',showQrCodeModal:true}));
}
