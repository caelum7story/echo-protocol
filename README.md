# ECHO public source

BNB Chain Genesis Mint and Agent-oriented Launch platform.

- Website: https://echobsc.fun/
- Launch: https://echobsc.fun/launch/
- Chain: BNB Chain, chain ID 56

## Download the complete source

[Download echo-protocol-source.zip](./echo-protocol-source.zip)

The complete 546-file source tree is currently supplied as this archive. Native folder synchronization is pending a separate GitHub connection; the archive can already be downloaded, extracted and reviewed. Its README contains the exact local build instructions. No production keys, wallet profiles, customer database rows, visitor identifiers or private execution journals are included.

SHA-256: `906e10ceb21a558f8e059d290c45cfdcc77b3b429636863152a28652f194bf32`

## Included

- Current frontend and Worker source, public assets, operator implementation without credentials.
- Genesis ECHO Token, Mint and Oracle Solidity source.
- Launch Registry and issuance templates, unsigned Agent client and tests.
- Public contract addresses and dated BscScan verification snapshot.
- Build, provenance, security and license notes.

## Validation

Frontend build passed; 203 frontend regression tests passed. Genesis and Launch Solidity compilation passed from the standalone export. Bounded sensitive-path/credential-pattern scans and public SDK archive inspection have no unresolved findings. These checks are not an independent audit.

## Current product scope

Token Launch is a mainnet public beta. NFT implementation is included for review, but NFT creation/subscription remain disabled. No independent contract audit has been completed. Query current chain and API state before acting. This source publication does not deploy contracts, change economic rules or connect automatic website deployment.

Individual SPDX and bundled third-party licenses remain applicable; no new blanket trademark or artwork license is granted.
