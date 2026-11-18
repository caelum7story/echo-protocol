# ECHO · 首次付费双向返还与战队榜 / Paid-invite campaign

## 中文

### 首次付费订单：双方各 5% BNB

以 EchoLaunch 部署以来的真实链上 Mint 记录为依据。每个受邀官方 .ai 身份，仅第一笔成功且实付 BNB 大于零的 Mint 订单可核对返还资格；该身份可以先免费首铸、之后再首次付费。邀请来源必须是合约已经记录的 firstReferrer，不能追补或替换。无邀请来源、同一身份自邀、付款时邀请人与买方为同一钱包均不计。

合格订单的铸造者和邀请人各应计实付 Mint 金额的 5% BNB，分别按 wei 向下取整；Gas 和免费份额不计入。仅该身份首笔付费订单计一次，追加订单不重复享受。

双方返还的合计预算为 **0.2 BNB**，作为项目原有 30% 收入中的推广支出，不减少 70% 建池资金。按区块、交易顺序核对，必须足以覆盖整个订单的双方返还。下一整单无法覆盖时，从该笔起停止新增资格，后续小单不越序插队；此前应计资格保留，未分配余额留在项目中。

金额为应计营销支出，并非智能合约托管余额。项目钱包在订单确认、核对后分批转账；无需等待开盘，但不是 Mint 同笔自动返款。BNB 返还给付款钱包与付款时的邀请身份持有人钱包。页面预算不为某笔待发送交易预留，实际资格按确认后的链上顺序判定。如果用户要求返还必须在 Mint 中原子保证，现有合约无法提供，Agent 应停止并说明。

### 战队榜：50,000 ECHO，开盘一次结算

“战队”即邀请人的官方 .ai 身份及其直接邀请的身份。按完成首次付费的不同直接受邀身份数排名，不按 Mint 份数、免费领取数或 BNB 金额排名。每个受邀身份最多贡献一分，达到同样分数时，以更早达到该成绩的链上事件优先。

首次建池交易结束时结算，**包含触发开盘交易中的 Mint**，同一区块中开盘之后的其他交易不计入最终榜单。开盘后新增的邀请不再改变这次名次。即使 BNB 返还预算已停止，符合条件的开盘前首次付费邀请仍计入战队榜。

1. 第一名：**25,000 ECHO**。
2. 第二名：**15,000 ECHO**。
3. 第三名：**10,000 ECHO**。

至少一位合格付费邀请才上榜。合格战队少于三支时，空缺名次奖金留在奖励预留，不重新分配。受奖钱包按开盘区块结束时注册器中的邀请身份持有人核对，项目钱包开盘后发放，须有实际转账回执才能确认到账。

### 与原有奖励的关系

每次有效首铸邀请仍保留 **200 ECHO＋1 份额外付费 Mint 额度**；免费首铸也可计入这项原有奖励。战队奖额外从现有 425 万 ECHO 预留支出，不向每个付费买方再加 200 ECHO，不增发。原有邀请奖励理论上限 200 万 ECHO，加战队奖 5 万 ECHO，合计最多 205 万 ECHO。

查询使用已核验合约事件，最新 20 个区块暂不计入。旧查询失败时不得冒充最新结果，名次、应计奖励和真实付款要分别核对。参与者无需领奖费、私钥或第三方代币授权。

## English

Each referred official .ai identity's **first successful paid Mint order** may qualify, including an identity that first minted free. Attribution must match the chain-recorded firstReferrer. No retroactive referrer changes, self-referrals or same-wallet buyer/referrer payments qualify. Additional paid orders of that identity do not qualify again.

Buyer and inviter each accrue **5% of actual Mint payment**, rounded down in wei, excluding gas and free allocations. The combined budget is **0.2 BNB**, paid from the project's existing 30% revenue share while preserving the 70% liquidity funding. Orders are evaluated in complete chain order. If the next entire order cannot fit, new qualifications stop, earlier accruals remain and later smaller orders do not jump the queue. Any unused budget stays with the project.

The project wallet reconciles confirmed orders and transfers BNB to the paying wallet and the inviter's owner at the paid Mint block. Pool opening is not required for these BNB payments. They are not automatic refunds within the Mint transaction, and the budget is not contract escrow. Displayed remaining budget does not reserve a pending transaction's place. If a user requires an atomic guaranteed rebate as a condition of Mint consent, stop: the existing contract cannot guarantee it.

The **50,000 ECHO team leaderboard** counts distinct directly referred identities that complete their first paid Mint, one point each. Ties favor the earlier event reaching the same score. It settles once at the first pool-opening transaction, including the Mint that triggers opening and excluding later transactions in that same block. Later invites do not change the final standings. Qualifying pre-opening referrals still count for the leaderboard after the BNB budget stops.

Prizes are **25,000 / 15,000 / 10,000 ECHO** for the top three. Teams need at least one qualifying referral. Empty positions remain in the reserve; their prizes are not redistributed. Prize recipients are the inviting identity owners at the end of the opening block. Transfers are reconciled by the project after opening and require real transfer receipts to prove payment.

The existing **200 ECHO plus one extra paid Mint share** per valid first-mint invite remains, including free first mints. Team prizes are additional, from the existing 4.25M ECHO reward reserve; no extra 200 ECHO is added to every paid buyer. No new tokens are issued. Combined theoretical invite and team rewards are at most 2.05M ECHO.

Queries use verified contract events and exclude the latest 20 blocks. Rankings and accrued rewards are not proof of payment. No participant reward-claim fee, secret or token approval is required.

For an unopened pool with `totalPaid = 0` at the confirmed snapshot, the empty paid standings are verified directly from `totalPaid` and `opened` at that same block. This avoids scanning free-Mint history. The report records `source: verified-echo-launch-counter` and `zeroPaidEvidence`; nonzero paid counts or an opened pool retain the full event query. A failed counter read is a query failure, not proof of empty standings.

## Operator reconciliation / 项目核对

`node scripts/reward-report.mjs --out <new-report.json> [--paid-ledger <payments.json>]`

The tool is read-only and cannot sign or broadcast. It writes a new file only, never overwriting a prior report. Provide every previous campaign payout in the ledger before preparing further transfers. Without a ledger, amounts are lifetime accruals, not verified unpaid balances.

Ledger entries use `{"claimIds":["paid-invite:<identityId>:buyer"],"txHash":"0x..."}`; inviter claim IDs end in `:inviter`, and finalized team prize IDs are `team-prize:<inviterIdentityId>`. Several claims may share one transfer only when currency and recipient are identical and the transfer exactly equals their sum. The tool verifies successful receipts, chain, project sender, recipients and amounts; duplicate transactions and claim IDs fail. A confirmed payout never releases campaign budget for reuse. The original 200 ECHO invitation payouts remain separately reconciled under `/referral-rewards.md`.
