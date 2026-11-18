# ECHO public source

ECHO is a BNB Chain project combining Genesis Mint and ECHO Launch, an Agent-oriented fixed-rule issuance platform.

- Website: https://echobsc.fun/
- Launch: https://echobsc.fun/launch/
- Chain: BNB Chain, chain ID 56
- Frontend export: deployed v77, source commit 63f3c93ff3caf06534374c5a58ff071a4d7075c4

## Current scope

Token Launch is a mainnet public beta. NFT implementation is included as source for review, but NFT creation and subscription remain disabled. Contracts have not completed an independent security audit; source verification and local tests are not an audit or a guarantee. Read current on-chain state and the live config/status before acting.

## Repository

| Directory | Purpose |
| --- | --- |
| frontend/public | Current website and Launch browser source/assets |
| frontend/worker | API, state checks, receipt verification and traffic logic; no production data |
| frontend/operator | Operator implementation only; no wallet profiles, sessions or signing material |
| frontend/dist | Retained legacy fixtures used by historical regression tests; not the current serving root |
| contracts/genesis | ECHO Token, Genesis Mint and Oracle contracts |
| contracts/launch | Registry, token/NFT template source, unsigned Agent client and local tests |
| deployments/bsc-mainnet.json | Public deployed addresses and dated verification snapshot |
| docs | Security, provenance and setup notes |

## Local development

Use Node.js 24 (the contract tests use node:sqlite and native local-chain dependencies). From the repository root:

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix contracts/genesis ci --ignore-scripts
npm --prefix contracts/launch ci --ignore-scripts
npm run check:public
npm run build:frontend
npm run compile:genesis
npm run compile:launch
npm run test:frontend
cd frontend && npm run dev
```

The preview serves public/ at http://127.0.0.1:4193/. A static preview does not provide the Worker API, production database or wallet operator. Financial workflows require a separately configured backend and official wallet; no live signing or deployment is performed by the build/test commands above.

## Agent flow

Read current config and chain state → verify official Agent ID and original wallet → itemize payment and Gas → simulate the exact call → obtain fresh user approval → submit once → verify actual receipt and delivery/refund. Unknown submission results must be reconciled before retrying. The public Launch SDK constructs unsigned calls; it does not provide signing authorization. Never run baw inside webpage JavaScript.

## Public source boundaries

This repository starts with a clean history. Production credentials, wallet material, database rows, analytics visitors, local execution journals, hosting credentials and deployment grants are omitted. Some build/test paths are adapted for this standalone repository; Solidity source bytes are preserved. Historical private work logs and legacy deployment-helper pages are not included.

No automatic deployment is connected to this repository. Creating or editing it does not change the production website, contracts, permissions or economic rules.

## Licensing

Existing SPDX and third-party license notices remain applicable. No new blanket license or trademark/artwork license is granted by this source publication; see NOTICE.md.
