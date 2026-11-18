# Preparation findings and remediation evidence

No item below is an independent audit report. Findings are engineering review of this local candidate. Existing ECHO Mint is outside this directory and unchanged.

## LAUNCH-AVAIL-001 — pre-pool WBNB contamination can force a token launch failure

Status: reproduced with exact deployed PancakeSwap V2 runtime; repaired in the local candidate and regression-tested. Independent review, final reserve-price disclosure and the other release gates remain open. This is not a production security approval.

The legacy token candidate deployed its fixed official pair before subscriptions closed and insisted both balances/reserves and LP supply were zero. Anyone could transfer even one wei of WBNB to stop finalization. Calling `sync` made the donation a recorded reserve. There was no demonstrated right to steal escrow funds, and the48-hour full-refund fallback worked, but the availability attack could force failure and cost users gas/time.

The preserved legacy artifact in `evidence/baseline-agent41/TokenLaunch.json` reproduces the denial and full timeout refund with exact captured deployed V2 runtime. The replacement accepts only one-sided WBNB with no LP, no token reserve and no token balance; it still rejects an existing/incompatible token pool. Pre-launch token-transfer restrictions prevent an external participant from obtaining LP before atomic settlement. The pair is initialized through direct `mint`, which handles already-synced one-sided WBNB without a router quote against a zero token reserve.

Participant principal still follows `L=floor(R*80/100)`, `C=floor(R*15/100)`, `P=R-L-C`; nominal liquidity tokens remain `floor(L*10^18/unitPrice)`. External WBNB is recorded in `externalPoolWbnb` and `ExternalPoolWbnbObserved`, never counted as raised principal, fees or issuer funds. All genesis LP, including the pair's minimum-liquidity mint, goes to address(0). Public inventory, remaining burns and original-wallet delivery are unchanged.

Actual pool WBNB reserves include external donations, so the observed initial reserve ratio can differ from the protocol's nominal contribution ratio. The Agent discloses this distinction and invalidates an old consent if the pool observation changes. Do not label either ratio as a guaranteed execution price. Final public disclosure and independent consistency review remain required before registration of a production template.

Evidence: `evidence/local-chain-result.json` covers the current lifecycle/Agent cases. `evidence/official-dex-runtime-result.json` covers8 exact-runtime cases: legacy attack/refund; empty,unsynced-one-wei,synced-one-wei,large-donation settlement; actual-router0%-buy/2%-sell and conversion; taxed later liquidity/ordinary untaxed transfer; shocked/stale oracle stop. Source,lockfile,harness,client and capture hashes are checked by the readiness report.

Runtime provenance: official factory/router addresses from https://developer.pancakeswap.finance/contracts/v2/addresses; WBNB resolved from the router and a deployed pair resolved from the factory. `references/pancake-v2/deployed-runtime.json` captures all four code hashes at canonical BSC block133533855. The fresh local factory creates a pair matching the independently captured deployed pair hash exactly. Storage is reset, feeTo is zero and balances are synthetic: this is not a historical-state fork, current production execution or an independent audit. The failed official GitHub source fetch is retained; it is not treated as verified source compilation.

## LAUNCH-OPS-002 — an unbuffered local router estimate was not a sufficient transaction gas limit

The durable-index integration run exposed a separate unbuffered mock-pair `sync()` failure, identified by selector `0xfff6cae9`; that complete58-pass/1-fail report is preserved in `evidence/index-integration-initial-failure`. A new deterministic local regression pins the estimate to an unchanged timestamp, advances the mined timestamp by one second,and captures an actual failed transaction debug trace. It measures42130estimated gas versus82546used by the subsequent successful cumulative-price update. This proves the fixture's timestamp-dependent zero-to-nonzero storage cost can exceed an unbuffered estimate; it does not reconstruct the closed earlier router trace. Mock-pair sync calls now use a bounded200000fixture allowance; all price-shock/staleness assertions remain and no contract source/economic parameter changes. See `evidence/fixture-sync-gas-regression.json`. Neither this fixture allowance nor a percentage buffer guarantees a future production transaction's gas.

An expanded exact-runtime run had one router call revert when using the unbuffered estimated gas; the failed run is preserved in `evidence/official-runtime-estimate-failure`. No contract state change was made to hide this failure. The runtime harness now uses the same130% gas buffer already present in the Agent and records estimated,allowed and consumed gas. All8 cases then pass. Timestamp-dependent cumulative-price updates are a plausible source of extra work; the original closed fixture did not retain a debug trace, so this is not asserted as a conclusively traced cause. A buffer is not a guarantee: the actual wallet preview and the separate user-approved gas cap remain mandatory.

## Fixed historical-state fork follow-up

