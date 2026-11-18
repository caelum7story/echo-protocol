import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptErrorPresentation,receiptExplorerLink} from '../dist/receipt-errors.mjs';
test('archive RPC rejection stays an incomplete lookup rather than a failed or missing Mint',()=>{
 const error={code:'SERVER_ERROR',shortMessage:'server response 403 Forbidden',info:{responseBody:'{"error":{"code":-32602,"message":"Archive requests require a personal token"}}'}};
 for(const lang of ['zh','en']){const view=receiptErrorPresentation(error,lang);assert.equal(view.kind,'history-unavailable');assert.equal(view.retryable,true);assert.ok(view.message.length>20);assert.doesNotMatch(view.message,/personal token|403|SERVER_ERROR/);}
 assert.notEqual(receiptErrorPresentation(error,'zh').message,receiptErrorPresentation(error,'en').message);
});
test('contract and event mismatches remain distinct from transport failures',()=>{
 for(const [code,kind]of [['WRONG_TRANSACTION_CONTRACT','wrong-contract'],['MINT_EVENT_MISSING','not-mint'],['TOKEN_DELIVERY_EVENT_MISSING','delivery-unverified']]){const view=receiptErrorPresentation(Error(code),'en');assert.equal(view.kind,kind);assert.equal(view.retryable,false);}
 const unavailable=receiptErrorPresentation({shortMessage:'network unavailable'},'en');assert.equal(unavailable.kind,'unavailable');assert.equal(unavailable.retryable,true);
});
test('only complete transaction hashes can produce an explorer link',()=>{
 const hash='0x'+'ab'.repeat(32);assert.equal(receiptExplorerLink(hash),'https://bscscan.com/tx/'+hash);
 for(const value of ['',hash+'?redirect=https://example.com','javascript:alert(1)','0x1234','<script>'])assert.equal(receiptExplorerLink(value),null);
 assert.equal(receiptErrorPresentation(Error('INVALID_TRANSACTION_HASH')).retryable,false);
});
