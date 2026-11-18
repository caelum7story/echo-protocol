import {Buffer} from 'buffer';
// The official connector expects Node's Buffer in browser bundles.
if(!globalThis.Buffer)globalThis.Buffer=Buffer;
const valid=a=>/^0x[0-9a-fA-F]{40}$/.test(a)&&!/^0x0{40}$/i.test(a);
export function readerForProvider(provider) {
  return Object.freeze({
    async current(){const accounts=await provider.request({method:'eth_accounts'});if(!Array.isArray(accounts)||!valid(accounts[0]))return null;const chain=await provider.request({method:'eth_chainId'});return BigInt(chain)===56n?accounts[0]:null;},
    async connect() {
      const accounts=await provider.request({method:'eth_requestAccounts'});
      const chain=await provider.request({method:'eth_chainId'});
      if(BigInt(chain)!==56n)throw Error('WRONG_WALLET_NETWORK');
      if(!Array.isArray(accounts)||!valid(accounts[0]))throw Error('INVALID_WALLET_ACCOUNT');
      return accounts[0];
    },
    watch(onAccounts,onDisconnect) {
      const changed=accounts=>onAccounts(Array.isArray(accounts)&&valid(accounts[0])?accounts[0]:null);
      const chainChanged=()=>onAccounts(null);
      provider.on?.('accountsChanged',changed);provider.on?.('disconnect',onDisconnect);provider.on?.('chainChanged',chainChanged);
      return ()=>{provider.removeListener?.('accountsChanged',changed);provider.removeListener?.('disconnect',onDisconnect);provider.removeListener?.('chainChanged',chainChanged);};
    },
    async disconnect(){await provider.disconnect?.();}
  });
}
export async function createWalletReader({language='zh'}={}) {
  const {default:BinanceW3WProvider}=await import('@binance/w3w-ethereum-provider');
  // This reader exposes account connection only. No signing or transaction methods.
  return readerForProvider(new BinanceW3WProvider({chainId:56,lng:language==='zh'?'zh-CN':'en',showQrCodeModal:true}));
}
