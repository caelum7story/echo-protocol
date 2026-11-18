# ECHO Agentic Wallet connector

The public Worker queues narrowly defined requests. This Windows service polls
the queue over HTTPS, authenticates with a dedicated Ed25519 key, and runs the
official Binance Agentic Wallet CLI in a separate file profile for each visitor.
The queue key is not a blockchain key and cannot spend BNB.

Visitors explicitly consent before an official QR URL and pairing code are
displayed. ECHO holds the resulting delegated session for at most 30 minutes.
The application permits only Genesis EchoLaunch Mint on chain 56. These are
application restrictions, not a claim that Binance grants Mint-only authority.
The Binance App's actual wallet permissions and limits continue to apply.

Every Mint requires a successful official preview and a separate website
confirmation showing the wallet, contract, shares, referral, BNB and estimated
gas. Developer Mode must be active. Gas is an estimate, not a provider-enforced
fee ceiling. Nonempty warning details are visible before confirmation. High-risk
previews or authority/allowance changes stop submission.

The service stores a durable intent before one official execute call. Unknown
results and pending App confirmation never cause automatic re-signing. Read-only
reconciliation verifies transaction fields, the Mint event, token delivery and
two confirmations. A supplied recovery hash receives the same verification.
Unclaimed expired requests can be cancelled safely; claimed unknown requests
retain their pending lock. Terminal states cannot be downgraded.

Deployment procedure:

1. `node operator/agentic-key.mjs --prepare` creates a DPAPI-encrypted queue key
   outside the checkout and pins only its public key in worker policy.
2. Build/test and publish this same Sites project, including D1 migrations.
3. Run `operator/install-agentic-service.ps1 -NodePath <absolute node.exe>`.
   It installs one user-level logon task and launches the process hidden.
4. Read `/agentic-api/status` for service readiness. In a fresh temporary browser
   session generate an unscanned QR, verify its official domain and pairing code,
   then disconnect. No wallet signature or payment is required for this check.
5. Actual App approval and a real Mint remain user actions; record those results
   separately from unit tests or QR generation.

The PC must remain online and logged in. If it is unavailable, new logins and
payment requests fail closed and users can use their own Agent. A service restart
invalidates old connections and revokes its isolated profiles; pending transaction
records remain recoverable after signing in again. Disconnect does not cancel
already submitted transactions. Revocation failures are retried and visitors can
also manage sessions in the Binance App.

Never reuse the owner's `.baw` files, global keytar session, automatic distributor
wallet or any other project's gateway/credentials. Do not publish private runtime
files, QR payloads, pairing codes or wallet-session credentials in source or logs.
Respect official risk-control rejections; do not change identity/fingerprints to
evade a rejection. This implementation has internal tests and code review, not an
independent security audit.
