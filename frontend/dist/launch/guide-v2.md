# ECHO Launch local preview v2

## Local contract/Agent input mapping (2026-11-14)

The single complete command includes a supplemental `echo-launch-runtime-intent/v1` mapping and retains the full original review JSON unchanged. It maps fixed-price integer wei,start time and NFT supply/token minimum to the local contract candidate's creation terms; requested token budgets retain whole-unit rounding and unused wei. Official registry,approved template,wallet,identity,project address and fixed creator recipient remain unconfigured. NFT publication URI and on-chain metadata commitment remain missing: a frontend SHA256 metadata digest is not substituted as either proof.

The independent local contract project now implements creator quote/unsigned preparation/creation receipt recovery and original-wallet batch delivery with exact Transfer checks. Duplicate creation requests recover the registered project; concurrent self-claims are distinguished from deliveries proven by the batch receipt. This browser preview does not connect to that local test chain or a real network. All visible entries remain read-only,with executionReady=false. Copied input mapping is not a wallet authorization or a public API availability claim. Formal configuration,independent review,NFT content publication,testnet and wallet-preview compatibility remain release gates.

## Current Agent handoff and flow checks (2026-11-14)

All visible Agent entry points use one complete read-only command: standalone Agent page, creator workspace, project material, NFT/token requested subscription, identity records and operating-cost review. Copy once and paste to the Agent. Full material is embedded after the review instructions; no separate attachment is required. Downloads remain optional for backups or material too large for a receiving chat. Never silently truncate metadata to fit a chat.

Complete projects use echo-launch-review-package/v1. Requested subscriptions use echo-launch-subscription-review/v1 with the exact requested payment, quantity, allocation share and reserved NFT IDs where applicable. Existing local identity/state evidence is included when available. Incomplete creator drafts instead use echo-launch-draft-review/v1 with complete raw draft data and explicit missingFields; they are not complete manifests. Operating reviews use echo-launch-operating-review/v1 containing both projectReview and operatingPlan. Every wrapper remains executionReady=false, chainVerified=false, unsignedTransaction=null and transactionHash=null.

The local flow paths are: NFT sellout → claim reserved IDs; NFT unsold expiry → full-principal refund; token minimum + successful liquidity → platform distribution or self-claim fallback; token below-minimum expiry or48-hour liquidity timeout → full-principal refund. Token voluntary early exit is separately95% refunded,5% platform, closes15minutes before expiry or at sellout. Cancellation preserves a full refund. Gas is separate and unestimated. No flow signs or sends a transaction.

New refund/exit records retain original units/principal, refund amount, platform fee and capture time in settlement. Runtime checks reconcile those values with fixed price and the applicable refund rule. Current positions become zero; settled quantities are not current holdings. Refund amounts remain visible after reload and are included in the complete Agent record. Legacy records without amount evidence stay unknown rather than being reconstructed. NFT refunds additionally preserve retired IDs and corresponding metadata. Repeated refund or delivery is rejected; delivery by one path consumes the same entitlement as the other path.

The versioned notes below describe earlier iterations. Their compact-brief/two-file instructions are historical; the current UI uses the single complete command above. This remains a local frontend preview, without deployed Launch contracts, wallet authority or an audit.

## NFT reservation and delivery evidence (local v2.5)

NFT sessions reconcile the complete set of local identity positions, with non-overlapping ID ranges, exact counts/principal, a lifetime reservation high-water mark and retired refunded ranges. Other example IDs are shown separately; they are neither this identity's holdings nor verified delivery. Loading samples assigns unassigned example IDs first and never duplicates an existing or refunded ID. Invalid legacy records are preserved for backup/archive rather than filled with invented ID evidence.

The participant view offers this identity's matching NFT artwork and metadata, with a bounded eight-item preview. Download `echo-launch-position-{projectId}.json` for all corresponding items. `echo-launch-position-evidence/v1` is browser-local demo data only: `transactionHash=null`, `chainVerified=false`, `executionReady=false`. A claim record is not an on-chain transfer or ownership certificate. Refunds preserve their original IDs, units and principal, and cannot be repeated. Normal reload retains the ledger; backup history restores valid ID evidence without restoring active session/claim authority.

