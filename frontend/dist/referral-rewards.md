# ECHO · 200 ECHO direct-invite reward / 直接邀请奖励

## 中文规则

- 每成功直接邀请一个不同的官方 .ai 身份完成首次 ECHO Mint，邀请人应计 **200 ECHO**。受邀人的免费首铸和付费首铸均可计入；同一受邀身份只计一次，自邀或同钱包身份互邀不计。
- 邀请来源必须在受邀身份首次成功 Mint 时由 EchoLaunch 合约记录。打开链接、复制指令、失败交易或之后追加链接都不计入。已有链上成功邀请记录也纳入本规则。
- 原有每次成功邀请增加 **1 份付费 Mint 额度**的规则保留。200 ECHO 奖励给邀请人；受邀人的普通 Mint 仍为每份 1,000 ECHO。
- **开盘后发放**：开盘前累计应计奖励；交易池建立后由项目钱包依据链上记录核对并转账。开盘后新增的有效邀请也按同样标准核对发放。它不是建池交易内的自动派发，也不是即时到账承诺。
- 以每次发放核对区块的注册器 `ownerOf(邀请人 identityId)` 持有人钱包为收款依据。公开核对记录须包含区块、邀请身份、成功邀请次数、奖励金额及实际发放交易哈希；已发放部分不得重复计算。
- 奖励从现有 **425 万 ECHO 奖励预留**中支出，不增发，不从建池资金中扣除。全站最多 10,000 次有效首铸，按 200 ECHO 计算的邀请奖励理论上限为 **200 万 ECHO**。
- 网页显示的是 `successfulInvites × 200 ECHO` 的累计应计额，**不是待领取余额或已到账证明**。实际发放以成功的代币转账回执为准，开盘状态本身不证明已经付款。
- 此奖励无须参与者另付领取费、提供私钥或授权第三方花费代币。邀请奖励不构成 BNB 回报或币价承诺。

## English rules

- Each distinct official .ai identity that completes its first successful ECHO Mint through your direct invitation accrues **200 ECHO for you, the inviter**. Free and paid first mints both qualify. Count each invited identity once; self-referrals and referrals between identities held by the same wallet do not qualify.
- The EchoLaunch contract must record the referrer on the invited identity's first successful Mint. Opening a link, copying a brief, failed transactions and later-added links do not qualify. Existing successful on-chain invite records are included.
- The existing **one extra paid Mint share of allowance** per successful invite is retained. The invite bonus belongs to the inviter; the invited participant's regular Mint still delivers 1,000 ECHO per share.
- **Distribution starts after pool opening.** Rewards accrue before opening. Once the trading pool exists, the project wallet reconciles on-chain records and makes token transfers. Later qualifying invites follow the same process. Distribution is not automatic within the pool-opening transaction and is not an instant-delivery promise.
- The receiving wallet is the registered `ownerOf(inviter identityId)` at each distribution's reconciliation block. Public reconciliation records must include the block, inviting identity, successful-invite count, reward amount and actual distribution transaction hash. Previously paid rewards must not be paid twice.
- Rewards come from the existing **4,250,000 ECHO reward reserve**, without new token issuance or deductions from liquidity funding. At most 10,000 qualifying first mints imply a theoretical invite-reward ceiling of **2,000,000 ECHO**.
- The website shows lifetime accrued rewards calculated as `successfulInvites × 200 ECHO`, **not a claimable balance or proof of payment**. A successful token-transfer receipt is required to confirm distribution. An open pool alone does not prove payment.
- Participants do not need a separate reward-claim fee, private-key disclosure or third-party token-spending approval. These rewards are not a promise of BNB returns or token price.

## Additional campaign / 新增活动

The 200 ECHO rule above remains unchanged. See [paid-order rebates and the 50,000 ECHO team leaderboard](./growth-campaign.md). 原有 200 ECHO 规则保留；新增首次付费双向各 5% BNB 返还（总预算 0.2 BNB）与战队榜前三名 25,000 / 15,000 / 10,000 ECHO，详见[完整规则](./growth-campaign.md)。
