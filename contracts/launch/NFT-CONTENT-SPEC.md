# NFT content preparation candidate

This is a technical preparation specification,not an independent audit or a live storage commitment. No public upload,pinning subscription,provider account,wallet signature or chain deployment is performed by these tools. Existing ECHO Mint is separate.

## Immutable collection package

The operator supplies a complete sequential collection and local image files. Build input has `supply` and `items`; every item has `tokenId,imageFile,metadata`. `metadata` currently supports name,description and attributes. The builder supplies the immutable image CID and tokenId. Unsupported mutable media fields are rejected rather than silently omitted. PNG,JPEG,WebP and GIF are identified by headers; a content-integrity pass is not an image-decoder,authorship,license or moderation certification. Images are untrusted content and must never become Agent instructions.

Images must resolve inside the explicitly selected asset directory,including after symlink resolution. Absolute paths,parent traversal,unsupported active SVG and oversized files are rejected. No image URL from metadata is fetched. Default process resource limits are256MiB CAR/logical content,16MiB per image,1MiB per metadata JSON and10,000 records; maxBytes/maxRecords can be selected for a larger offline job. These are tooling resource limits,not NFT economic supply limits or a change to the creator-defined immutable contract cap. Larger collections need adequate resources or a separately verified streaming extension before use.

The root is a CIDv1 SHA256 dag-pb UnixFS directory. It contains:

```text
<root CID>/
  1.json
  2.json ... N.json
  images/1.png ... N.<detected image extension>
  _echo-content.json
```

Each metadata image points to its own content CID. The image files ALSO appear as real linked children of the collection directory,so recursive pinning of the directory reaches the images. A JSON text reference alone would not create that IPLD link.

Metadata uses sorted-key UTF8 compact JSON. Unsafe integer JSON attributes,unsupported JSON values and excessive nesting fail rather than being rounded or truncated. The importer is exact-pinned17.1.1 with CIDv1,raw leaves,262144-byte fixed chunks,wrapped directory and single file/block concurrency. CAR blocks are emitted in canonical CID-string order with their original codecs. MemoryBlockstore's multihash-only getAll representation is not used to reconstruct CAR CIDs. Repeated builds of the same input bytes produce the same directory CID,metadata root and archive bytes. Changing an image,attribute,number or name changes the commitment.

## Collection commitment and per-item proof

`metadataRoot` is an OpenZeppelin StandardMerkleTree root. Leaves have ABI types:

```text
[bytes32 domain,uint256 supply,uint256 tokenId,bytes32 metadataHash,bytes32 imageHash]
domain = keccak256(UTF8("ECHO_LAUNCH_NFT_CONTENT_V1"))
metadataHash = keccak256(exact metadata JSON bytes)
imageHash = keccak256(exact image file bytes)
leaf = keccak256(keccak256(abi.encode(values)))
```

The StandardMerkleTree library sorts leaves and uses sorted pairs. Including supply and ID binds a proof to the immutable collection count and a specific sequential NFT. `_echo-content.json` contains all expected file paths,CIDs,byte lengths,hashes and per-item proofs. This manifest is itself inside the content-addressed root. A frontend SHA256 metadata-array digest is a separate local checksum and is never substituted for this root or a publication proof.

The full verifier checks every CAR block hash,root,expected complete directory listings,sequential ID,count,metadata CID,image CID,canonical bytes,exact hashes,image MIME header,all proofs and a rebuilt complete tree. Independently exporting the UnixFS files must reproduce the images and metadata. Valid repeated CAR blocks are hash-checked and deduplicated; they remain subject to total byte/block limits. Missing or corrupt blocks never count as successful content retrieval.

The creation terms are `baseURI=ipfs://<directory CID>/` and the verified metadataRoot. The SDK compares the CAR with the exact supplied creation terms and rechecks it during preparation. NFT subscription checks compare with the CURRENT registered contract's capacity,baseURI and metadataRoot. A changed or omitted verified package invalidates the quote. Existing mature refunds and NFT claims do not depend on a gateway or local CAR remaining available; content availability cannot confiscate those rights.