The compact position Agent brief omits image bytes, limits range previews and requires both the complete position file and full project JSON. Identity ownership, real wallet binding, content persistence and chain delivery remain unverified. Long participant forms now use normal document scrolling; identity input immediately updates its corresponding record and clears old actions when the name is invalid.

## Complete-file and local-seal checks (local v2.4)

`#/verify` reads a full v2 manifest locally (maximum 2 MB). It recalculates `configDigest` from the parsed object excluding that field, checks the NFT metadata digest, and independently rebuilds the current-template manifest. A matching source hash with forged contract/economic/execution fields still fails current-template consistency. Whitespace indentation alone does not alter the digest. Original files are never modified or uploaded.

Importing project data from this screen always creates a new unsealed review draft. The source fingerprint, execution fields and contracts are not adopted. A fingerprint is not an author signature: changing both valid project data and its digest can pass local consistency, so source authenticity, contract safety and chain state remain separate requirements.

Stored sealed plans are rechecked on load and before full-manifest export. The check is bound to the current local content snapshot. Missing/mismatched fingerprints, unsupported versions or invalid data prevent sealed participation/export, while original data, backup and copy-as-new-draft remain available. New seals retain their business rule version; older seals are accepted only when their existing digest exactly matches the unchanged current manifest. No old digest is silently replaced.

Runtime numeric checks bound decimal BNB to uint256 wei, reject a price whose full public raise exceeds that range, and bound integer counts before BigInt conversion. These are frontend input constraints, not a deployed Solidity implementation or security audit. General contract arithmetic still requires independent design and testing.

## Operating assumptions (local v2.3)

`#/costs/{projectId}` is a workspace calculator for NFT/token launch plans. Budgets, pre-fee costs, later costs, failure costs, recipient wallets and per-batch Gas assumptions are entered manually. Empty fields mean unknown, not zero. The calculator separately shows startup funding before success fees become spendable, success-path fee less entered costs, and the failure-path funding gap. Escrowed principal, the 80% liquidity principal, future trading tax and voluntary-exit fees are not operating-budget inputs or baseline fee income.

The fixed rules remain NFT 90/10 and token 80/15/5. NFT success still requires sellout; token success still requires the immutable minimum and successful liquidity settlement. A coverage reference does not edit price, minimum or fees. Recipient wallets, token units and official .ai identities are different quantities. Under the current whole-token preview, full public allocation needs at least 26 identities because of integer rounding; this is not a participant forecast.

Operating records live in a separate `operatingPlans` map. They survive reload and optional merge-only backup restoration without changing sealed project data or fingerprints. JSON export uses `echo-launch-operating-plan/v1`, with `executionReady=false`, `unsignedTransaction=null`, `liveGasEstimated=false` and `walletBalanceVerified=false`. The Agent brief authorizes read-only review only. An illustrative preset is not a real fee quote, verified wallet balance, security review or profit guarantee.

This is an unhosted local frontend, not a live issuance service. `executionReady` is always `false`. Chain ID is 56. All Launch, asset, factory, identity, router, WBNB and pair addresses are `null` until separately verified and integrated. Never reuse the existing ECHO Mint contract.

## Project and creator surfaces

- `#/projects`: clearly marked illustrative examples, browser-local sealed plans, and an empty live-project category.
- `#/project/{id}`: participation, price, state, refund rules, asset and delivery information.
- Project detail section navigation jumps directly to participation, overview, terms and NFT collection/liquidity, with keyboard focus and fixed-header clearance.
- `#/create/nft` and `#/create/token`: four-step creation, validation and local sealing.
- `#/manage/{id}`: creator workspace, readiness, copy-as-new-draft, export and Agent review.
- `#/activity`: local walkthrough records. IDs start with `demo:`; transaction hashes are null.
- `#/agent`: complete structured manifests and compact read-only review briefs, including unsealed local drafts.
- `#/rules`: current business rules and unimplemented prerequisites.

## Confirmed business baseline

Both templates use a creator-set positive fixed BNB price and a future start time, with an immutable 7-day subscription period. No live bonding-curve template is offered.

