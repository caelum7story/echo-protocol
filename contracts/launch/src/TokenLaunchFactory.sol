// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentIdentity, LaunchEscrow} from "./LaunchEscrow.sol";
import {LaunchRegistry} from "./LaunchRegistry.sol";
import {TokenLaunch} from "./TokenLaunch.sol";

/// @dev STOP-prefixed immutable bytecode storage; no executable mutator or proxy exists.
contract CreationCodeStore {
    constructor(bytes memory creationCode) {
        bytes memory runtime = abi.encodePacked(hex"00", creationCode);
        assembly ("memory-safe") { return(add(runtime, 32), mload(runtime)) }
    }
}

contract TokenLaunchFactory is ReentrancyGuard {
    struct Terms {
        string name;
        string symbol;
        uint256 startsAt;
        uint256 unitPrice;
        uint256 minimumRaise;
        address creatorRecipient;
    }
    LaunchRegistry public immutable registry;
    bytes32 public immutable versionId;
    uint8 public constant templateKind = 2;
    bytes32 public immutable creationCodeHash;
    address public immutable creationCodeStore;
    mapping(bytes32 => address) public projectForRequest;
    mapping(bytes32 => bytes32) public commitmentForRequest;
    error Unauthorized();
    error TemplateUnavailable();
    error ConflictingRequest();
    error CreationFailed();
    event Created(address indexed project, address indexed creator, bytes32 indexed requestKey, bytes32 configHash);

    constructor(address registry_, bytes32 version_) {
        if (registry_.code.length == 0 || version_ == bytes32(0)) revert TemplateUnavailable();
        registry = LaunchRegistry(registry_); versionId = version_;
        bytes memory code = type(TokenLaunch).creationCode;
        creationCodeHash = keccak256(code);
        creationCodeStore = address(new CreationCodeStore(code));
    }

    function requestKey(address creator, bytes32 requestId) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, requestId));
    }

    function configCommitment(address creator, uint256 identityId, bytes32 requestId, Terms calldata terms) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), registry.environmentHash(), versionId, creator, identityId, requestId, terms));
    }

    function storedCreationCode() public view returns (bytes memory code) {
        address store = creationCodeStore;
        uint256 size = store.code.length - 1;
        code = new bytes(size);
        assembly ("memory-safe") { extcodecopy(store, add(code, 32), 1, size) }
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
            registry.platformRecipient(), terms.creatorRecipient, terms.startsAt, terms.unitPrice, 555_555_555, commitment);
        bytes memory code = storedCreationCode();
        if (keccak256(code) != creationCodeHash) revert CreationFailed();
        bytes memory initcode = abi.encodePacked(code, abi.encode(c, terms.minimumRaise, terms.name, terms.symbol,
            registry.dexFactory(), registry.router(), registry.wbnb(), registry.oracleWindow(), registry.oracleMaxAge()));
        assembly ("memory-safe") { project := create2(0, add(initcode, 32), mload(initcode), key) }
        if (project == address(0)) revert CreationFailed();
        projectForRequest[key] = project; commitmentForRequest[key] = commitment;
        registry.registerProject(project, msg.sender, identityId, versionId, commitment);
        emit Created(project, msg.sender, key, commitment);
    }
}
