const messages={
 INVALID_TRANSACTION_HASH:{kind:'invalid-hash',retryable:false,text:['请输入完整的交易哈希，再重新查询。','Enter a complete transaction hash before querying again.']},
 WRONG_TRANSACTION_CONTRACT:{kind:'wrong-contract',retryable:false,text:['这笔交易不是发给 ECHO Mint 合约的，不能作为 ECHO 铸造凭证。','This transaction is not for the ECHO Mint contract and cannot establish an ECHO Mint.']},
 MINT_EVENT_MISSING:{kind:'not-mint',retryable:false,text:['未找到 ECHO Mint 事件。交易成功也不代表 ECHO 已铸造，请核对哈希和合约。','No ECHO Mint event was found. Transaction success alone does not establish an ECHO Mint; check the hash and contract.']},
 TOKEN_DELIVERY_EVENT_MISSING:{kind:'delivery-unverified',retryable:false,text:['未找到与 Mint 记录一致的同笔 ECHO 到账事件，尚不能确认已到账。','A matching ECHO transfer was not found in the Mint transaction. Token delivery is not confirmed.']}
};
export function receiptErrorPresentation(error,language='zh'){
 const code=String(error?.shortMessage||error?.message||error||'');
 let result=messages[code];
 if(!result){
  const detail=[code,error?.info?.responseBody,error?.error?.message,error?.info?.error?.message].filter(x=>typeof x==='string').join(' ').slice(0,8192);
  result=/archive requests require|historical (?:state|data).*unavailable|missing trie node|pruned (?:history|data|transaction)/i.test(detail)
   ?{kind:'history-unavailable',retryable:true,text:['当前公共节点无法读取这笔较早交易，核验尚未完成。可重试，或到 BscScan 核对。','The public RPC cannot read this older transaction. Verification is incomplete. Retry or check BscScan.']}
   :{kind:'unavailable',retryable:true,text:['本次回执读取未完成，不能据此判断 Mint 是否成功。请重试，或到 BscScan 核对。','The receipt could not be read. This does not establish Mint success or failure. Retry or check BscScan.']};
 }
 return {kind:result.kind,retryable:result.retryable,message:result.text[language==='en'?1:0]};
}
export function receiptExplorerLink(hash){return /^0x[0-9a-f]{64}$/i.test(hash)?'https://bscscan.com/tx/'+hash:null;}
