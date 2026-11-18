// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IV2Factory, IV2Pair, IV2Router} from "./DexInterfaces.sol";

/// @notice Non-upgradeable 1B genesis supply. Only the immutable official-pair incoming transfer is taxed.
contract LaunchToken is ERC20, ReentrancyGuard {
    uint256 public constant GENESIS_SUPPLY = 1_000_000_000 ether;
    uint256 public constant TAX_BPS = 200;
    uint256 public constant MAX_SWAP_RESERVE_BPS = 100;
    uint256 public constant MAX_SHORTFALL_BPS = 300;
    address public immutable sale;
    address public immutable pair;
    address public immutable router;
    address public immutable wbnb;
    address public immutable creatorRecipient;
    address public immutable platformRecipient;
    uint256 public immutable oracleWindow;
    uint256 public immutable oracleMaxAge;
    bool public launched;
    bool private converting;
    uint256 public collectedTax;
    mapping(address => uint256) public taxBnbCredit;
    uint256 public totalTaxBnbCredit;
    uint256 public cumulativeObservation;
    uint32 public observationTimestamp;
    uint256 public averagePriceX112;
    uint256 public averageUpdatedAt;

    error Forbidden();
    error BadConfiguration();
    error PriceUnavailable();
    error PriceProtection();
    error InvalidAmount();
    error TransferFailed();
    event TradingOpened();
    event OracleUpdated(uint256 averagePriceX112, uint256 observedAt);
    event TaxConverted(uint256 tokens, uint256 bnb, uint256 minOut);
    event TaxWithdrawn(address indexed recipient, uint256 bnb);

    constructor(string memory name_, string memory symbol_, address factory_, address router_, address wbnb_,
        address creator_, address platform_, uint256 window_, uint256 maxAge_) ERC20(name_, symbol_)
    {
        if (factory_.code.length == 0 || router_.code.length == 0 || wbnb_.code.length == 0
            || creator_ == address(0) || platform_ == address(0) || window_ == 0 || maxAge_ < window_
            || IV2Router(router_).factory() != factory_ || IV2Router(router_).WETH() != wbnb_)
            revert BadConfiguration();
        sale = msg.sender;
        router = router_;
        wbnb = wbnb_;
        creatorRecipient = creator_;
        platformRecipient = platform_;
        oracleWindow = window_;
        oracleMaxAge = maxAge_;
        address p = IV2Factory(factory_).getPair(address(this), wbnb_);
        if (p == address(0)) p = IV2Factory(factory_).createPair(address(this), wbnb_);
        if (p.code.length == 0 || IV2Pair(p).factory() != factory_
            || !((IV2Pair(p).token0() == address(this) && IV2Pair(p).token1() == wbnb_)
            || (IV2Pair(p).token1() == address(this) && IV2Pair(p).token0() == wbnb_)))
            revert BadConfiguration();
        pair = p;
        _mint(msg.sender, GENESIS_SUPPLY);
    }

    function burnSaleInventory(uint256 amount) external {
        if (msg.sender != sale || launched) revert Forbidden();
        _burn(sale, amount);
    }

    function openTrading() external {
        if (msg.sender != sale || launched) revert Forbidden();
        launched = true;
        (cumulativeObservation, observationTimestamp) = _cumulative();
        emit TradingOpened();
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && !launched && !(from == sale && (to == pair || to == address(0))))
            revert Forbidden();
        bool exempt = (!launched && from == sale) || (converting && from == address(this));
        if (to == pair && from != address(0) && !exempt) {
            uint256 fee = Math.mulDiv(amount, TAX_BPS, 10_000);
            if (fee != 0) {
                super._update(from, address(this), fee);
                collectedTax += fee;
                amount -= fee;
            }
        }
        super._update(from, to, amount);
    }

    function _cumulative() internal view returns (uint256 value, uint32 timestamp) {
        IV2Pair p = IV2Pair(pair);
        bool tokenFirst = p.token0() == address(this);
        value = tokenFirst ? p.price0CumulativeLast() : p.price1CumulativeLast();
        (uint112 r0, uint112 r1, uint32 last) = p.getReserves();
        timestamp = uint32(block.timestamp);
        if (r0 == 0 || r1 == 0) revert PriceUnavailable();
        unchecked {
            uint32 elapsed = timestamp - last;
            uint256 priceX112 = tokenFirst ? (uint256(r1) << 112) / r0 : (uint256(r0) << 112) / r1;
            value += priceX112 * elapsed;
        }
    }

    /// @notice No keeper privilege. A long gap resets warmup instead of treating an old observation as fresh.
    function updateOracle() external {
        if (!launched) revert PriceUnavailable();
        (uint256 current, uint32 timestamp) = _cumulative();
        uint32 elapsed;
        unchecked { elapsed = timestamp - observationTimestamp; }
        if (elapsed < oracleWindow) revert PriceUnavailable();
        if (elapsed > oracleMaxAge) {
            averagePriceX112 = 0;
            averageUpdatedAt = 0;
        } else {
            uint256 delta;
            unchecked { delta = current - cumulativeObservation; }
            averagePriceX112 = delta / elapsed;
            averageUpdatedAt = block.timestamp;
        }
        cumulativeObservation = current;
        observationTimestamp = timestamp;
        emit OracleUpdated(averagePriceX112, averageUpdatedAt);
    }

    function conversionQuote(uint256 amount) public view returns (uint256 minimumBnb) {
        if (!launched || averagePriceX112 == 0 || averageUpdatedAt == 0
            || block.timestamp - averageUpdatedAt > oracleMaxAge) revert PriceUnavailable();
        (uint112 r0, uint112 r1,) = IV2Pair(pair).getReserves();
        uint256 tokenReserve = IV2Pair(pair).token0() == address(this) ? r0 : r1;
        if (amount == 0 || amount > collectedTax || amount > Math.mulDiv(tokenReserve, MAX_SWAP_RESERVE_BPS, 10_000))
            revert InvalidAmount();
        uint256 q112 = uint256(1) << 112;
        uint256 referenceQuote = Math.mulDiv(amount, averagePriceX112, q112);
        uint256 retainedBps = 10_000 - MAX_SHORTFALL_BPS;
        // Exact ceil(amount * averagePriceX112 * retainedBps / (2^112 * 10_000)).
        // Preserve both division remainders: two floors could permit >3% loss.
        // Each term below is <10_000*2^112, so their sum fits below2^127.
        uint256 fractional = mulmod(referenceQuote, retainedBps, 10_000) * q112
            + mulmod(amount, averagePriceX112, q112) * retainedBps;
        minimumBnb = Math.mulDiv(referenceQuote, retainedBps, 10_000)
            + Math.ceilDiv(fractional, q112 * 10_000);
        if (minimumBnb == 0) revert InvalidAmount();
        address[] memory path = new address[](2);
        path[0] = address(this); path[1] = wbnb;
        uint256[] memory quoted = IV2Router(router).getAmountsOut(amount, path);
        if (quoted.length != 2 || quoted[1] < minimumBnb
            || quoted[1] > Math.mulDiv(referenceQuote, 10_000 + MAX_SHORTFALL_BPS, 10_000)) revert PriceProtection();
    }

    function convertTax(uint256 amount, uint256 deadline) external nonReentrant {
        if (deadline < block.timestamp || deadline > block.timestamp + 15 minutes) revert InvalidAmount();
        uint256 minimumBnb = conversionQuote(amount);
        address[] memory path = new address[](2);
        path[0] = address(this); path[1] = wbnb;
        collectedTax -= amount;
        uint256 beforeBnb = address(this).balance;
        converting = true;
        _approve(address(this), router, amount);
        IV2Router(router).swapExactTokensForETHSupportingFeeOnTransferTokens(amount, minimumBnb, path, address(this), deadline);
        _approve(address(this), router, 0);
        converting = false;
        uint256 received = address(this).balance - beforeBnb;
        if (received < minimumBnb) revert PriceProtection();
        uint256 creator = received / 2;
        taxBnbCredit[creatorRecipient] += creator;
        taxBnbCredit[platformRecipient] += received - creator;
        totalTaxBnbCredit += received;
        emit TaxConverted(amount, received, minimumBnb);
    }

    function withdrawTaxFor(address payable recipient) external nonReentrant {
        uint256 due = taxBnbCredit[recipient];
        if (due == 0) revert InvalidAmount();
        taxBnbCredit[recipient] = 0;
        totalTaxBnbCredit -= due;
        (bool ok,) = recipient.call{value:due}("");
        if (!ok) revert TransferFailed();
        emit TaxWithdrawn(recipient, due);
    }

    receive() external payable {
        if (msg.sender != router && msg.sender != wbnb) revert Forbidden();
    }
}
