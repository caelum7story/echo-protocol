// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {LaunchEscrow} from "./LaunchEscrow.sol";

/// @notice Fixed-cap ERC721 with independently escrowed subscriptions and immutable content root.
contract NftLaunch is ERC721, LaunchEscrow {
    uint256 public constant MAX_BATCH = 100;
    bytes32 public immutable metadataRoot;
    string public contentBaseURI;
    uint256 public reservedCount;
    uint256 public deliveredCount;
    mapping(uint256 => address) public reservedFor;
    mapping(address => uint256) public subscribedPrincipal;
    mapping(address => bool) public refunded;

    event Subscribed(address indexed wallet, uint256 indexed identityId, uint256 firstId, uint256 count, uint256 principal);
    event Finalized(bool success, uint256 principal);
    event Refunded(address indexed wallet, uint256 principal);
    event Delivered(address indexed wallet, uint256 indexed tokenId);

    constructor(BaseConfig memory c, string memory name_, string memory symbol_, string memory baseURI_, bytes32 metadataRoot_)
        ERC721(name_, symbol_) LaunchEscrow(c)
    {
        bytes memory uri = bytes(baseURI_);
        // Fixed IPFS content address; storage availability and CID-to-manifest proof remain release gates.
        if (metadataRoot_ == bytes32(0) || uri.length < 9 || uri[0] != 'i' || uri[1] != 'p'
            || uri[2] != 'f' || uri[3] != 's' || uri[4] != ':' || uri[5] != '/' || uri[6] != '/'
            || uri[uri.length - 1] != '/') revert InvalidConfig();
        metadataRoot = metadataRoot_;
        contentBaseURI = baseURI_;
    }

    function subscribe(uint256 identityId, uint256 units, bytes32 requestId, uint256 deadline) external payable nonReentrant {
        if (units > MAX_BATCH) revert Unavailable();
        uint256 principal = _accept(identityId, units, requestId, deadline);
        uint256 firstId = reservedCount + 1;
        for (uint256 i; i < units; ++i) reservedFor[firstId + i] = msg.sender;
        reservedCount += units;
        subscribedPrincipal[msg.sender] += principal;
        emit Subscribed(msg.sender, identityId, firstId, units, principal);
    }

    function successEligible() public view returns (bool) {
        return !cancelled() && soldOutAt != 0;
    }

    function refundEligible() public view returns (bool) {
        return cancelled() || (block.timestamp >= endsAt && soldOutAt == 0);
    }

    function finalize() external nonReentrant {
        if (settled || (!successEligible() && !refundEligible())) revert Unavailable();
        settled = true;
        if (successEligible()) {
            uint256 platform = _percent(activePrincipal, 10);
            _credit(platformRecipient, platform, "NFT_PLATFORM");
            _credit(creatorRecipient, activePrincipal - platform, "NFT_CREATOR");
        }
        emit Finalized(successEligible(), activePrincipal);
    }

    function refundFor(address wallet) external nonReentrant {
        if (!refundEligible() || refunded[wallet]) revert Unavailable();
        uint256 principal = subscribedPrincipal[wallet];
        if (principal == 0) revert NothingDue();
        refunded[wallet] = true;
        _credit(wallet, principal, "NFT_REFUND");
        emit Refunded(wallet, principal);
    }

    /// @notice Any caller may help deliver, but neither the recipient nor reserved IDs can be replaced.
    function claimFor(address wallet, uint256[] calldata ids) external nonReentrant {
        if (!settled || !successEligible() || ids.length == 0 || ids.length > MAX_BATCH) revert Unavailable();
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (reservedFor[id] != wallet || _ownerOf(id) != address(0)) revert Unauthorized();
            ++deliveredCount;
            _safeMint(wallet, id);
            emit Delivered(wallet, id);
        }
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat(contentBaseURI, Strings.toString(id), ".json");
    }
}
