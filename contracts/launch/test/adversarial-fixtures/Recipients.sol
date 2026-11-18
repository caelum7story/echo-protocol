// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

// Deliberately adversarial LOCAL TEST ACTORS. Not a wallet or production contract.
contract CallbackRecipient {
    uint256 public nativeMode;
    uint256 public nftMode;
    uint256 public failNftId;
    address public target;
    bytes public callback;
    uint256 public receivedBnb;
    uint256 public nftCallbacks;
    uint256 public reentryAttempts;
    uint256 public reentryFailures;
    bytes4 public lastError;

    function configure(uint256 n, uint256 nft, uint256 failId, address t, bytes calldata data) external {
        nativeMode = n; nftMode = nft; failNftId = failId; target = t; callback = data;
    }
    function invoke(address to, bytes calldata data) external payable returns (bytes memory result) {
        (bool ok, bytes memory value) = to.call{value:msg.value}(data);
        if (!ok) assembly ("memory-safe") { revert(add(value, 32), mload(value)) }
        return value;
    }
    function _attempt(bool propagate) private {
        ++reentryAttempts;
        (bool ok, bytes memory reason) = target.call(callback);
        if (!ok) {
            ++reentryFailures;
            if (reason.length >= 4) lastError = bytes4(reason);
            if (propagate) assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        }
    }
    receive() external payable {
        if (nativeMode == 1) revert("NATIVE_REJECTED");
        if (nativeMode == 4) { while (true) {} }
        receivedBnb += msg.value;
        if (nativeMode == 2 || nativeMode == 3) _attempt(nativeMode == 3);
    }
    function onERC721Received(address, address, uint256 id, bytes calldata) external returns (bytes4) {
        ++nftCallbacks;
        if (failNftId == 0 || failNftId == id) {
            if (nftMode == 1) revert("NFT_REJECTED");
            if (nftMode == 2) return 0xdeadbeef;
            if (nftMode == 3) _attempt(false);
            if (nftMode == 4) { while (true) {} }
        }
        return this.onERC721Received.selector;
    }
}

// Constructor creates and destroys the same local actor. No rescue permission is added.
contract ForceNative {
    constructor(address payable recipient) payable { selfdestruct(recipient); }
}
