// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentIdentity, LaunchEscrow} from "./LaunchEscrow.sol";
import {LaunchRegistry} from "./LaunchRegistry.sol";
import {NftLaunch} from "./NftLaunch.sol";

contract NftLaunchFactory is ReentrancyGuard {
    struct Terms {
        string name;
        string symbol;
        string baseURI;
        bytes32 metadataRoot;
        uint256 startsAt;
        uint256 unitPrice;
        uint256 supply;
        address creatorRecipient;
    }
    LaunchRegistry public immutable registry;
    bytes32 public immutable versionId;
    uint8 public constant templateKind = 1;
    bytes32 public immutable creationCodeHash;
    mapping(bytes32 => address) public projectForRequest;
    mapping(bytes32 => bytes32) public commitmentForRequest;
    error Unauthorized();
    error TemplateUnavailable();
    error ConflictingRequest();
    event Created(address indexed project, address indexed creator, bytes32 indexed requestKey, bytes32 configHash);

    constructor(address registry_, bytes32 version_) {
        if (registry_.code.length == 0 || version_ == bytes32(0)) revert TemplateUnavailable();
        registry = LaunchRegistry(registry_); versionId = version_;
        creationCodeHash = keccak256(type(NftLaunch).creationCode);
    }

    function requestKey(address creator, bytes32 requestId) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, requestId));
    }

    function configCommitment(address creator, uint256 identityId, bytes32 requestId, Terms calldata terms) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), registry.environmentHash(), versionId, creator, identityId, requestId, terms));
    }

    function create(uint256 identityId, bytes32 requestId, Terms calldata terms, uint256 deadline) external nonReentrant returns (address project) {
        if (IAgentIdentity(registry.identity()).ownerOf(identityId) != msg.sender) revert Unauthorized();
        bytes32 key = requestKey(msg.sender, requestId);
        bytes32 commitment = configCommitment(msg.sender, identityId, requestId, terms);
        project = projectForRequest[key];
        if (project != address(0)) {
            if (commitmentForRequest[key] != commitment) revert ConflictingRequest();
            return project;
        }
        if (deadline < block.timestamp || deadline > block.timestamp + 300) revert TemplateUnavailable();
        if (!registry.canCreate(versionId, address(this))) revert TemplateUnavailable();
        LaunchEscrow.BaseConfig memory c = LaunchEscrow.BaseConfig(registry.identity(), registry.platformAdmin(),
            registry.platformRecipient(), terms.creatorRecipient, terms.startsAt, terms.unitPrice, terms.supply, commitment);
        project = address(new NftLaunch{salt:key}(c, terms.name, terms.symbol, terms.baseURI, terms.metadataRoot));
        projectForRequest[key] = project; commitmentForRequest[key] = commitment;
        registry.registerProject(project, msg.sender, identityId, versionId, commitment);
        emit Created(project, msg.sender, key, commitment);
    }
}
