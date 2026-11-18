// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AgentToken} from "./AgentToken.sol";
import {PoolOracle} from "./PoolOracle.sol";
import {EmergencyControl} from "./EmergencyControl.sol";
import {
    IV2Pair,
    IV2Router,
    IAgentRegistrar,
    IPriceFeed
} from "./Interfaces.sol";
contract AgentMint is EmergencyControl {
    using SafeERC20 for IERC20;
    uint public constant TOTAL_SHARES = 2_000_000;
    uint public constant OPEN_AT = 8_000;
    uint public constant USER_SHARE = 1_000_000 ether;
    uint public constant POOL_SHARE = 700_000 ether;
    uint public constant MAX_PER_ID = 10;
    uint public constant MAX_PER_TX = 10;
    uint public constant LP_BPS = 7_000;
    uint public constant MAX_TTL = 10 minutes;
    uint public constant FLOOR_INTERVAL = 30 minutes;
    uint public constant MAX_RISE_BPS = 80;
    uint public constant MIN_POOL_TOKENS = 56_000_000 ether;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    AgentToken public immutable token;
    IERC20 public immutable usdt;
    IV2Pair public immutable pair;
    IV2Router public immutable router;
    PoolOracle public immutable oracle;
    IAgentRegistrar public immutable registrar;
    IPriceFeed public immutable bnbFeed;
    IPriceFeed public immutable usdtFeed;
    uint public immutable bnbHeartbeat;
    uint public immutable usdtHeartbeat;
    address public immutable treasury;
    address public immutable wbnb;
    bool public immutable tokenIs0;
    uint public totalMinted;
    uint public totalPaid;
    uint public pendingLiquidityUsdt;
    uint public pendingLiquidityTokens;
    bool public opened;
    bool public closed;
    bool public floorPaused;
    uint public lastFloorAt;
    uint public lastFloorBlock;
    mapping(uint => uint) public mintedById;
    mapping(address => uint) public refundCredit;
    uint public totalRefundCredits;
    struct Config {
        address token;
        address usdt;
        address router;
        address oracle;
        address registrar;
        address bnbFeed;
        address usdtFeed;
        address treasury;
        address admin;
        address rescueVault;
        uint bnbHeartbeat;
        uint usdtHeartbeat;
    }
    error BadShares();
    error SoldOut();
    error NoAgent();
    error QuotaExceeded();
    error PhaseBoundary(uint remaining);
    error Expired();
    error OverMaxCost();
    error MinTokensOut();
    error InvalidPayment();
    error BadFeed();
    error IssuanceLimit();
    error CannotClose();
    event Minted(
        address indexed user,
        uint indexed agentId,
        uint firstSerial,
        uint shares,
        uint cost,
        uint tokensOut
    );
    event Opened(uint usdtBalance, uint tokenBalance, uint lp);
    event LiquidityAdded(uint usdtIn, uint tokensIn, uint lp);
    event FloorBurned(uint amount, uint usdtReserve, uint tokenReserve);
    event FloorPauseChanged(bool paused);
    event MintClosed(bytes32 reason);
    event RefundDeferred(address indexed user, uint amount);
    event RefundClaimed(
        address indexed user,
        address indexed recipient,
        uint amount
    );
    constructor(Config memory c) EmergencyControl(c.admin, c.rescueVault) {
        if (
            c.token.code.length == 0 ||
            c.usdt.code.length == 0 ||
            c.router.code.length == 0 ||
            c.oracle.code.length == 0 ||
            c.registrar.code.length == 0 ||
            c.bnbFeed.code.length == 0 ||
            c.usdtFeed.code.length == 0 ||
            c.treasury == address(0) ||
            c.treasury == address(this) ||
            c.bnbHeartbeat == 0 ||
            c.bnbHeartbeat > 1 days ||
            c.usdtHeartbeat == 0 ||
            c.usdtHeartbeat > 2 days
        ) revert InvalidConfiguration();
        token = AgentToken(c.token);
        usdt = IERC20(c.usdt);
        router = IV2Router(c.router);
        oracle = PoolOracle(c.oracle);
        registrar = IAgentRegistrar(c.registrar);
        bnbFeed = IPriceFeed(c.bnbFeed);
        usdtFeed = IPriceFeed(c.usdtFeed);
        treasury = c.treasury;
        bnbHeartbeat = c.bnbHeartbeat;
        usdtHeartbeat = c.usdtHeartbeat;
        if (
            token.usdt() != c.usdt ||
            router.factory() != token.factory() ||
            IERC20Metadata(c.usdt).decimals() != 18 ||
            bnbFeed.decimals() > 18 ||
            usdtFeed.decimals() > 18 ||
            address(oracle.pair()) != token.pair() ||
            address(oracle.token()) != c.token
        ) revert InvalidConfiguration();
        pair = IV2Pair(token.pair());
        tokenIs0 = pair.token0() == c.token;
        wbnb = router.WETH();
        if (wbnb.code.length == 0 || pair.factory() != token.factory())
            revert InvalidConfiguration();
    }
    receive() external payable {
        if (msg.sender != address(router) && msg.sender != wbnb)
            revert InvalidPayment();
    }
    function priceCents(uint serial) public pure returns (uint) {
        if (serial == 0 || serial > TOTAL_SHARES) revert BadShares();
        if (serial <= OPEN_AT) return 50;
        return 60 + (serial - OPEN_AT - 1) / 10_000;
    }
    function costOf(uint shares) public view returns (uint cost) {
        _shares(shares);
        for (uint i = 1; i <= shares; i++)
            cost += priceCents(totalMinted + i) * 1e16;
    }
    function agentOf(address user) public view returns (uint id) {
        try registrar.handleOf(user) returns (string memory handle) {
            if (bytes(handle).length == 0) revert NoAgent();
            id = uint(keccak256(bytes(handle)));
            try registrar.ownerOf(id) returns (address who) {
                if (who != user) revert NoAgent();
            } catch {
                revert NoAgent();
            }
        } catch {
            revert NoAgent();
        }
    }
    function quote(
        uint shares
    ) public view returns (uint cost, uint userTokens, uint poolTokens) {
        cost = costOf(shares);
        (userTokens, poolTokens) = _allocation(shares, cost);
    }
    function quoteBnb(
        uint shares
    ) external view returns (uint cost, uint routeRequired, uint maximum) {
        cost = costOf(shares);
        (routeRequired, maximum) = _bnbLimits(cost);
    }
    function _shares(uint shares) private view {
        if (shares == 0 || shares > MAX_PER_TX) revert BadShares();
        if (closed || retired || totalMinted + shares > TOTAL_SHARES)
            revert SoldOut();
        if (!opened && totalMinted + shares > OPEN_AT)
            revert PhaseBoundary(OPEN_AT - totalMinted);
    }
    function _check(
        uint shares,
        uint maxCost,
        uint deadline
    ) private view returns (uint id, uint cost) {
        if (paused) revert IsPaused();
        if (retired) revert IsRetired();
        _deadline(deadline);
        cost = costOf(shares);
        if (cost > maxCost) revert OverMaxCost();
        id = agentOf(msg.sender);
        if (mintedById[id] + shares > MAX_PER_ID) revert QuotaExceeded();
    }
    function _deadline(uint deadline) private view {
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_TTL)
            revert Expired();
    }
    function _reserves() private view returns (uint u, uint t) {
        (uint112 r0, uint112 r1, ) = pair.getReserves();
        return tokenIs0 ? (r1, r0) : (r0, r1);
    }
    function _allocation(
        uint shares,
        uint cost
    ) private view returns (uint userTokens, uint poolTokens) {
        if (!opened) {
            userTokens = shares * USER_SHARE;
            poolTokens = shares * POOL_SHARE;
        } else {
            oracle.prices();
            (uint u, uint t) = _reserves();
            userTokens = Math.mulDiv(cost, t, u);
            poolTokens = Math.mulDiv(
                (cost * LP_BPS) / 10_000,
                t,
                u,
                Math.Rounding.Ceil
            );
            if (userTokens == 0 || poolTokens == 0) revert InvalidPayment();
        }
        if (
            token.totalIssued() + userTokens + poolTokens > token.MAX_ISSUANCE()
        ) revert IssuanceLimit();
    }
    function mint(
        uint shares,
        uint maxCost,
        uint minTokensOut,
        uint deadline
    ) external nonReentrant {
        (uint id, uint cost) = _check(shares, maxCost, deadline);
        if (opened) oracle.update();
        (uint userTokens, uint poolTokens) = _allocation(shares, cost);
        if (minTokensOut == 0 || userTokens < minTokensOut)
            revert MinTokensOut();
        uint before = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(msg.sender, address(this), cost);
        if (usdt.balanceOf(address(this)) - before != cost)
            revert InvalidPayment();
        _settle(id, shares, cost, userTokens, poolTokens);
    }
    function mintWithBnb(
        uint shares,
        uint maxCost,
        uint maxBnb,
        uint minTokensOut,
        uint deadline
    ) external payable nonReentrant {
        (uint id, uint cost) = _check(shares, maxCost, deadline);
        if (opened) oracle.update();
        (uint userTokens, uint poolTokens) = _allocation(shares, cost);
        if (minTokensOut == 0 || userTokens < minTokensOut)
            revert MinTokensOut();
        (uint needed, uint oracleMax) = _bnbLimits(cost);
        uint limit = Math.min(Math.min(msg.value, maxBnb), oracleMax);
        if (needed > limit) revert OverMaxCost();
        uint before = usdt.balanceOf(address(this));
        uint[] memory amounts = router.swapETHForExactTokens{value: limit}(
            cost,
            _bnbPath(),
            address(this),
            deadline
        );
        if (
            amounts.length != 2 ||
            amounts[0] > limit ||
            usdt.balanceOf(address(this)) - before != cost
        ) revert InvalidPayment();
        _settle(id, shares, cost, userTokens, poolTokens);
        _refund(msg.sender, msg.value - amounts[0]);
    }
    function _settle(
        uint id,
        uint shares,
        uint cost,
        uint userTokens,
        uint poolTokens
    ) private {
        uint first = totalMinted + 1;
        mintedById[id] += shares;
        totalMinted += shares;
        totalPaid += cost;
        uint poolUsdt = (cost * LP_BPS) / 10_000;
        token.mint(msg.sender, userTokens);
        if (!opened) {
            pendingLiquidityUsdt += poolUsdt;
            pendingLiquidityTokens += poolTokens;
            token.mint(address(this), poolTokens);
            if (totalMinted == OPEN_AT) _open();
        } else {
            usdt.safeTransfer(address(pair), poolUsdt);
            token.mint(address(pair), poolTokens);
            uint lp = pair.mint(DEAD);
            emit LiquidityAdded(poolUsdt, poolTokens, lp);
            _floor();
        }
        usdt.safeTransfer(treasury, cost - poolUsdt);
        if (totalMinted == TOTAL_SHARES) {
            closed = true;
            emit MintClosed(keccak256("SHARES"));
        }
        emit Minted(msg.sender, id, first, shares, cost, userTokens);
    }
    function _open() private {
        if (
            pair.totalSupply() != 0 ||
            token.balanceOf(address(pair)) != 0 ||
            pendingLiquidityUsdt != 2_800 ether ||
            pendingLiquidityTokens != 5_600_000_000 ether
        ) revert InvalidConfiguration();
        uint u = pendingLiquidityUsdt;
        uint t = pendingLiquidityTokens;
        pendingLiquidityUsdt = 0;
        pendingLiquidityTokens = 0;
        usdt.safeTransfer(address(pair), u);
        IERC20(address(token)).safeTransfer(address(pair), t);
        uint lp = pair.mint(DEAD);
        token.enableTrading();
        opened = true;
        oracle.initialize();
        emit Opened(
            usdt.balanceOf(address(pair)),
            token.balanceOf(address(pair)),
            lp
        );
    }
    function circulating() public view returns (uint) {
        return
            token.totalSupply() -
            token.balanceOf(address(pair)) -
            token.balanceOf(address(this)) -
            token.balanceOf(DEAD);
    }
    function setFloorPaused(bool value) external onlyOwner {
        floorPaused = value;
        emit FloorPauseChanged(value);
    }
    function _floor() private {
        if (
            floorPaused ||
            block.number == lastFloorBlock ||
            (lastFloorAt != 0 && block.timestamp < lastFloorAt + FLOOR_INTERVAL)
        ) return;
        (uint u, uint t) = _reserves();
        uint circ = circulating();
        if (circ == 0 || Math.mulDiv(circ, u, t) >= totalPaid) return;
        uint target = Math.mulDiv(u, circ, totalPaid, Math.Rounding.Ceil);
        uint rise = Math.mulDiv(
            t,
            10_000,
            10_000 + MAX_RISE_BPS,
            Math.Rounding.Ceil
        );
        uint minimum = Math.max(MIN_POOL_TOKENS, circ / 100);
        uint next = Math.max(Math.max(target, rise), minimum);
        if (next >= t) return;
        lastFloorAt = block.timestamp;
        lastFloorBlock = block.number;
        token.burnPool(t - next);
        pair.sync();
        emit FloorBurned(t - next, u, next);
    }
    /// @notice Explicit irreversible close only when the next complete share cannot fit the lifetime cap.
    function closeAtSupplyLimit() external onlyOwner nonReentrant {
        if (closed || retired || !opened) revert CannotClose();
        oracle.update();
        oracle.prices();
        (uint u, uint t) = _reserves();
        uint cost = priceCents(totalMinted + 1) * 1e16;
        uint userTokens = Math.mulDiv(cost, t, u);
        uint poolTokens = Math.mulDiv(
            (cost * LP_BPS) / 10_000,
            t,
            u,
            Math.Rounding.Ceil
        );
        if (
            token.totalIssued() + userTokens + poolTokens <=
            token.MAX_ISSUANCE()
        ) revert CannotClose();
        closed = true;
        emit MintClosed(keccak256("ISSUANCE"));
    }
    function _feed(
        IPriceFeed f,
        uint heartbeat
    ) private view returns (uint wad) {
        (uint80 round, int answer, , uint at, ) = f.latestRoundData();
        if (
            round == 0 ||
            answer <= 0 ||
            at == 0 ||
            at > block.timestamp ||
            block.timestamp - at > heartbeat
        ) revert BadFeed();
        wad = uint(answer) * 10 ** (18 - f.decimals());
    }
    function _bnbPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = wbnb;
        path[1] = address(usdt);
    }
    function _bnbLimits(
        uint cost
    ) private view returns (uint needed, uint maximum) {
        uint bnbUsd = _feed(bnbFeed, bnbHeartbeat);
        uint usdtUsd = _feed(usdtFeed, usdtHeartbeat);
        if (
            bnbUsd < 1 ether ||
            bnbUsd > 1_000_000 ether ||
            usdtUsd < 0.95 ether ||
            usdtUsd > 1.05 ether
        ) revert BadFeed();
        uint fair = Math.mulDiv(cost, usdtUsd, bnbUsd, Math.Rounding.Ceil);
        uint[] memory amounts = router.getAmountsIn(cost, _bnbPath());
        if (amounts.length != 2) revert InvalidPayment();
        needed = amounts[0];
        uint diff = needed > fair ? needed - fair : fair - needed;
        if (Math.mulDiv(diff, 10_000, fair) > 200) revert BadFeed();
        maximum = Math.mulDiv(fair, 10_100, 10_000, Math.Rounding.Ceil);
    }
    function _refund(address user, uint amount) private {
        if (amount == 0) return;
        (bool ok, ) = user.call{value: amount, gas: 30_000}("");
        if (!ok) {
            refundCredit[user] += amount;
            totalRefundCredits += amount;
            emit RefundDeferred(user, amount);
        }
    }
    function claimRefund(address payable recipient) external nonReentrant {
        uint amount = refundCredit[msg.sender];
        if (amount == 0 || recipient == address(0)) revert InvalidPayment();
        refundCredit[msg.sender] = 0;
        totalRefundCredits -= amount;
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit RefundClaimed(msg.sender, recipient, amount);
    }
    function _beforeRescue(address asset, uint amount) internal override {
        if (asset == address(pair)) revert InvalidRescue();
        if (
            asset == address(0) &&
            amount > address(this).balance - totalRefundCredits
        ) revert InvalidRescue();
        if (asset == address(usdt) || asset == address(token)) {
            retired = true;
            closed = true;
            emit MintClosed(keccak256("EMERGENCY_RESCUE"));
        }
    }
}
