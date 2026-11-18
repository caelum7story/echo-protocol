// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

// Test doubles only. They are never eligible as production DEX or identity deployments.
contract MockIdentity {
    mapping(uint256 => address) public ownerOf;
    mapping(address => string) public handleOf;
    function setOwner(uint256 id, address owner) external { ownerOf[id] = owner; }
    function register(string calldata handle, address wallet) external {
        ownerOf[uint256(keccak256(bytes(handle)))] = wallet; handleOf[wallet] = handle;
    }
}

contract MockWBNB is ERC20("Wrapped Test BNB", "WBNB") {
    function deposit() external payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value:amount}(""); require(ok);
    }
}

contract MockPair {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private reserveTimestamp;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    constructor(address a, address b) {
        factory = msg.sender; (token0, token1) = a < b ? (a,b) : (b,a);
    }
    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0,reserve1,reserveTimestamp);
    }
    function _sync() internal {
        uint32 timestamp = uint32(block.timestamp);
        unchecked {
            uint32 elapsed = timestamp - reserveTimestamp;
            if (reserve0 != 0 && reserve1 != 0) {
                price0CumulativeLast += ((uint256(reserve1)<<112)/reserve0)*elapsed;
                price1CumulativeLast += ((uint256(reserve0)<<112)/reserve1)*elapsed;
            }
        }
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));
        require(b0 <= type(uint112).max && b1 <= type(uint112).max);
        reserve0 = uint112(b0); reserve1 = uint112(b1); reserveTimestamp = timestamp;
    }
    function sync() external { _sync(); }
    function mint(address to) external returns (uint256 lp) {
        uint256 a = IERC20(token0).balanceOf(address(this)) - reserve0;
        uint256 b = IERC20(token1).balanceOf(address(this)) - reserve1;
        if (totalSupply == 0) {
            lp = Math.sqrt(a*b) - 1000;
            totalSupply = 1000; balanceOf[address(0)] = 1000;
        } else lp = Math.min(a*totalSupply/reserve0,b*totalSupply/reserve1);
        require(lp > 0); totalSupply += lp; balanceOf[to] += lp;
        _sync();
    }
    function swapOut(address asset, uint256 amount, address to) external {
        require(asset == token0 || asset == token1);
        require(IERC20(asset).transfer(to,amount)); _sync();
    }
}

contract MockFactory {
    mapping(address => mapping(address => address)) public getPair;
    function createPair(address a, address b) external returns (address p) {
        require(getPair[a][b] == address(0));
        p = address(new MockPair(a,b)); getPair[a][b] = p; getPair[b][a] = p;
    }
}

contract MockRouter {
    address public immutable factory;
    address public immutable WETH;
    constructor(address f, address w) { factory=f; WETH=w; }
    function getAmountsOut(uint256 amount, address[] calldata path) public view returns (uint256[] memory out) {
        require(path.length == 2 && path[1] == WETH);
        MockPair p = MockPair(MockFactory(factory).getPair(path[0],path[1]));
        (uint112 r0,uint112 r1,) = p.getReserves();
        (uint256 ri,uint256 ro) = p.token0()==path[0] ? (uint256(r0),uint256(r1)) : (uint256(r1),uint256(r0));
        uint256 net = amount*9975;
        out = new uint256[](2); out[0]=amount; out[1]=net*ro/(ri*10000+net);
    }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amount, uint256 minOut,
        address[] calldata path, address to, uint256 deadline) external {
        require(block.timestamp <= deadline);
        uint256 out = getAmountsOut(amount,path)[1]; require(out >= minOut);
        address p = MockFactory(factory).getPair(path[0],path[1]);
        uint256 beforeTokens = IERC20(path[0]).balanceOf(p);
        require(IERC20(path[0]).transferFrom(msg.sender,p,amount));
        require(IERC20(path[0]).balanceOf(p)-beforeTokens == amount); // conversion is the fixed exempt path
        MockPair(p).swapOut(WETH,out,address(this));
        MockWBNB(WETH).withdraw(out);
        (bool ok,) = to.call{value:out}(""); require(ok);
    }
    receive() external payable {}
}

interface ICreditEscrow {
    function withdrawCreditFor(address payable recipient) external;
}
interface INftClaims {
    function claimFor(address wallet, uint256[] calldata ids) external;
}
contract RecipientHarness {
    bool public reject;
    bool public attack;
    address public target;
    uint256 public received;
    uint256 public reentryFailures;
    function configure(bool r, bool a, address t) external { reject=r; attack=a; target=t; }
    receive() external payable {
        require(!reject);
        received += msg.value;
        if (attack) {
            try ICreditEscrow(target).withdrawCreditFor(payable(address(this))) {} catch { ++reentryFailures; }
        }
    }
    function subscribe(address to, uint256 identityId, uint256 units) external payable {
        (bool ok,) = to.call{value:msg.value}(abi.encodeWithSignature("subscribe(uint256,uint256,bytes32,uint256)",identityId,units,keccak256(abi.encode(address(this),block.number)),block.timestamp+300)); require(ok);
    }
    function onERC721Received(address,address,uint256 id,bytes calldata) external returns (bytes4) {
        if (attack) {
            uint256[] memory ids = new uint256[](1); ids[0]=id;
            try INftClaims(target).claimFor(address(this),ids) {} catch { ++reentryFailures; }
        }
        return this.onERC721Received.selector;
    }
}