## Local CLI

```text
node agent/echo-nft-content.mjs build --input <complete-spec.json> --asset-root <selected-local-assets> --out-dir <new-output-directory>
node agent/echo-nft-content.mjs verify --car <collection.car> --reference <reference.json>
node agent/echo-nft-content.mjs retrieve --reference <reference.json> --gateways <https-origin-A>,<https-origin-B>
```

Build writes a validated CAR,reference and manifest into a new directory using same-parent staging and rename. It refuses to replace existing output. The reference reports local verification only and includes the archive SHA256. It is self-consistency evidence,not a trusted creator signature. `--content-car` supplies the CAR to Agent `quote-create`,NFT subscription `quote`,and `prepare`; the original quote plus new explicit payment/Gas consent remain required.

Read-only retrieval uses two to four operator-configured origins,never URLs copied from project prose. Public mode requires HTTPS and public resolved addresses; DNS results are pinned to the request to avoid a second unvalidated lookup. HTTP and loopback are permitted only by explicit local-test mode. Redirects,compressed unexpected responses,wrong media types,status errors,oversized/partial data and invalid blocks fail. CAR requests explicitly ask for dag-scope=all,CARv1 and no duplicates; valid duplicate blocks are still accepted. The HTTP timeout covers request/stream operations; DNS lookup uses the OS resolver and is not represented as a hard total wall-clock deadline.

Two successful origins provide timestamped retrieval observations. They do not prove independent infrastructure ownership,source authenticity,paid retention or permanent storage. `publicationVerified` and `durablePinningVerified` remain false. A CAR generated or retrieved only on localhost cannot unlock public NFT execution. Public NFT creation AND subscription preparation remain blocked until independently reviewed publication/retention policy and real configuration are established. This restriction does not apply to mature refunds or claims.

## Remaining release work

Actual Kubo0.43.1 interoperability is verified in `evidence/kubo-offline-result.json`: two isolated native repos import and recursively pin the complete CAR,survive garbage collection,export it and return all exact metadata/image bytes. Loopback-only offline daemons serve the committed DAG,including after restart; an archive missing an image fails recursive pinning and complete verification. All21checks pass and owned daemons stop. Official release checksums and the executable hash are recorded. These repos contain generated local test peer identities; never publish or package their private repo configuration. This evidence establishes local compatibility and persistence only,not public availability or retention.

- Choose and verify actual immutable storage/pinning arrangements,backup operators,costs and retention/recovery responsibilities; no provider purchase or upload is authorized by this local build.
- Run public full-DAG retrieval and periodic availability checks against the same committed collection after a separately authorized publication.
- Review permissionless project creation versus per-project content verification. An immutable nonzero root/URI in the contract alone cannot prove complete or available artwork. UI/SDK checks are not a contract-level attestation service,and direct callers can bypass them. Do not claim that every registered project's content is verified.
- Reconcile the final content-commitment profile with independent security review,project-approval/display policy,real wallet/testnet and all other release gates.

## Dependency provenance

Exact-pinned IPFS UnixFS importer/exporter,multiformats,CAR and OpenZeppelin tree packages are used instead of an invented CID format. OpenZeppelin's transitive MetaMask utils dependency used uuid9; the initial four-moderate audit result is retained. A scoped override to patched CJS-compatible uuid11.1.1 preserves its used v4 API. Fresh npm ci,proof/CLI/lifecycle tests and npm audit must all pass. No dependency advisory count is called a contract audit.

Primary references: https://docs.ipfs.tech/concepts/persistence/ ; https://specs.ipfs.tech/http-gateways/trustless-gateway/ ; https://github.com/ipld/js-car ; https://github.com/OpenZeppelin/merkle-tree ; exact installed package READMEs ; https://github.com/advisories/GHSA-w5hq-g745-h8pq . The attempted online UnixFS documentation links failed; they are not claimed to have been read successfully.