NFT: creator-set lifetime cap, locked before collection. Complete names, art and attributes must be fixed before collection. Sequential IDs are reserved in successful subscription order. Sellout is required for success; claim the reserved NFTs after success. Otherwise refund all principal, without Gas. No voluntary early exit. Successful funds split 90% creator / 10% platform, no extra issuance fee and no secondary royalty.

Token: uniform initial supply 1,000,000,000; no free team allocation. Creator sets an immutable minimum BNB raise. Reaching the minimum does not close subscriptions: expiry or sellout does. Successful active principal splits 80% liquidity / 15% creator / 5% platform, with no additional issuance fee. The initial PancakeSwap V2 token/WBNB ratio matches the subscription unit price; this is not a later executable-price promise. LP is irrecoverable. Unsold public tokens, unused liquidity reserve and token dust are permanently burned.

Below the minimum at expiry: full principal refund and no platform fee. Liquidity may retry for 48 hours from the original close; funds remain escrowed and undistributed. Timeout: full principal refund and no platform fee. Claims and refunds never expire; Gas is excluded.

Token voluntary exit: the entire current position, 95% principal returned, 5% to the platform, Gas excluded. The window closes 15 minutes before the original deadline or at sellout, whichever is earlier. Exit removes all of that position’s principal from active raised funds and releases identity quota. Full-refund branches take precedence over voluntary-exit fees.

Token identity cap: each official .ai identity may hold active subscriptions up to 4% of the initial public allocation, not 4% of all supply or remaining supply. Later DEX trading is not subject to this cap. NFTs have no cumulative identity cap. This preview checks name format only, not identity ownership.

Only the platform may pause new subscriptions, up to 24 cumulative hours, without extending the deadline. A project still paused at that limit or the deadline cancels with full principal refunds and no platform fee. Mature refunds and earned claims remain available. Existing fund/asset templates are non-upgradeable; new reviewed versions serve new projects only. No admin mint, tax change, blacklist, freeze or forced asset transfer.

Buy 0%, ordinary transfers 0%, transfers into the fixed official pair 2%, including later liquidity additions. Genesis liquidity and the fixed tax-conversion path are exempt. Other pools are not guaranteed covered. Actively convert accumulated tax to BNB and split equally between creator and platform. Maximum 3% output deviation and 1% of official pair token reserves per conversion are initial parameters still needing tests. Unavailable valid on-chain reference prices must stop conversion, not ordinary trades.

## Local precision policy — not a final contract specification

The prototype uses whole-token subscriptions and 18 token decimals. Public allocation is rounded down to 555,555,555 whole tokens; liquidity reserve 444,444,444; initial remainder 1 token is burned. Identity cap rounds down to 22,222,222. BNB is integer wei. On2026-11-15 the user confirmed: token success floors80%liquidity and15%creator,then credits the remainder to the platform; NFT success floors10%platform fee and credits the remainder to the creator. Voluntary token exit floors the5%fee and refunds the remaining principal. There is no unassigned BNB residue. New local records identify this policy; old records retain their original amounts and are labeled legacy. Contract validation remains required.

NFT creation is permissionless under the user's2026-11-15decision. No platform content-approval signer or approval authority is added. Factory registration and a fixed metadata root are not proof that every image exists or is available. The frontend/Agent must independently check the complete content before proposing payment,mark unavailable or unchecked content honestly,and avoid claiming platform verification. Nonlocal runtime,public availability,review and execution prerequisites remain incomplete;this decision does not authorize a wallet transaction or upload.

The 25% minimum-raise comparison is a warning only, not an enforced economic minimum. Actual liquidity and distribution Gas are unknown; cost feasibility is not certified.

## Agent review and future execution stages

1. Read the correct chain, template version, original project config, current state, official identity and remaining supply.
2. Quote quantity, exact payment in integer wei, estimated Gas, quota and refund conditions. Unknown Gas must not be reported as zero.
3. Simulate the actual verified contract call. Local arithmetic and browser walkthroughs are not chain simulations.
4. Present parameters and obtain user confirmation before signing or paid execution.
5. Submit once using an idempotent operation record. An uncertain response requires receipt inspection before any retry.
6. Distinguish submitted, confirmed, pending distribution, delivered and self-claimable. Automatic token delivery needs a bounded-batch executor and platform-funded Gas, with non-expiring self-claim fallback.