The separate `evidence/historical-dex-fork-result.json` now records actual BSC checkpoint storage inherited into local EVM31337. The runner verifies the real factory pair count,nonzero `feeTo` and an existing pair's reserves before creating local candidate pairs. Eighteen local transactions cover settlement,initial LP disposition,router buy/sell,taxed later liquidity,protocol-fee LP mint,tax conversion and the repaired synced-one-wei donation case. A second public endpoint verifies the same checkpoint header/state root;the evidence verifier checks source,compiled artifact and harness hashes. See `HISTORICAL-DEX-FORK.md`.

This closes the scoped absence of a real-state fee-on fork rehearsal;it does not turn the separate fresh-empty-storage runtime test into a fork or establish independent security review. The fork uses a recent confirmed checkpoint,Shanghai EVM execution,mock identity and synthetic accounts. Older storage access failed in the recorded RPC probe;archive coverage and full BSC consensus equivalence remain unverified. No mainnet transaction was sent.

## LAUNCH-ACCT-003 — preview and candidate differ on BNB integer rounding

Status: user-confirmed policy aligned in the unpublished frontend on2026-11-15. Candidate contracts are unchanged. See ACCOUNTING-CHECKS.md, rules/user-decisions-20261115.json and the source-bound evidence/rounding-policy-comparison.json.

The original preview floored each nominal success allocation and kept unassigned BNB dust; it also floored95%early-exit refunds. The candidate floors80%liquidity and15%creator then credits the remainder to the platform; NFT floors10%platform then credits the creator; voluntary exit floors5%fee then refunds the rest. The user explicitly selected these candidate formulas.

The current preview matches all5success and3exit source-formula samples. New demo settlements identify the new policy,while legacy records preserve their original amounts. The previous mismatch report is retained separately. This comparison is source analysis,not a new on-chain settlement or independent audit. The token1wei formula still cannot fund nonzero liquidity: the separate tested48hourtimeout returns the full principal. Other release gates remain open.

## LAUNCH-ACCT-004 — double-floor minimum could exceed the selected3%shortfall

Status: reproduced with exact captured V2 runtime and an actual95wei local payout;repaired in the unpublished candidate. Focused exact-runtime regression,101rational quote samples and the documented source-bound local regression/browser refresh now pass. Independent review and the other production gates remain open;older artifacts/reports are preserved separately and are not relabeled as current repair evidence.

The previous code used `floor(floor(amount*averagePriceX112/2^112)*9700/10000)`. A permitted tiny-price project produced an integer reference98wei and accepted95wei,which is3.0612%below that reference. The rational97%minimum was96wei. See `evidence/oracle-boundaries-baseline-rounding-gap-result.json`,its bound walkthrough and preserved old artifacts.

The replacement computes the exact rational ceiling with full-precision quotient/remainders,without multiplying an overflowing three-factor numerator. The same router output now triggers PriceProtection before tax is spent or credit is created. Percentages,the1%reserve cap,immutable recipients and fund obligations remain unchanged. This repairs the literal existing3%rule;it does not provide a fair-price/manipulation guarantee. The separate successful-cash/exit rounding policy was later explicitly confirmed and aligned as described above.

## Recipient and unrelated native-surplus follow-up

Six source-bound local cases now cover rejected/gas-griefing native payments,cross-entry withdrawal/refund/conversion reentrancy,NFT explicit/wrong-selector/gas-grief callbacks and full-batch rollback,callback-free ERC20 delivery,and forced native transfers into sale/token contracts. The terminal walkthrough records108successful receipt observations across six isolated chain instances,13typed actual failed receipts,and4forced transfers with constructor receipts and before/after balances. See `RECIPIENT-AND-SURPLUS-CHECKS.md`.

Within these cases,recipient failure does not erase its credit or prevent independent holders from claiming/refunding;reentry does not duplicate rights. Forced native balance does not satisfy subscription minimums or become creator/platform/refund/tax-conversion income. Fixed-original-recipient rules still mean a permanently rejecting/inaccessible address can have unpaid rights that cannot be redirected. Unrelated forced surplus remains inaccessible after legitimate liabilities are discharged because there is no rescue/sweep authority. These are explicit operational limits,not a newly introduced recovery permission or universal smart-wallet/audit approval.

## Other open gates

`LAUNCH-CONTENT-001`: current NFT factory creation checks only a nonzero root and an IPFS-shaped URI,not complete content or public storage. Direct callers can bypass the new complete CAR/Agent checks. The local toolchain now proves every image/metadata,root and sequential tokenURI binding,while nonlocal NFT creation/subscription preparation stays blocked. The user selected permissionless creation on2026-11-15; no platform content-approval signer or permission is added. Frontend/Agent participant checks and truthful unverified-content labels remain necessary;see `NFT-CONTENT-ADMISSION-PROPOSAL.md`. Public pinning and retention are not verified.

Exact arithmetic/reserve extremes and rounding,adversarial price-oracle histories,NFT public content/admission,production index/provider operations,funded and authorized executor operations,public testnet rehearsal,real wallet/deployment signing compatibility and independent review remain tracked in `release-gates.json`. Local index,reorg,Gas measurement and recent fee-on historical-state fork evidence are preparation results within their documented scope.
