// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
/// @notice Emergency access is disclosed, delayed, and fixed-recipient. No upgrades or arbitrary calls.
abstract contract EmergencyControl is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint public constant RESCUE_DELAY = 2 days;
    address public immutable rescueVault;
    bool public paused;
    bool public retired;
    struct Rescue {
        address asset;
        uint amount;
        uint eta;
    }
    Rescue public rescue;
    event PauseChanged(bool paused);
    event RescueQueued(address indexed asset, uint amount, uint eta);
    event RescueCancelled();
    event RescueExecuted(
        address indexed asset,
        uint amount,
        address indexed recipient,
        bool retired
    );
    error InvalidConfiguration();
    error IsPaused();
    error IsRetired();
    error InvalidRescue();
    error RescueNotReady();
    error NativeTransferFailed();
    error RenounceDisabled();
    constructor(address admin, address vault) Ownable(admin) {
        if (vault == address(0)) revert InvalidConfiguration();
        rescueVault = vault;
    }
    function setPaused(bool value) external onlyOwner {
        if (!value && (retired || rescue.eta != 0)) revert InvalidRescue();
        paused = value;
        emit PauseChanged(value);
    }
    function queueRescue(address asset, uint amount) external onlyOwner {
        if (!paused || amount == 0 || rescue.eta != 0) revert InvalidRescue();
        rescue = Rescue(asset, amount, block.timestamp + RESCUE_DELAY);
        emit RescueQueued(asset, amount, rescue.eta);
    }
    function cancelRescue() external onlyOwner {
        delete rescue;
        emit RescueCancelled();
    }
    function executeRescue() external onlyOwner nonReentrant {
        Rescue memory r = rescue;
        if (!paused || r.eta == 0 || block.timestamp < r.eta)
            revert RescueNotReady();
        delete rescue;
        _beforeRescue(r.asset, r.amount);
        if (r.asset == address(0)) {
            (bool ok, ) = rescueVault.call{value: r.amount}("");
            if (!ok) revert NativeTransferFailed();
        } else IERC20(r.asset).safeTransfer(rescueVault, r.amount);
        emit RescueExecuted(r.asset, r.amount, rescueVault, retired);
    }
    function renounceOwnership() public override onlyOwner {
        revert RenounceDisabled();
    }
    function _beforeRescue(address asset, uint amount) internal virtual;
}
