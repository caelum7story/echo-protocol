// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IAgentIdentity {
    function ownerOf(uint256 id) external view returns (address);
}

/// @notice Local development candidate. No upgrade, rescue, recipient replacement or admin withdrawal.
abstract contract LaunchEscrow is ReentrancyGuard {
    uint256 public constant DURATION = 7 days;
    uint256 public constant MAX_PAUSE = 24 hours;
    uint256 public constant MAX_REQUEST_TTL = 300;
    IAgentIdentity public immutable identity;
    address public immutable platformAdmin;
    address public immutable platformRecipient;
    address public immutable creatorRecipient;
    uint256 public immutable startsAt;
    uint256 public immutable endsAt;
    uint256 public immutable unitPrice;
    uint256 public immutable capacity;
    bytes32 public immutable configHash;

    uint256 public activeUnits;
    uint256 public activePrincipal;
    uint256 public soldOutAt;
    uint256 public pausedAt;
    uint256 public accumulatedPause;
    bool public settled;
    mapping(address => uint256) public bnbCredit;
    uint256 public totalBnbCredit;
    mapping(address => mapping(bytes32 => bytes32)) public subscriptionRequests;

    error InvalidConfig();
    error Unauthorized();
    error NotOpen();
    error Unavailable();
    error IncorrectPayment();
    error NothingDue();
    error NativeTransferFailed();
    error InvalidDeadline();
    error DuplicateRequest();

    event PauseChanged(bool paused, uint256 accumulatedSeconds);
    event CreditAdded(address indexed recipient, uint256 amount, bytes32 reason);
    event CreditWithdrawn(address indexed recipient, uint256 amount);
    event SubscriptionRequestRecorded(address indexed wallet, bytes32 indexed requestId, uint256 indexed identityId, uint256 units, uint256 principal, uint256 deadline);

    struct BaseConfig {
        address identity;
        address platformAdmin;
        address platformRecipient;
        address creatorRecipient;
        uint256 startsAt;
        uint256 unitPrice;
        uint256 capacity;
        bytes32 configHash;
    }

    constructor(BaseConfig memory c) {
        if (c.identity.code.length == 0 || c.platformAdmin == address(0)
            || c.platformRecipient == address(0) || c.creatorRecipient == address(0)
            || c.startsAt <= block.timestamp || c.startsAt > type(uint64).max - DURATION
            || c.unitPrice == 0 || c.capacity == 0 || c.configHash == bytes32(0)
            || c.capacity > type(uint256).max / c.unitPrice) revert InvalidConfig();
        identity = IAgentIdentity(c.identity);
        platformAdmin = c.platformAdmin;
        platformRecipient = c.platformRecipient;
        creatorRecipient = c.creatorRecipient;
        startsAt = c.startsAt;
        endsAt = c.startsAt + DURATION;
        unitPrice = c.unitPrice;
        capacity = c.capacity;
        configHash = c.configHash;
    }

    function totalPause() public view returns (uint256) {
        return accumulatedPause + (pausedAt == 0 ? 0 : block.timestamp - pausedAt);
    }

    function cancelled() public view returns (bool) {
        return pausedAt != 0 && (totalPause() >= MAX_PAUSE || block.timestamp >= endsAt);
    }

    function closeTime() public view returns (uint256) {
        return soldOutAt == 0 ? endsAt : soldOutAt;
    }

    function subscriptionsOpen() public view returns (bool) {
        return !settled && !cancelled() && pausedAt == 0 && soldOutAt == 0
            && block.timestamp >= startsAt && block.timestamp < endsAt;
    }

    /// @dev Pause only affects new subscriptions. Claims, refunds and credits never use this gate.
    function setPaused(bool pause) external nonReentrant {
        if (msg.sender != platformAdmin) revert Unauthorized();
        if (settled || soldOutAt != 0 || cancelled() || block.timestamp >= endsAt) revert Unavailable();
        if (pause) {
            if (pausedAt != 0 || accumulatedPause >= MAX_PAUSE) revert Unavailable();
            pausedAt = block.timestamp;
        } else {
            if (pausedAt == 0) revert Unavailable();
            accumulatedPause += block.timestamp - pausedAt;
            pausedAt = 0;
        }
        emit PauseChanged(pause, totalPause());
    }

    function _accept(uint256 identityId, uint256 units, bytes32 requestId, uint256 deadline) internal returns (uint256 principal) {
        if (requestId == bytes32(0) || subscriptionRequests[msg.sender][requestId] != bytes32(0)) revert DuplicateRequest();
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_REQUEST_TTL) revert InvalidDeadline();
        if (!subscriptionsOpen()) revert NotOpen();
        if (identity.ownerOf(identityId) != msg.sender) revert Unauthorized();
        if (units == 0 || units > capacity - activeUnits) revert Unavailable();
        principal = units * unitPrice;
        if (msg.value != principal) revert IncorrectPayment();
        subscriptionRequests[msg.sender][requestId] = keccak256(abi.encode(configHash, identityId, units, principal, deadline));
        activeUnits += units;
        activePrincipal += principal;
        if (activeUnits == capacity) soldOutAt = block.timestamp;
        emit SubscriptionRequestRecorded(msg.sender, requestId, identityId, units, principal, deadline);
    }

    function _credit(address recipient, uint256 amount, bytes32 reason) internal {
        if (amount == 0) return;
        bnbCredit[recipient] += amount;
        totalBnbCredit += amount;
        emit CreditAdded(recipient, amount, reason);
    }

    /// @notice Permissionless assistance; payment can only go to the immutable entitlement recipient.
    function withdrawCreditFor(address payable recipient) external nonReentrant {
        uint256 amount = bnbCredit[recipient];
        if (amount == 0) revert NothingDue();
        bnbCredit[recipient] = 0;
        totalBnbCredit -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit CreditWithdrawn(recipient, amount);
    }

    function _percent(uint256 amount, uint256 percent) internal pure returns (uint256) {
        return Math.mulDiv(amount, percent, 100);
    }
}
