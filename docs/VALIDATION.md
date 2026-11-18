# Public export validation

Validated on 2026-11-18 with Node.js 24.18.1, in this standalone export rather than the production checkout.

| Check | Result |
| --- | --- |
| Frontend dependency installation from lockfile | Passed, lifecycle scripts disabled |
| Current frontend Worker build | Passed |
| Frontend regression suite | 203 passed, 0 failed |
| Genesis Solidity compilation | Passed, solc 0.8.24, optimizer 200, viaIR, Shanghai |
| Launch Solidity compilation | Passed, solc 0.8.38, optimizer 200, Shanghai |
| Export provenance hashes | 534 selected source files matched |
| Bounded secret/path scan | No unresolved findings |
| Included public SDK archive inspection | 3 archives checked, no private-path or credential-pattern findings |

Five synthetic credential-bearing URL samples were reviewed as negative test cases. The scanner exceptions bind each exact test path, line and match digest; they do not exempt entire files.

The legacy rescue regression uses two dated public deployment snapshots. They are test fixtures, not current feature/verification claims. Current address submission data is in `deployments/bsc-mainnet.json`; current operational state must be read from the chain and website APIs.

This validation did not deploy contracts, submit a transaction, spend Gas, alter permissions or change the production website. It does not constitute an independent audit or a complete guarantee of secret detection. Mainnet/public-testnet transaction rehearsals were not repeated for this source export.
