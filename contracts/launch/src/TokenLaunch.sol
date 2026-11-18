// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {LaunchEscrow} from "./LaunchEscrow.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {IV2Pair, IWBNB} from "./DexInterfaces.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Fixed-price escrow. No participant loop is executed while finalizing liquidity.
contract TokenLaunch is LaunchEscrow {
    uint256 public constant PUBLIC_UNITS = 555_555_555;
    uint256 public constant IDENTITY_CAP = 22_222_222;
    uint256 public constant POOL_GRACE = 48 hours;
    uint256 public constant EXIT_CUTOFF = 15 minutes;
    uint256 public constant MAX_BATCH = 100;
    // All genesis LP is minted to the zero address, not held by platform or issuer.
    address public constant LP_DESTINATION = address(0);
    uint256 public immutable minimumRaise;
    LaunchToken public immutable token;
    address public immutable wbnb;
    bool public poolCreated;
    uint256 public liquidityBnb;
    uint256 public liquidityTokens;
    uint256 public liquidityReceipt;
    uint256 public burnedTokens;
    // External WBNB is never counted as raised principal or as part of the80/15/5 split.
    uint256 public externalPoolWbnb;
    mapping(uint256 => uint256) public identityActiveUnits;

    struct Position {
        address wallet;
        uint256 identityId;
        uint256 units;
        uint256 principal;
        bool delivered;
        uint256 revision;
    }
    mapping(bytes32 => Position) public positions;
    bytes32[] public positionKeys;

    event Subscribed(bytes32 indexed key, address indexed wallet, uint256 indexed identityId, uint256 units, uint256 principal);
    event Exited(bytes32 indexed key, uint256 units, uint256 principal, uint256 refund, uint256 fee);
    event Refunded(bytes32 indexed key, uint256 units, uint256 principal);
    event PoolCreated(address indexed pair, uint256 bnb, uint256 tokens, uint256 lp, uint256 burned);
    event ExternalPoolWbnbObserved(uint256 balance, uint256 syncedReserve);
    event Delivered(bytes32 indexed key, address indexed wallet, uint256 amount);

    constructor(BaseConfig memory c, uint256 minimum_, string memory name_, string memory symbol_,
        address factory_, address router_, address wbnb_, uint256 oracleWindow_, uint256 oracleMaxAge_) LaunchEscrow(c)
    {
        if (c.capacity != PUBLIC_UNITS || minimum_ == 0 || minimum_ > c.capacity * c.unitPrice) revert InvalidConfig();
        minimumRaise = minimum_;
        wbnb = wbnb_;
        token = new LaunchToken(name_, symbol_, factory_, router_, wbnb_, c.creatorRecipient,
            c.platformRecipient, oracleWindow_, oracleMaxAge_);
        // Whole-token public/reserve allocation totals 999,999,999. The initial one-token remainder is burned.
        token.burnSaleInventory(1 ether);
        burnedTokens = 1 ether;
    }

    function positionKey(uint256 identityId, address wallet) public pure returns (bytes32) {
        return keccak256(abi.encode(identityId, wallet));
    }

    function positionCount() external view returns (uint256) { return positionKeys.length; }

    function subscribe(uint256 identityId, uint256 units, bytes32 requestId, uint256 deadline) external payable nonReentrant {
        if (units > IDENTITY_CAP - identityActiveUnits[identityId]) revert Unavailable();
        uint256 principal = _accept(identityId, units, requestId, deadline);
        bytes32 key = positionKey(identityId, msg.sender);
        Position storage p = positions[key];
        if (p.wallet == address(0)) {
            p.wallet = msg.sender; p.identityId = identityId;
            positionKeys.push(key);
        }
        p.units += units;
        p.principal += principal;
        ++p.revision;
        identityActiveUnits[identityId] += units;
        emit Subscribed(key, msg.sender, identityId, units, principal);
    }

    function refundEligible() public view returns (bool) {
        if (poolCreated) return false;
        if (cancelled()) return true;
        uint256 close = closeTime();
        if (block.timestamp < close) return false;
        return activePrincipal < minimumRaise || block.timestamp >= close + POOL_GRACE;
    }

    function earlyExitOpen() public view returns (bool) {
        // Pausing only suspends new subscriptions. It does not create an early-exit fee on a full-refund branch.
        return !settled && !refundEligible() && soldOutAt == 0 && block.timestamp >= startsAt
            && block.timestamp < endsAt - EXIT_CUTOFF;
    }

    function exitAll(uint256 identityId, uint256 expectedRevision, uint256 deadline) external nonReentrant {
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_REQUEST_TTL) revert InvalidDeadline();
        if (!earlyExitOpen()) revert Unavailable();
        bytes32 key = positionKey(identityId, msg.sender);
        Position storage p = positions[key];
        if (p.revision != expectedRevision) revert Unavailable();
        uint256 principal = p.principal;
        uint256 units = p.units;
        if (principal == 0) revert NothingDue();
        p.principal = 0; p.units = 0;
        ++p.revision;
        activePrincipal -= principal; activeUnits -= units;
        identityActiveUnits[identityId] -= units;
        uint256 fee = _percent(principal, 5);
        _credit(platformRecipient, fee, "EARLY_EXIT_FEE");
        _credit(msg.sender, principal - fee, "EARLY_EXIT_REFUND");
        emit Exited(key, units, principal, principal - fee, fee);
    }

    function refundFor(uint256 identityId, address wallet) external nonReentrant {
        if (!refundEligible()) revert Unavailable();
        bytes32 key = positionKey(identityId, wallet);
        Position storage p = positions[key];
        uint256 principal = p.principal;
        uint256 units = p.units;
        if (principal == 0) revert NothingDue();
        p.principal = 0; p.units = 0;
        ++p.revision;
        identityActiveUnits[identityId] -= units;
        // Keep the close-time success/failure denominator fixed. Refunded closed positions cannot reopen a sale.
        _credit(wallet, principal, "TOKEN_REFUND");
        emit Refunded(key, units, principal);
    }

    function finalizePool() external nonReentrant {
        if (settled || poolCreated || cancelled() || block.timestamp < closeTime()
            || block.timestamp >= closeTime() + POOL_GRACE || activePrincipal < minimumRaise)
            revert Unavailable();
        IV2Pair p = IV2Pair(token.pair());
        (uint112 r0, uint112 r1,) = p.getReserves();
        bool tokenFirst = p.token0() == address(token);
        uint256 wbnbReserve = tokenFirst ? r1 : r0;
        uint256 externalWbnb = IWBNB(wbnb).balanceOf(address(p));
        // Before launch no participant has tokens, so a one-sided WBNB donation cannot
        // own any LP. Accept it even after sync, but never accept existing token inventory/LP.
        // Direct pair.mint below preserves our fixed-price contribution ratio; router
        // addLiquidity would incorrectly try to quote against a one-sided reserve.
        if (p.totalSupply() != 0 || (tokenFirst ? r0 : r1) != 0 || token.balanceOf(address(p)) != 0
            || externalWbnb < wbnbReserve) revert Unavailable();
        uint256 bnb = _percent(activePrincipal, 80);
        uint256 tokens = Math.mulDiv(bnb, 1 ether, unitPrice);
        if (bnb == 0 || tokens == 0 || tokens > 444_444_444 ether || bnb > type(uint112).max
            || externalWbnb > type(uint112).max - bnb) revert Unavailable();
        settled = true;
        liquidityBnb = bnb; liquidityTokens = tokens;
        externalPoolWbnb = externalWbnb;
        if (externalWbnb != 0) emit ExternalPoolWbnbObserved(externalWbnb, wbnbReserve);
        IWBNB(wbnb).deposit{value:bnb}();
        if (!IWBNB(wbnb).transfer(address(p), bnb) || !token.transfer(address(p), tokens)) revert Unavailable();
        uint256 lpBefore = p.balanceOf(LP_DESTINATION);
        uint256 lp = p.mint(LP_DESTINATION);
        if (lp == 0 || p.balanceOf(LP_DESTINATION) < lpBefore + lp) revert Unavailable();
        liquidityReceipt = lp;
        uint256 inventory = token.balanceOf(address(this));
        uint256 participantOwed = activeUnits * 1 ether;
        if (inventory < participantOwed) revert Unavailable();
        uint256 burn = inventory - participantOwed;
        token.burnSaleInventory(burn);
        burnedTokens += burn;
        poolCreated = true;
        token.openTrading();
        uint256 creator = _percent(activePrincipal, 15);
        _credit(creatorRecipient, creator, "TOKEN_CREATOR");
        _credit(platformRecipient, activePrincipal - bnb - creator, "TOKEN_PLATFORM");
        emit PoolCreated(address(p), bnb, tokens, lp, burn);
    }

    function _deliver(bytes32 key) private returns (bool) {
        Position storage p = positions[key];
        if (p.units == 0 || p.delivered) return false;
        p.delivered = true;
        ++p.revision;
        uint256 amount = p.units * 1 ether;
        if (!token.transfer(p.wallet, amount)) revert Unavailable();
        emit Delivered(key, p.wallet, amount);
        return true;
    }

    /// @notice Anyone may pay gas to assist. Addresses always come from the original on-chain ledger.
    function distribute(bytes32[] calldata keys) external nonReentrant {
        if (!poolCreated || keys.length == 0 || keys.length > MAX_BATCH) revert Unavailable();
        for (uint256 i; i < keys.length; ++i) _deliver(keys[i]);
    }

    function claim(uint256 identityId) external nonReentrant {
        if (!poolCreated || !_deliver(positionKey(identityId, msg.sender))) revert Unavailable();
    }
}
