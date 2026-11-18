# Candidate state machines and accounting

These describe the local Solidity candidate, not a deployed protocol or an audited guarantee. `release-gates.json` is authoritative about missing preparation.

## Shared immutable terms

Creation records the official identity contract, platform pause administrator, fixed creator/platform recipients, positive BNB unit price, capacity, future start, `end=start+604800`, and configuration commitment. None has a setter. Every subscription validates current identity ownership, open phase, remaining quantity and exact native payment. It never interprets a project description or external page as authorization.

Every subscription also has a permanent wallet-scoped request ID and a current deadline at most300seconds away. Duplicate IDs and expired calls revert without collecting the payment. Token positions increment a revision on subscription/exit/refund/delivery; voluntary exit must name the exact current revision and a fresh deadline. A new intended subscription after exit uses a new request ID. These guards do not change price, allocation, fees or the seven-day sale duration.

Paused time accumulates across all pauses. Only platform may pause/resume, and only before close. Reaching24 cumulative hours while paused, or reaching the original deadline while paused, makes cancellation irreversible. Deadline does not move. Mature claims, credits and refunds have no pause gate or expiration. An ordinary pause does not itself confiscate funds or create a fee.

## NFT

| State / trigger | Available operation | Required accounting |
| --- | --- | --- |
| Before start | Read only; platform may pause new subscriptions | No participant funds collected |
| Open, not paused | Subscribe bounded units | Exact payment held; reserve next sequential IDs for original wallet |
| Sold out | Anyone finalizes success |10% floor to platform credit; remainder to creator credit; no immediate external payout |
| Finalized success | Anyone assists exact-ID delivery | Mint only original reserved IDs to original wallet; each once |
| Unsold at deadline / cancelled | Anyone assists refund credit |100% original subscription principal to original wallet; no platform/creator fee |
| Credit exists | Anyone assists withdrawal | Pay only credit owner; debit before external call; revert preserves credit on failure |

Failure never mints a tradable NFT. A safe-mint callback failure preserves the entitlement through transaction rollback. No random reveal, royalty, arbitrary admin mint or metadata setter exists. Local metadata commitments still require a real complete CID/root publication and availability proof before release.

## Token

| State / trigger | Available operation | Required accounting |
| --- | --- | --- |
| Open | Subscribe | Exact principal held; identity aggregate <=4% of initial public allocation |
| Open, before end-minus15minutes, not sold out, no full-refund branch | Exit entire original-wallet/identity position | Remove100% principal from active raise;95% participant credit,5% platform credit; release identity quota |
| Minimum reached before close | Continue subscriptions | Minimum does not give creator early-finalization authority |
| Sold out or deadline, minimum reached, within48hours | Try atomic pool finalization | Require zero LP/project-token reserve; record external one-sided WBNB separately; no creator/platform success payout on failure |
| Pool finalization succeeds | Distribute / self-claim |80% BNB to fixed pair;15% creator credit; remaining5% plus wei remainder platform credit; burn unused inventory; LP irreversible |
| Deadline below minimum, cancelled, or48hour pool timeout | Full refund |100% remaining original principal; no new fee; earlier completed exits remain settled |
| Successful delivery | Later duplicate batch / self-claim | Shared delivered flag prevents repeating any entitlement |

`activePrincipal` is the successful-close denominator and excludes exited principal. After a failure, individual refunded positions are zeroed but the historical close denominator is retained; the sale cannot reopen or become successful by refunding participants. Do not display that historical denominator as currently held cash. Events and current credits/positions must distinguish original principal, active rights, credit due, withdrawn amount and delivered tokens.

## Conservation checks

- Before successful finalization and before mature refunds, escrow native balance must cover active subscription principal plus all outstanding exit/platform credits. Credits may be withdrawn without reducing funds backing other positions.
- After a failed/cancelled sale, all remaining original principal must remain available either as an unconverted refund entitlement or a pending participant credit. The same position cannot take both paths twice.
- Successful token BNB accounting: `L=floor(R*80/100)`, `C=floor(R*15/100)`, `P=R-L-C`. This guarantees `L+C+P=R`; exact sub-wei percentages are impossible. Dust policy must be visible in the final specification.
- Initial1B token issuance equals current total supply plus permanently burned tokens. Public delivery inventory, fixed-pair inventory, collected tax and user balances must never be conflated.
- Participant delivery is `wholeUnits*10^18`. Genesis liquidity is `floor(L*10^18/unitPriceWei)`. Successful-close remaining inventory minus all participant entitlements burns; it is never routed to creator/platform.
- External one-sided WBNB is not participant principal and does not enter `R,L,C,P`. It increases actual WBNB reserves only. The protocol contribution ratio follows the fixed subscription price; actual reserve/market ratios include external transfers. LP from genesis remains irrecoverable in both synced and unsynced donation cases.
- NFT IDs are assigned by successful subscription transaction order. All successful mint paths count toward the creator's lifetime cap. Burn does not open a remint path.
- A settled position cannot be delivered and refunded; batch and self-claim consume the same delivery flag. Any helper can pay gas, but cannot select a different destination.

## Tax conversion

Only incoming transfers to the one immutable official pair take2%; transfers from that pair and ordinary transfers are0%. The only exemptions are genesis-liquidity transfers from the escrow before trading and the token contract's active fixed conversion path. No account-wide exemption administration exists.

Collected tax lives at the token contract; subscriber inventory lives at its escrow. Each conversion is bounded by collected tax and1% of current pair token reserve. Average-price observations require warmup and freshness; too-long gaps reset warmup. A reference outside constraints stops conversion. Actual output must meet the3%-shortfall minimum; caller cannot widen it. Post-swap native BNB is credited equally, with an odd wei assigned to platform. No conversion occurs automatically during an ordinary user's sell.

## Required verification still outside current tests

Official PancakeSwap V2 code/fork behavior, manipulated cumulative-price histories, maximum reserve/uint/rounding ranges, all EVM callback/gas extremes, persistent indexing and event reorgs, content proofs, executable Agent consent/recovery, measured executor budget, complete testnet rehearsal, template factory/registry provenance and independent security review. Local test doubles must never be presented as evidence that these gates passed.
