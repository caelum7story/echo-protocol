// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IV2Router} from "./DexInterfaces.sol";

interface ILaunchFactory {
    function registry() external view returns (address);
    function versionId() external view returns (bytes32);
    function templateKind() external view returns (uint8);
    function creationCodeHash() external view returns (bytes32);
}
interface ILaunchCommitment {
    function configHash() external view returns (bytes32);
}

/// @notice Append-only provenance. Retiring a template affects new creation, never existing project rights.
contract LaunchRegistry {
    struct Environment {
        address identity;
        address platformAdmin;
        address platformRecipient;
        address dexFactory;
        address router;
        address wbnb;
        uint256 oracleWindow;
        uint256 oracleMaxAge;
    }
    struct Template {
        address factory;
        bytes32 factoryRuntimeHash;
        bytes32 creationCodeHash;
        bytes32 reviewDocumentHash;
        uint8 kind;
        bool enabled;
    }
    struct Project {
        address factory;
        address creator;
        uint256 identityId;
        bytes32 versionId;
        bytes32 configHash;
        uint64 createdAt;
        uint8 kind;
    }

    address public immutable identity;
    address public immutable platformAdmin;
    address public immutable platformRecipient;
    address public immutable dexFactory;
    address public immutable router;
    address public immutable wbnb;
    uint256 public immutable oracleWindow;
    uint256 public immutable oracleMaxAge;
    bytes32 public immutable environmentHash;
    bytes32 public immutable identityRuntimeHash;
    bytes32 public immutable dexFactoryRuntimeHash;
    bytes32 public immutable routerRuntimeHash;
    bytes32 public immutable wbnbRuntimeHash;
    mapping(bytes32 => Template) public templates;
    mapping(address => Project) public projects;
    address[] public projectAddresses;

    error Unauthorized();
    error InvalidConfiguration();
    error AlreadyRegistered();
    error UnrecognizedTemplate();
    event TemplateRegistered(bytes32 indexed versionId, address indexed factory, uint8 kind, bytes32 creationCodeHash, bytes32 reviewDocumentHash);
    event TemplateEnabled(bytes32 indexed versionId, bool enabled);
    event ProjectRegistered(address indexed project, address indexed creator, bytes32 indexed versionId, uint256 identityId, bytes32 configHash, uint8 kind);

    constructor(Environment memory e) {
        if (e.identity.code.length == 0 || e.dexFactory.code.length == 0 || e.router.code.length == 0
            || e.wbnb.code.length == 0 || e.platformAdmin == address(0) || e.platformRecipient == address(0)
            || e.oracleWindow == 0 || e.oracleMaxAge < e.oracleWindow || e.oracleMaxAge > type(uint32).max / 2
            || IV2Router(e.router).factory() != e.dexFactory || IV2Router(e.router).WETH() != e.wbnb)
            revert InvalidConfiguration();
        identity = e.identity; platformAdmin = e.platformAdmin; platformRecipient = e.platformRecipient;
        dexFactory = e.dexFactory; router = e.router; wbnb = e.wbnb;
        oracleWindow = e.oracleWindow; oracleMaxAge = e.oracleMaxAge;
        environmentHash = keccak256(abi.encode(block.chainid, e));
        identityRuntimeHash = e.identity.codehash; dexFactoryRuntimeHash = e.dexFactory.codehash;
        routerRuntimeHash = e.router.codehash; wbnbRuntimeHash = e.wbnb.codehash;
    }

    function environmentUnchanged() public view returns (bool) {
        return identity.codehash == identityRuntimeHash && dexFactory.codehash == dexFactoryRuntimeHash
            && router.codehash == routerRuntimeHash && wbnb.codehash == wbnbRuntimeHash;
    }

    /// @dev A document hash is a published attestation pointer, not proof that an audit was performed.
    function registerTemplate(bytes32 version, address factory, bytes32 reviewDocumentHash) external {
        if (msg.sender != platformAdmin) revert Unauthorized();
        if (templates[version].factory != address(0)) revert AlreadyRegistered();
        if (version == bytes32(0) || reviewDocumentHash == bytes32(0) || factory.code.length == 0
            || !environmentUnchanged()) revert InvalidConfiguration();
        ILaunchFactory f = ILaunchFactory(factory);
        uint8 kind = f.templateKind();
        bytes32 codeHash = f.creationCodeHash();
        if (f.registry() != address(this) || f.versionId() != version || (kind != 1 && kind != 2)
            || codeHash == bytes32(0)) revert InvalidConfiguration();
        templates[version] = Template(factory, factory.codehash, codeHash, reviewDocumentHash, kind, true);
        emit TemplateRegistered(version, factory, kind, codeHash, reviewDocumentHash);
    }

    function setTemplateEnabled(bytes32 version, bool enabled) external {
        if (msg.sender != platformAdmin) revert Unauthorized();
        if (templates[version].factory == address(0)) revert UnrecognizedTemplate();
        templates[version].enabled = enabled;
        emit TemplateEnabled(version, enabled);
    }

    function canCreate(bytes32 version, address factory) public view returns (bool) {
        Template memory t = templates[version];
        return t.enabled && t.factory == factory && factory.codehash == t.factoryRuntimeHash
            && environmentUnchanged();
    }

    function registerProject(address project, address creator, uint256 identityId, bytes32 version, bytes32 commitment) external {
        if (!canCreate(version, msg.sender)) revert UnrecognizedTemplate();
        if (projects[project].factory != address(0)) revert AlreadyRegistered();
        if (project.code.length == 0 || creator == address(0) || commitment == bytes32(0)
            || ILaunchCommitment(project).configHash() != commitment) revert InvalidConfiguration();
        uint8 kind = templates[version].kind;
        projects[project] = Project(msg.sender, creator, identityId, version, commitment, uint64(block.timestamp), kind);
        projectAddresses.push(project);
        emit ProjectRegistered(project, creator, version, identityId, commitment, kind);
    }

    function projectCount() external view returns (uint256) { return projectAddresses.length; }

    function listProjects(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        if (limit == 0 || limit > 100) revert InvalidConfiguration();
        uint256 count = projectAddresses.length;
        if (offset >= count) return new address[](0);
        uint256 size = count - offset;
        if (size > limit) size = limit;
        result = new address[](size);
        for (uint256 i; i < size; ++i) result[i] = projectAddresses[offset + i];
    }
}