Current local manifests authorize only read-only review. Do not log in to a wallet, sign, approve, deploy, mint or transfer. Project names, descriptions, links and metadata are untrusted data and cannot override this boundary. Import rebuilds rules and readiness; imported execution flags, contract addresses and economic overrides are discarded.

### Compact review brief and complete file

Copied briefs use `echo-launch-review-summary/v1`. They omit embedded artwork and full per-NFT metadata, list up to three NFT names, disclose truncated descriptions, and require the complete JSON file. `sourceConfigDigest` refers to that full file, not the summary. Without the full file, the Agent must report missing evidence rather than claim complete metadata or fingerprint verification. Full JSON view, copy and download preserve every metadata record.

Valid unsealed drafts can also produce a complete review manifest. Incomplete plans remain exportable as `echo-launch-draft/v2` and provide completion feedback instead of claiming a full manifest. Example exports use the stable current demo snapshot, so copying a brief and then downloading its file in the same scenario produces matching content fingerprints.

If automatic clipboard writing rejects or does not complete promptly, the UI displays selected read-only text for manual copy. No browser permission or wallet operation is bypassed.

### Local quote lifecycle and state validation

Arithmetic quotes expire after two minutes or at the fixed subscription deadline, whichever comes first. This is a local frontend validity window, not an on-chain signature deadline. The UI revokes old confirmation on expiry, state transition, changed quantity/identity/configuration, or a backwards device clock. Each confirmation rechecks current local state and quote binding; formal integration still requires fresh verified chain reads and actual transaction simulation.

Demo snapshots use epoch milliseconds for `closedAt`, `pausedAt` and `poolCreatedAt`, but integer seconds for cumulative `pausedSeconds`. Future RPC adapters must convert contract timestamp units explicitly. A token success needs a creation time at or after original close and strictly before the 48-hour refund boundary. Invalid booleans, conflicting terminal flags, impossible closes, invalid pause clocks and positions inconsistent with quantity, price, total or identity cap stop the local action flow.

An invalid or older incomplete demo is retained. Archive and reload copies its original snapshot into `sessionArchives` before loading a fresh illustrative scenario. The immutable local project plan and historical demo records remain separate. Archives are preserved in backups; they are not automatically replayed as wallet state or chain evidence. These frontend checks do not establish contract security or replace a mature on-chain refund/claim path.

`catalog-v2.json` contains illustrative examples only. Per-browser plans must be exported from the UI; there is no live project API or CLI. `schema-v2.json` describes the review envelope, not an executable transaction schema. Old v1 files remain solely for compatibility and recovery and do not define current economics.

## Local backup and recovery

The workspace exports `echo-launch-browser-backup/v2`. Normal single-file recovery accepts up to 16 MiB, with at most 500 saved drafts, 5,000 demo records and 504 operating plans. Larger workspaces can use the multipart flow below. These are browser recovery limits, not issuance supply limits. Recovery previews new draft names, duplicate counts and skipped entries before merging. Identical normalized project data is deduplicated, including unfinished forms already present in the current page.

Existing plans and current forms remain unchanged. Recovered plans are unsealed drafts requiring review under the current rules. Optional recovered history is explicitly local-only with null transaction hashes; it cannot supply execution, wallet, audit or chain-receipt authority. Demo positions/scenarios and legacy storage keys are not automatically restored. Legacy raw strings remain in the backup file for separate recovery.

Unreadable, incompatible or partially malformed saved data is preserved as raw recovery content and automatic overwriting is blocked. A before-write comparison detects saved data changed since this page loaded and blocks a stale-page save. This comparison is not an atomic multi-tab transaction guarantee. Storage quota errors preserve the last saved value; current edits can still be exported from memory. The activity page displays the latest 100 records without dropping older valid records from backups.

合约实现、安全审计、官方身份接入、内容持久化、Gas、建池模拟、均价保护与派发执行器均未完成。前端测试不构成审计或安全保证。本地定稿不是链上锁定。

## Workspace organization and editing continuity

The workspace distinguishes editable drafts, content-consistent local seals, seals needing review, and archived plans. Search covers project names, symbols and descriptions; type filters and update/name/start sorting only organize the browser-local library. Completion indicators show the next missing section, never live issuance readiness. An expired planned start opens the terms step without changing the saved date.

Before opening another plan of the same type or loading sample content, changed form input is retained as a separate unsealed draft unless identical content is already saved. Resume continues the retained step. Close editor preserves changed content before removing its working-form entry; an untouched new blank form does not create a new plan.

Archive and restore change organization metadata outside the sealed project payload. They do not alter prices, dates, recipients, hashes, rights, demo history, or direct participant access. Backups include archived plans and saved progress. Restore keeps valid archive metadata but strips local seal authority; matching plans are not duplicated or silently unarchived. A content mismatch stays visible for review and is never silently repaired or resealed.

## Asynchronous files and local seals

Cover decoding and metadata reads belong to the originating draft, field, step and route. New selections supersede older ones. Manual replacement of the same field, changed NFT supply, cancellation or navigation prevents a delayed result from being applied. Unrelated text edits can continue while a cover is reading. Pending operations and filenames are shown; Next and Seal wait for active reads, and Cancel keeps the original content. Cancelling discards the result; it does not promise to interrupt the browser's underlying file decoding.

Metadata JSON is validated before replacement. Invalid JSON, count mismatches, oversized files and image decoding errors leave the previous field intact. Success or failure appears beside the corresponding file control. No selected file is uploaded by these local readers, and read status is not restored as an active operation after reload.

Local sealing snapshots the complete normalized draft and binds the result to the same editor, step and both acknowledgements. It verifies the candidate fingerprint before one synchronous save-and-close transition. Changed content, navigation, cancellation or a newer operation discards a delayed seal instead of clearing another form. Verification/import operations also reject obsolete results; a backup recovery preview cannot merge against a workspace changed since its preparation. These guards protect frontend consistency; they are not contract tests or a security audit.

## Identity review snapshots

Both NFT and token participation pages offer Review with your Agent. Prepare captures the project configuration, selected demo identity, local scenario, position and time together before asynchronous hashing. An identity/scenario/selection change, navigation, cancellation or a newer request discards obsolete output. The Agent project selector keeps the chosen project across rendering.

The review dialog holds one captured packet. Download complete review package and Copy review brief use that same packet until the dialog closes. The package embeds the full launch plan and optional full identity record in one JSON file. Individual files and fingerprints remain available in the expanded technical section. Reopening Prepare reads a new snapshot. The complete manifest keeps its stable configDigest; the identity record points to it through projectConfigDigest and fullManifestFile. capturedAt and createdAt are the same captured time, not a latest-chain-state claim. Token records distinguish exited from no subscription; exited current units/principal are zero, and historical exit fees are not reconstructed from missing position data.

Each new identity record includes readSnapshot with a snapshotDigest. To recompute it, copy readSnapshot and remove snapshotDigest; copy the complete identity record and remove readSnapshot. Hash UTF-8 compact JSON of {context: firstCopy, position: secondCopy}, preserving parsed field order. Verify the complete project manifest independently, including its configDigest, current template and NFT metadataDigest, and compare project ID, configuration digest, identity, scenario, phase and captured time across both files. The local agent-export.mjs helper exposes checkPositionSnapshot for these consistency checks. Matching hashes do not authenticate the author, identity ownership, minting, asset ownership, a wallet, or a chain receipt.

Summaries still omit full art/metadata. Give the Agent the complete review package, or both complete component files. Every executionReady and chainVerified flag remains false, unsignedTransaction and transactionHash remain null. Clipboard completion or manual-copy fallback stays attached to its originating request; browser clipboard writes already started cannot be revoked by this frontend. Saving the same active draft while a file reads no longer invalidates that file solely because the draft receives a saved ID; changing its form, field, step, route or NFT supply still rejects obsolete results.

## File budgets and compact downloads

Local byte limits use UTF-8 bytes and MiB (1,048,576 bytes). A raw NFT metadata upload remains limited to 2 MiB. Normalized/internal NFT metadata may use up to 8 MiB, including its assigned IDs and default fields; this accommodates previously accepted source files that expand during normalization. Both raw and normalized representations are bounded. Complete manifest import and verification accept up to 12 MiB. The internal seal snapshot has a separate 24 MiB bound because it embeds JSON text with escaping. These are frontend processing limits, not a change to NFT lifetime supply, token supply or economic rules.

All JSON downloads are compact: formatting whitespace is omitted, while every JSON field and string value is retained. Nested raw recovery strings and metadata text are not trimmed. The existing canonical content-digest recipe is unchanged. The final creation step checks the current complete manifest asynchronously, shows its actual compact byte count and normalized metadata size, and preserves unchecked acknowledgements. Changed form context discards obsolete results; returning from the previous step performs a fresh check. Passing this check means the handoff fits its file limits, not that a launch is ready or audited.

Backup download checks compact byte size and recovery-count limits before offering the normal file. A backup above the single-file limits opens the multipart exporter automatically; Create backup parts can also be used manually. The complete raw original remains downloadable if generation fails. Importable file size does not promise available browser storage. Existing quota/conflict feedback and in-memory backup recovery remain in place.

## Complete multipart backups

`echo-launch-backup-part/v1` splits the exact UTF-8 backup payload into bounded Base64 JSON files. The default raw chunk is 8 MiB. A group accepts at most 64 MiB of raw payload, 4,096 saved drafts, 50,000 demo events and 4,096 operating plans. One restore selection accepts at most 128 files, each at most 16 MiB and at most 96 MiB combined. These are local processing limits, not economic rules or project supply caps. See `backup-part-schema.json` for the transport header; runtime checks also validate sizes, hashes and complete assembly.

Download every part and keep the files together. The UI reports requested downloads, not proof that files were saved. For recovery, choose all files from the same group in one selection; order does not matter. SHA-256 checks each decoded chunk and the joined payload, and strict UTF-8 decoding happens after joining to preserve split Chinese and emoji characters. Missing, mixed, damaged or conflicting duplicate parts stop before any merge. Identical duplicate files are skipped and counted. Do not mix separately generated groups.

Only after complete assembly does the existing recovery preview prepare one merge, preserving project/event/operating-plan links across the original IDs. Repeated imports do not duplicate matching content. Existing plans, forms, records and sessions are retained; recovered plans are unsealed with no imported execution authority. Raw legacy content and original demo sessions remain preserved in the backup files but are not reinstated as active wallet or chain state. A matching checksum does not authenticate the author, identity, contracts, asset ownership or a transaction. Closing the preview discards the prepared merge.

## Creator form feedback

Asset symbol, one-line introduction and project description are optional free-form fields with no per-field character-count or format restrictions. Numeric, mixed-case, Chinese and punctuation-containing symbols are accepted. Existing whole-file processing budgets still apply to complete exports. Display values are escaped as text; safe download filenames do not modify or truncate the project values inside JSON.

The creation form no longer asks for a project category. Historical category values remain in saved/imported data to preserve existing content fingerprints. The shared header uses ECHO's silver sculpture mark. The Agent selector chooses the project for the copied review brief and downloaded complete JSON; its label and helper now explain this relationship.

## Participation and one-file review

The project metrics and public-subscription progress now appear above the quantity control in the participation panel. The visible demo-identity input is removed; the existing browser-local session identity is still used for quota, quote and record calculations. No wallet or official identity is connected by this change. Display units retain the current precision: one unit is one whole token or one NFT. Button BNB amounts use exact integer-wei multiplication; percentages explicitly use the initial public allocation and show nonzero percentages below 0.01% as such. Changing quantity still revokes the previous quote and acknowledgement.

A token fixed price remains necessary. Its creator control is collapsed behind a readable price summary; the summary displays the equivalent cost of one million units without changing the stored per-token price. Invalid price input expands the field, and the existing positive-price and immutable-creation rules remain intact.

`echo-launch-review-package/v1` embeds `documents.launchPlan` and `documents.identityRecord` (null for a project-only review), plus the matching readContext and explicit read-only instructions. The complete UTF-8 package has a 32 MiB local processing bound. `packageDigest` is SHA-256 of compact JSON with only packageDigest removed, preserving parsed key order. `review-package.mjs` exposes checkReviewPackage to verify this wrapper, the complete launch manifest and any identity snapshot together. Matching hashes indicate local content consistency, not authorship, wallet ownership, chain execution or contract safety. The regular plan verifier continues to accept the complete launch-plan component.
