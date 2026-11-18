const pairs=`
刷新战队榜 ↻||Refresh team leaderboard ↻
战队榜 · 50,000 ECHO||Team leaderboard · 50,000 ECHO
战队榜||Team leaderboard
邀请好友完成首次付费 Mint，按有效 .ai 身份数争夺前三名。开盘结算，奖励由项目钱包核对发放。||Invite .ai identities to complete their first paid Mint and compete for the top three. Standings settle at pool opening; rewards are reconciled and transferred by the project wallet.
生成我的战队邀请||Create my team invitation
前往 Mint||Go to Mint
首次付费返还 · 双方各 5% BNB||First paid-order rebates · 5% BNB for each side
刷新战队榜||Refresh team leaderboard
付费有返还，战队有奖励。||Paid-Mint rebates. Team rewards.
通过有效邀请来源完成首次付费订单，铸造者与邀请人各应计该笔实付 Mint 金额的 5% BNB。奖励由项目钱包核对转账，不在 Mint 交易内自动返还。||A valid referred identity’s first paid order accrues 5% of its Mint payment in BNB for both buyer and inviter. The project wallet reconciles and transfers rewards; Mint does not refund them automatically.
首次付费订单双向返还||First paid-order rebates for both sides
仅限每个受邀 .ai 身份的首笔成功付费订单；免费订单不产生 BNB 返还。||Only the first successful paid order per referred .ai identity; free orders earn no BNB rebate.
总预算 0.2 BNB，从项目 30% 收入支出；Gas 不参与返还。||Combined budget: 0.2 BNB from the project’s 30% revenue share. Gas is excluded.
按链上顺序整单计入。剩余预算不足覆盖下一整单时停止新增资格，已有资格保留。||Whole orders qualify in chain order. New qualifications stop if the next order cannot fit; existing accruals remain.
战队榜 · 开盘结算一次||Team leaderboard · One settlement at opening
按直接邀请并完成首次付费的不同 .ai 身份数排名，同分时先达到该成绩者优先。包含触发开盘的订单。||Ranked by distinct directly invited .ai identities completing their first paid Mint. Ties favor earlier achievement. The opening-triggering order is included.
第 1 名||1st place
第 2 名||2nd place
第 3 名||3rd place
从现有 ECHO 奖励预留发放；不足三支合格战队时，未分配名次的奖金留在预留中。||Funded from the existing ECHO reward reserve. If fewer than three teams qualify, unassigned prizes stay in reserve.
BNB 返还预算上限||Total BNB rebate budget
已占用返还预算||Committed rebate budget
未占用返还预算||Uncommitted rebate budget
开盘时结算一次；当前名次不代表已获奖或已到账。||Settles once at pool opening; current ranks are not final awards or proof of payment.
战队成绩 · 有效付费邀请||Team scores · Qualifying paid invites
查询战队榜与返还进度||Query team scores and rebate budget
查看返还与战队规则||View rebate and team rules
原有每次有效首铸邀请的 200 ECHO 和 +1 份付费额度保留；战队奖额外计算。参与者无需支付领奖费或提供代币授权。||The existing 200 ECHO and +1 paid Mint allowance per valid first-mint invite remain; team prizes are additional. No reward-claim fee or token approval is required.
每个 .ai 仅首份可免费，基础累计可铸 10 份；成功邀请一位新身份首铸，增加 1 份付费额度，另有 200 ECHO 在开盘后核对发放。首免用完可在预先授权的金额内自动付费，Gas 另设上限。||Only the first share per .ai identity can be free, within a base lifetime allowance of 10 shares. Each successful invited first mint adds one paid share and accrues 200 ECHO, reconciled after pool opening. Paid fallback requires prior bounded consent, with a separate gas cap.
每成功邀请一个不同身份首铸，另有 200 ECHO，开盘后核对发放；原有 +1 份付费额度保留。||Each distinct invited first mint accrues 200 ECHO, reconciled after pool opening; the existing +1 paid-share allowance is retained.
邀请成功，开盘后获奖励。||Invite successfully. Rewards follow pool opening.
每个有效受邀新身份首次成功 Mint，邀请人应计 200 ECHO。免费首铸也计入；自邀不计，同一身份仅一次。||Each eligible invited identity’s first successful Mint accrues 200 ECHO for the inviter. Free first mints count; self-referrals do not. Each invited identity counts once.
链上成功邀请||Successful on-chain invites
累计应计奖励 · ECHO||Lifetime accrued rewards · ECHO
发放安排||Distribution schedule
查询身份后显示||Query your identity first
从现有奖励预留支出。开盘后由项目钱包核对转账；此处不是待领取余额，实际到账以发放回执为准。||Funded from the existing reward reserve. The project wallet reconciles and transfers rewards after pool opening. This is not a claimable balance; distribution requires a successful transfer receipt.
查看邀请奖励规则||View invite-reward rules
铸造规则由合约执行，邀请奖励按公开规则发放。||Mint rules run on-chain; invite rewards follow the published distribution rules.
受邀身份完成首次铸造后，邀请者增加 1 份付费额度，并应计 200 ECHO；免费首铸也算，同一身份仅计一次，自邀不计入。||An invited identity’s first successful Mint adds one paid share and accrues 200 ECHO for the inviter. Free first mints qualify; each identity counts once, and self-referrals do not.
成功邀请以合约记录为准，已有记录也计入。每次另有 200 ECHO 从奖励预留支出，开盘后由项目钱包核对发放；开盘后新增邀请同样计入。页面应计额不代表已到账。||Successful invites follow contract records, including existing records. Each accrues 200 ECHO from the reward reserve, reconciled and transferred by the project wallet after pool opening. Later qualifying invites also count. Displayed accrual is not proof of payment.
前 1,000 份首免，每个官方 .ai 身份仅首份可免费，Gas 另付。基础累计 10 份；成功直接邀请一个不同身份首次 Mint，再增加 1 份付费额度，另应计 200 ECHO，开盘后由项目钱包核对发放。开盘前初始付费价 0.002 BNB/份，每份 1,000 ECHO。||The first 1,000 free shares are available one per official .ai identity; gas is separate. Base lifetime allowance is 10 shares. Each successful direct first-mint invite adds one paid share and accrues 200 ECHO, reconciled by the project wallet after opening. Initial pre-open paid price is 0.002 BNB per share, delivering 1,000 ECHO.
链上参与概览||On-chain participation overview
发行阶段||Launch stages
自动建池门槛进度||Automatic pool-opening threshold progress
创世铸造||Genesis Mint
官方 .ai 身份参与||Official .ai identities
建立流动性池||Create liquidity
累计 5,000 份||At 5,000 total shares
累计 5,000 份自动建池；项目方也可提前开池。实际开池状态以链上为准。||The pool opens automatically at 5,000 total shares; the project owner may open it earlier. Verify the actual opening on-chain.
开放交易||Trading opens
以实际交易池为准||Refer to the actual pool
免费已领||Free shares claimed
付费已铸||Paid shares minted
待建池资金||Pending liquidity funding
份||shares
免费、付费和建池资金将分别读取。||Free allocations, paid allocations and liquidity funding are read separately.
数据未就绪时不显示模拟数量。||No simulated quantities are shown while data is unavailable.
官方资料与合约||Official resources and contracts
官方 Agent 指南||Official Agent guide
Agent 配置 JSON||Agent configuration JSON
Mint 合约源码||Mint contract source
代币合约源码||Token contract source
报价合约源码||Oracle contract source
预估开盘价||Estimated opening price
正在计算…||Calculating…
按建池比例估算，非成交报价。||Liquidity-ratio estimate, not an executable quote.
等待读取链上数据||Awaiting on-chain data
1,000 ECHO 的估算价格正在计算…||Calculating the estimate for 1,000 ECHO…
以已核验的链上资金和固定建池配币规则计算。||Calculated from checked on-chain funding and fixed liquidity-allocation rules.
查看计算依据||View the calculation
正在读取…||Loading…
这是计划注入资金与配币比例的估算，不是可成交报价；后续铸造、参数变化、池子外部转入和市场交易均可能改变实际价格。交易税、DEX 手续费和 Gas 另计。||This estimates the ratio of planned liquidity contributions, not an executable quote. Further mints, parameter changes, external pool transfers and market trading may change the actual price. Transfer taxes, DEX fees and gas are separate.

实时铸造信息||Live Mint information
免费剩余||Free remaining
每个 .ai 首份可免||One eligible first share per .ai
每份到账||Tokens per share
开盘前付费价||Pre-open paid price
免费资格以身份查询为准，网络 Gas 另付。||Query your identity to verify free eligibility. Network gas is separate.
读取中||Loading
正在核验链上 Mint 状态。||Checking on-chain Mint status.
正在读取免费余量…||Reading remaining free shares…
我的参与||My participation
输入 .ai 名称，查询你的参与记录。||Enter a .ai name to view its participation.
查询 / 刷新 ↻||Query / Refresh ↻
累计铸造所得 · ECHO||Lifetime Mint allocation · ECHO
成功邀请 · 身份||Successful invited identities
输入官方 .ai 名称查询真实额度。||Enter an official .ai name to query its quota.
生成我的邀请海报||Create my invitation poster
查看我的记录||View my records
清除记住的身份||Forget this identity
仅在本机记住公开 .ai 名称；累计铸造所得不等于当前持仓，公开查询不代表钱包登录。||Only your public .ai name is remembered on this device. Lifetime Mint allocation is not your current balance; public lookup is not wallet login.
接下来，完成这三步。||Your next three steps.
返回核验到账||Return to verify delivery
生成邀请海报||Create invitation poster

合约已部署 · Mint 尚未开放||Contracts deployed · Mint is not open
正在读取开盘进度…||Reading pool-opening progress…
网页不连接参与钱包。Agent 根据链上状态准备真实交易。||The page does not connect participant wallets. Your Agent prepares a transaction from live chain state.
正在读取链上 Mint 记录…||Reading on-chain Mint records…
尚未取得查询结果。||No query result yet.
只展示真实链上事件。||Only real on-chain events are displayed.
不设 Mint 截止时间，不退款。总供应量 2,125 万 ECHO：用户 Mint 1,000 万、建池专用 700 万、奖励 425 万（20%）。建池分批配币，售罄后未使用的建池预留销毁；ECHO 合约已部署，Mint 状态以页面的实时查询为准。||No overall Mint deadline or Mint refunds. Initial supply: 21.25M ECHO, including 10M for user Mint, 7M for liquidity and 4.25M for rewards (20%). Liquidity tokens are added in batches; unused liquidity reserve is burned after sellout. Contracts are deployed; read the live Mint status on this page.
邀请增加的是付费铸造额度，不是免费代币或现金。成功邀请数量和剩余额度以合约公开记录为准。||Invites unlock paid Mint allowance, not free tokens or cash. The contract records successful invites and remaining quota.

分享邀请链接||Share invitation link

创世发行进度 · 链上||Genesis Mint progress · On-chain
链上发行进度||On-chain Mint progress
每份所得||Tokens per share
我的铸造额度 · 链上||My lifetime quota · On-chain
官方身份公开查询||Public official identity query
网页不连接参与钱包||No participant wallet connection
尚未查询||Not queried
本次费用 · 演示||Mint payment
实时 Mint 费用||Live Mint payment
成功铸造后同笔交易直接到账||Delivered in the successful Mint transaction
查询身份与报价||Query identity and quote
正在读取链上状态…||Reading on-chain state…
刷新链上状态 ↻||Refresh chain state ↻
暂未开放||Not open
来自朋友的邀请||Invited by a friend
不同身份成功首铸后，你增加 1 份付费铸造额度；不增加全站供应。||Each distinct invited first mint unlocks one paid share for you, without increasing global supply.
分享专属链接。朋友打开后能看见你的 .ai 名称，成功首铸时由合约记录邀请来源。||Share your personal link. Friends see your .ai name, and the contract records it on their successful first mint.
名称和额度由官方注册器与 Mint 合约公开核验；网页不代表钱包签名授权。||The official registry and Mint contract verify public identity and quota. A webpage query is not wallet signing consent.
查询我的身份||Query my identity
查询更早区块||Load earlier blocks
输入 .ai 名称或交易哈希||Enter a .ai name or transaction hash
以官方 .ai 名称或交易哈希查询真实铸造记录。||Query real Mint records by official .ai name or transaction hash.
前往 Mint||Go to Mint
Agent 会核验身份、额度和交易费用。||Your Agent checks identity, quota and transaction costs.
成功后可查询真实链上回执。||Query the real on-chain receipt after success.
已确认规则，由链上合约执行。||Confirmed rules, enforced on-chain.
发行规则||Issuance rules
现在怎样参与？||How do I participate?
费用和额度怎么算？||How do costs and quota work?
交易税和退款规则？||What are the taxes and refund rules?
怎样确认真实到账？||How do I verify real delivery?
复制 Agent 指令发送给自己的 Agent。只有在链上 Mint 已开启且官方配置就绪时，Agent 才会核验身份、免费资格、额度、邀请来源和实时费用；经你限额授权或确认后由钱包签名。||Send the copied brief to your Agent. Only when Mint is open and official configuration is ready may the Agent check identity, free eligibility, quota, referral and live fees, then request a wallet signature within your bounded consent or confirmation.
前 1,000 份首免，每个官方 .ai 身份仅首份可免费，Gas 另付。基础累计 10 份；成功直接邀请一个不同身份首次 Mint，再增加 1 份付费额度。开盘前初始付费价 0.002 BNB/份，每份 1,000 ECHO。||The first 1,000 first shares are free of Mint fees, at most one per official identity; gas is separate. Base lifetime quota is 10 shares. Each distinct successful direct first-mint invite adds one paid share. Initial pre-open price: 0.002 BNB/share for 1,000 ECHO.
累计 5,000 份（含免费）自动建池，管理员可提前建池。项目 LP 销毁；建池后继续 Mint，付费价由市场报价决定。首个报价观察至少需要 5 分钟；报价过期或市场偏离过大时暂缓付费 Mint。||The pool opens automatically at 5,000 shares including free claims, or earlier by the owner. Project LP is burned. Mint continues with market-linked pricing. The first observation needs at least five minutes; stale or excessively divergent pricing pauses paid Mint.
买税 1%、常规卖税 2%，开盘起前 30 分钟卖税 30% 替代 2%，税率固定。代币税自动分批兑换 BNB；DEX 手续费和 Gas 另计。Mint 无截止时间，不退款。||Fixed taxes: buy 1%, normal sell 2%, sell 30% instead of 2% during the first 30 minutes after opening. Tax tokens are batch-swapped to BNB. DEX fees and gas are separate. No overall Mint deadline or Mint refunds.
在参与记录输入交易哈希。只有成功回执、Minted 事件和同笔 ECHO Transfer 到你的钱包一致，才显示铸造成功。待确认和失败交易会分别标明。||Enter the transaction hash in participation records. Success requires a successful receipt, a matching Minted event, and an ECHO Transfer to your wallet in that transaction. Pending and failed transactions are identified separately.
输入你的 .ai 名称||Enter your .ai name
来自朋友的邀请||Invited by a friend

ECHO 合约已部署，Mint 暂未开放。||ECHO contracts are deployed. Mint is not open.
ECHO 合约已部署，Mint 暂未开放，当前仍为交互演示，不会签名或支付。||ECHO contracts are deployed. Mint is closed. This page remains an interaction preview without signing or payments.
ECHO 合约已部署并核验，Mint 尚未开放。页面进度、报价与订单仍为本机演示，不会连接钱包、签名或支付。||ECHO contracts are deployed and checked. Mint is closed. Counters, quotes and orders remain browser-local simulations; no wallet connection, signing or payment occurs.

每个 .ai 仅首份可免费，基础累计可铸 10 份；成功邀请一位新身份首铸，再增加 1 份付费额度。首免用完可在预先授权的金额内自动付费，Gas 另设上限。||Each .ai identity may claim its first share free and has 10 base lifetime shares. Each distinct invited first mint unlocks one paid share. After free quota runs out, automatic payment requires prior bounded consent; gas has a separate cap.
自动付费上限（开盘前）||Automatic payment cap (pre-open)
首免用完后，可在用户预先授权的付款及 Gas 上限内自动付费；未授权或超出上限时停止。||After free quota runs out, automatic payment is allowed within the user-approved Mint and gas caps. Stop without consent or beyond either cap.

正式版 Mint 成功后，ECHO 在同一笔交易中直接到账，无需再次领取。管理员可修改后续 Mint 计价规则，不影响已完成的铸造；代币税率及开盘 30 分钟税率安排不可修改。当前仅为设计预览。||In the live design, ECHO reaches the minter in the same successful Mint transaction, with no separate claim. The owner may change future Mint pricing rules; completed mints are unaffected. Token tax rates and the 30-minute opening tax schedule cannot be changed by the owner. This is a design preview.
开盘前付费价 0.002 BNB / 份||Pre-open paid price: 0.002 BNB / share
总计 10,000 份。||10,000 shares in total.
ECHO 合约已部署，Mint 暂未开放。||ECHO contracts are deployed. Mint is not open.
当前为演示份额，尚未真实到账||Demo allocation only. No real tokens received.
0.002 BNB 为开盘前付费价，正式交易尚未开放。||0.002 BNB is the pre-open paid price. Live transactions are not open.
每笔付费 Mint 的 70% BNB 用于建池。累计铸造 5,000 份（含免费）自动建池，管理员也可提前开池；之后继续 Mint。项目 LP 销毁，不能撤回。||70% of each paid Mint funds liquidity. Open automatically at 5,000 total shares including free claims, or earlier by the owner. Mint continues after opening. Project LP is burned and cannot be withdrawn.
每笔付费 Mint 的 30% BNB 即时转入项目地址，不需要手动领取；收款地址已在部署时固定。||30% of each paid Mint is sent directly to the project address. No manual claim is needed. The recipient will be set before deployment.
不设 Mint 截止时间，不退款。总供应量 2,125 万 ECHO：用户 Mint 1,000 万、建池专用 700 万、奖励 425 万（20%）。建池分批配币，售罄后未使用的建池预留销毁；奖励发放办法待确认。ECHO 合约已部署，Mint 暂未开放。||No overall Mint deadline and no Mint refunds. Total supply: 21.25M ECHO, with 10M for user Mint, 7M for liquidity and 4.25M for rewards (20%). Liquidity tokens are added in batches; unused liquidity reserve is burned after sellout. Reward distribution is undecided. ECHO contracts are deployed. Mint is not open.
Mint 价格、交易税和退款规则是什么？||What are the Mint price, token taxes and refund rules?
开盘前付费价为 0.002 BNB / 份；开盘后每份代币数量保持固定，BNB 单价随市场报价调整。不设截止时间，不退款。||The pre-open paid price is 0.002 BNB per share. After opening, the token allocation per share stays fixed while its BNB price follows the market. No overall deadline and no Mint refunds.
二级市场买税 1%，常规卖税 2%；从开盘起前 30 分钟卖税为 30%，替代常规 2%。交易税自动分批兑换成 BNB 后转入项目地址，DEX 手续费和网络 Gas 另计。当前规则尚未接入真实交易。||Secondary-market buy tax is 1% and normal sell tax is 2%. Sell tax is 30% instead of 2% during the first 30 minutes after opening. Tax tokens are batch-swapped to BNB for the project address. DEX fees and gas are separate. These rules are not integrated with live trading yet.
累计铸造 5,000 份（含免费）时自动建池，管理员也可手动提前建池；建池后继续 Mint，按市场报价支付 BNB。项目 LP 销毁。合约已部署；Mint 与交易尚未开放，页面仍为交互演示。||Open automatically at 5,000 total shares including free claims, or earlier by the owner. Mint continues after opening with market-linked BNB quotes. Project LP is burned. Contracts are deployed; Mint and trading are not open. The page remains an interaction preview.
开盘前付费价 0.002 BNB / 份；开盘后数量固定、BNB 单价随市场报价调整。总上限 10,000 份，每份 1,000 ECHO。||Pre-open paid price: 0.002 BNB per share. After opening, token quantity stays fixed and BNB pricing follows the market. Cap: 10,000 shares at 1,000 ECHO each.
累计铸造 5,000 份（含免费）自动建池，也可由管理员提前建池；建池后继续 Mint，项目 LP 销毁。||Open at 5,000 total shares including free claims, or earlier by the owner. Mint continues after opening and project LP is burned.
付费收入 70% 建池，30% 每笔即时转入项目地址。总供应量 20% 专门奖励，建池另配代币。||70% of paid revenue funds liquidity and 30% goes directly to the project on each mint. 20% of total token supply is reserved exclusively for rewards, separate from liquidity tokens.
不设截止时间，不退款。买税 1%、常规卖税 2%，开盘后前 30 分钟卖税为 30%，由开盘时开始计时。||No overall deadline and no Mint refunds. Buy tax: 1%; normal sell tax: 2%; sell tax is 30% for the first 30 minutes from pool opening.
当前不执行真实支付或交易，不承诺固定收益。||No live payments or trades are executed. No fixed returns are promised.
不设截止时间 · 不退款||No overall deadline · No Mint refunds
总供应量 2,125 万 ECHO||Total supply: 21.25M ECHO
用户 Mint||User Mint
建池专用||Liquidity only
奖励预留 · 20%||Rewards · 20%
1,000 万||10M
700 万||7M
425 万||4.25M
买税 1% · 常规卖税 2% · 开盘后前 30 分钟卖税 30%||Buy: 1% · Sell: 2% · Sell in first 30 minutes: 30%
项目 LP 销毁，不提供项目 LP 手续费分配。募集期限、建池条件、退款与领取规则待确认，当前尚未部署正式合约。||Project LP is burned; no project LP-fee sharing is offered. Sale period, launch conditions, refunds and claims await confirmation. ECHO contracts are deployed. Mint is not open.
48 小时救援与 LP 销毁规则||48-hour rescue and LP burn rules
应急救援||Emergency rescue
设计已确认 · ECHO 合约尚未部署||Design confirmed · ECHO contracts are not deployed
48 小时，固定地址救援。||48 hours. One fixed rescue recipient.
管理员先暂停，再提交一笔救援资产与金额；同一时间仅有一笔申请。||The owner pauses and queues one asset and amount. Only one rescue may be pending at a time.
至少等待 48 小时，再由管理员签名执行。可取消申请；等待结束不会自动转账。||Wait at least 48 hours, then the owner signs execution. A request may be cancelled. Waiting does not automatically transfer funds.
收款地址在部署时固定，不可临时更换。ECHO 管理与救援地址将在部署前确定。||The recipient is fixed at deployment and cannot be changed. ECHO admin and rescue addresses will be set before deployment.
仅能转移合约持有的资产，禁止救援 LP。项目产生的 LP 转入销毁地址，已建池流动性不能撤出或迁移。||Only assets held by the contract may be transferred. LP rescue is forbidden. Project LP goes to the dead address, so built-pool liquidity cannot be withdrawn or migrated.
查看原版关闭条件与退款限制||View original retirement and refund restrictions
原版救援 USDT 或项目代币后，旧 Mint 永久关闭；原生 BNB 余额救援不自动关闭 Mint，且不能动用待退款预留。ECHO 的具体资产接入尚未完成。||The original hook permanently closes the old mint after rescuing USDT or the project token. Native BNB rescue does not automatically close it and cannot spend reserved refunds. ECHO asset-specific integration is incomplete.
救援不自动退款、换币或建立新池，也不提供项目 LP 手续费分配。正式参与前需核对已部署合约与固定收款地址。||Rescue does not automatically refund users, exchange tokens or create a new pool. No project LP-fee sharing is offered. Verify deployed contracts and the fixed recipient before participating.
查看 IDENTIDE 已验证参考源码||View verified IDENTIDE reference source
募集成功后，将实际收取 BNB 的 70% 与预留代币配对建池。免费份额不产生 BNB 分账；项目 LP 转入销毁地址，不能撤回。建池条件待确认。||After a successful launch, pair 70% of collected BNB with reserved tokens. Free shares contribute no BNB. Project LP goes to the dead address and cannot be withdrawn. Launch conditions await confirmation.
已确认采用原版救援与项目 LP 销毁设计，不提供项目 LP 手续费分配。募集期限、建池条件、退款与领取规则待确认，当前尚未部署正式合约。||The original rescue and project LP-burn designs are confirmed. No project LP-fee sharing is offered. Sale period, launch conditions, refunds and claims await confirmation. ECHO contracts are deployed. Mint is not open.
什么时候建池和开放交易？||When will liquidity and trading launch?
正式发行价格、最低门槛、期限、退款与领取规则确认后再接入。已确定项目 LP 销毁且不提供项目 LP 手续费分配；当前尚无真实交易或可领取资产。||Integration follows confirmation of price, minimum threshold, duration, refunds and claims. Project LP burn is confirmed and no project LP-fee sharing is offered. No live transactions or assets are available yet.
讨论方向：有限创世、募集成功后建池。项目 LP 销毁，不提供项目 LP 手续费分配。||Proposed direction: limited genesis and pool creation after success. Project LP is burned; no project LP-fee sharing is offered.
采用原版救援：暂停、申请、至少等待 48 小时、管理员再次签名，转到部署时固定的地址；禁止救援 LP，不自动迁池或退款。||Original rescue: pause, queue, wait at least 48 hours, then the owner signs a transfer to the fixed deployment-time recipient. LP rescue is forbidden. No automatic migration or refund.
1,000 份首免名额 · 每个 .ai 限 1 份||1,000 free first shares · One per .ai identity
1,000 份免费名额||1,000 free shares
每个 .ai 仅首份可免费，基础累计可铸 10 份；成功邀请一位新身份首铸，再增加 1 份付费额度。免费名额用尽需确认付费，Gas 另付。||Each .ai identity may claim only its first share free and has a base lifetime limit of 10 shares. Each distinct invited identity completing its first mint unlocks one more paid share. Confirm payment if free quota runs out. Gas is separate.
我的铸造额度 · 本机演示||My mint allowance · Local demo
已铸 / 总额度||Minted / Total allowance
邀请增加付费额度||Paid quota from invitations
当前剩余额度||Remaining allowance
填写身份查看首免资格||Enter an identity to check its first free share
首份已铸造，后续均付费||First mint completed. Further shares are paid.
首份可免费，正式 Gas 另付||First share can be free. Live gas is separate.
免费名额已用尽，需确认付费||Free quota exhausted. Confirm a paid quote.
身份累计上限||Identity lifetime allowance
当前已铸||Already minted
身份和邀请额度怎么计算？||How do identity and invitation limits work?
全站共有 1,000 份免费名额，每个 .ai 身份仅首份可免费。基础累计额度 10 份，含最多 1 份免费；邀请一个不同身份完成首次铸造，再加 1 份付费额度。免费或付费首铸都算，同一受邀者只计一次，自邀和重复铸造不叠加。全部份额计入全站总量，正式 Gas 另付。||There are 1,000 free shares globally, at most one on the first mint per .ai identity. The base lifetime allowance is 10 shares. Each distinct directly invited identity completing its first mint adds one paid share. Free or paid first mints count. Self-referrals and repeat mints do not. All shares count toward global supply; gas is separate.
受邀身份完成首次铸造后，邀请者增加 1 份付费额度；免费首铸也算，同一身份仅计一次，自邀不计入。||Each distinct invited identity completing its first mint unlocks one paid share for the inviter. Free first mints count. Each identity counts once; self-referrals do not.
邀请增加的是付费铸造额度，不是免费代币或现金。当前仅在本机演示；邀请佣金比例、预算和结算条件尚未确定。||Invites unlock paid mint allowance, not free tokens or cash. This is a local demo. Commission rates, budgets and settlement terms remain undecided.
已确认：全站 1,000 份免费名额，每个 .ai 身份仅首份可免费；基础累计额度 10 份，免费份额计入总量，Gas 另付。||Confirmed: 1,000 free shares globally, at most one on the first mint per .ai identity. Base lifetime allowance: 10 shares. Free shares count toward supply; gas is separate.
每直接邀请一个不同身份完成首次铸造，增加 1 份付费额度；免费首铸也算，同一身份仅计一次，不增加全站供应。||Each distinct directly invited identity completing its first mint unlocks one paid share. Free first mints count. Each identity counts once; global supply stays fixed.
身份额度数据无效。||Invalid identity allowance data.
铸造额度或报价已变化，请重新预览。||The allowance or quote changed. Review a new preview.
这不是链上回执。没有支付 BNB，也没有收到代币；身份额度、免费名额及模拟订单保存在本机，刷新后保留。||This is not an on-chain receipt. No BNB was paid and no tokens were received. Identity allowances, free quota and demo orders remain in this browser after refresh.
全站前 1,000 份免费 · 正式参与仍需 Gas||First 1,000 shares free · Live gas still applies
当前铸造价||Current mint price
免费||Free
部分免费||Partly free
之后 0.001 BNB / 份 · 演示||Then 0.001 BNB / share · Demo
前 1,000 份免费||First 1,000 shares free
免费份数||Free shares
付费份数||Paid shares
免费份额计入创世总量，免铸造费；正式参与仍需网络 Gas。额度用尽后重新确认付费报价。||Free shares count toward genesis supply and waive the mint fee. Live network gas still applies. Confirm a new paid quote once the quota is exhausted.
免铸造费不免网络 Gas；正式签名前核对免费与付费份数。当前仅模拟，不会签名或支付。||A free mint still requires network gas. Review free and paid shares before a live signature. This preview does not sign or pay.
募集成功后，将实际收取 BNB 的 70% 与预留代币配对建池。免费份额不产生 BNB 分账；建池与锁定规则待确认。||After a successful launch, pair 70% of collected BNB with reserved tokens. Free shares contribute no BNB. Pool and lock rules await confirmation.
免费份额怎么计算？||How do free shares work?
全站前 1,000 份免铸造费，占用创世总份额。跨越免费额度时，分别展示免费和付费份数；额度变化需重新确认，不能自动付费。正式参与仍需网络 Gas。||The first 1,000 shares globally waive the mint fee and count toward genesis supply. Quotes separate free and paid shares. Quota changes require fresh confirmation, never automatic payment. Live network gas still applies.
已确认：全站前 1,000 份免铸造费，占用创世总份额；正式参与仍需网络 Gas。||Confirmed: the first 1,000 shares globally waive the mint fee and count toward genesis supply. Live gas still applies.
免费额度用尽后，需重新确认付费报价，不会自动付费。||Confirm a new paid quote when free shares run out. Never switch to payment automatically.
付费价格和总量仍为演示，其他发行参数待确认。||Paid pricing and total supply remain illustrative. Other launch terms await confirmation.
70% 建池、30% 项目毛收入仅针对实际收取的 BNB；免费份额没有可分账资金。||The 70% pool / 30% gross project-income split applies only to collected BNB. Free shares contribute no funds.
演示剩余份数无效。||Invalid demo inventory.
本机演示订单无效。||Invalid local demo order.
模拟订单金额不一致。||Demo order amount mismatch.
Agent 的创世入口。||Genesis, for Agents.
跳转至 Mint||Skip to Mint
创世 Mint||Genesis Mint
参与记录||Activity
分享邀请||Invitations
机制与规则||Mechanism
入口||Entry
为 Agent 而造。||Made for Agents.
复制指令，||Copy the brief.
让你的 Agent 开始。||Let your Agent begin.
复制 Agent 铸造指令||Copy Agent mint brief
仅限持有官方 .ai 身份的 Agent 参与。||For Agents holding an official .ai identity.
以你的 .ai 身份开始。||Begin with your .ai identity.
份额、费用与来源，||Allocation, cost and attribution.
每一步清楚可见。||Every step, clearly visible.
探索参与机制||Explore the mechanism
THE RESONANCE / 鎏金之境||THE RESONANCE / GILDED EDITION
私人设计预览 · 未开放真实交易||Private preview · Live transactions unavailable
交互演示||Interactive preview
你的创世份额，从这里开始。||Your genesis allocation starts here.
创世发行进度 · 演示||Genesis progress · Demo
每份价格 · 演示||Price per share · Demo
每份所得 · 演示||Allocation per share · Demo
参与方式||Participation
你的 .ai Agent||Your .ai Agent
示例数字用于评审。||Illustrative figures for review.
正式发行参数待确认。||Launch parameters await confirmation.
确认你的身份||Your public identity
Agent 入口||Agent access
Agent 指令||Agent brief
示例身份 · 未连接钱包||Sample identity · No wallet connected
示例身份 · 尚未连接钱包||Sample identity · No wallet connected
本机尚无模拟首单||No first demo order on this device
选择 Mint 份数||Choose your shares
1–10 份 / 次||1–10 shares per preview
来自朋友的邀请 · 演示||A friend's invitation · Demo
手机复制指令，发送给自己的 Agent。||Copy on your phone and send to your Agent.
正式参与时，由你核对并确认交易。||You review and confirm each live transaction.
预览 / 001||PREVIEW / 001
本次基础份额||Your base allocation
募集成功后按正式规则领取||Claim under final rules after a successful launch
本次费用 · 演示||This order · Demo
网络 Gas||Network gas
正式签名前展示||Shown before a live signature
交给我的 Agent||Send to my Agent
模拟一次 Mint||Simulate a Mint
分享给朋友||Share with a friend
不连接钱包、不签名或支付。||No wallet connection, signing or payment.
价格、总量与邀请奖励尚待确认。||Price, supply and referral rewards are drafts.
简单三步||Three simple steps
你发出指令。||You send the brief.
Agent 处理步骤。||Your Agent handles the steps.
把参与过程留给 Agent，||Let your Agent handle the process.
把每一次确认留给自己。||Keep every confirmation in your hands.
选择你的份额||Select your allocation
输入 .ai 名称，选择数量，||Enter your .ai name and choose a quantity.
看清本次费用与邀请来源。||Review the cost and original referrer.
把指令交给 Agent||Send the brief to your Agent
手机直接复制并发送。||Copy and send directly from your phone.
正式版会返回身份和交易核验结果。||The live version will return identity and transaction checks.
确认，再留下记录||Confirm, then keep the receipt
正式签名前核对金额与 Gas。||Review the value and gas before signing.
当前可预览本机模拟订单。||For now, preview this browser's demo orders.
公开名称 · 来源可见||Public names · Visible attribution
以 .ai 名称查看参与，完成后生成自己的结果卡。||Look up an .ai name and create a card from a completed preview.
链上记录||On-chain
本机体验||Local demo
按公开 .ai 名称或交易哈希查询记录||Find records by public .ai name or transaction hash
查询||Look up
我的体验记录||My demo records
链上数据 · 尚未接入正式合约||On-chain · Official contract not configured
正式合约确定后，在这里查看真实参与。||Verified on-chain participation will appear here after integration.
当前没有链上 Mint 记录接入，不展示虚构参与者。||No on-chain feed is connected. No participants are fabricated.
当前没有链上 Mint 记录接入，不展示虚构参与者。可切换到本机体验记录。||No on-chain feed is connected. Switch to Local demo to view your own previews.
前往 Mint 体验||Try the Mint preview
让下一声回响，带着你的名字。||Let the next echo carry your name.
分享专属链接。朋友打开后能看见你的 .ai 名称，确认模拟首单时记录邀请来源。||Share your personal link. Friends see your .ai name, and their first simulated order records the source.
官网已公开，可分享给朋友。当前归属和订单仍为本机演示，不产生佣金。||The site is public and can be shared. Attribution and orders remain browser-local simulations without commissions.
我的公开分享链接||My public invitation link
分享邀请与结果卡||Share an invitation or result
复制链接||Copy link
公开名称来自上方输入框，尚未进行钱包核验。||The public name comes from the input above and has not been wallet-verified.
本机模拟订单||Local demo orders
来源和订单保存在这个浏览器，不代表链上订单。||Sources and orders are stored in this browser, not on-chain.
尚无模拟订单。返回 Mint 区，体验一次完整流程。||No demo orders yet. Return to Mint to try the full flow.
透明参与||Transparent participation
参与之前，看清资金路径。||Understand the funds before participating.
所有正式条件，确认后再公布。||Final terms will be published after confirmation.
发行与资金||Issuance & funds
邀请与归属||Referrals
常见问题||FAQ
Mint 资金，公开分配。||Mint funds, openly allocated.
流动性池||Liquidity
项目收入||Project income
为交易提供流动性。||Liquidity for trading.
募集成功后，将 70% BNB 与预留代币配对建池。建池门槛与流动性锁定规则待确认。||After a successful launch, 70% of BNB pairs with reserved tokens. The launch threshold and liquidity lock remain unconfirmed.
列明项目收入。||Disclosed project income.
30% 作为项目毛收入；若采用邀请奖励，支出从这部分列示，比例和上限另行确认。||30% is gross project income. Any referral rewards would be listed within this budget; rates and caps await confirmation.
有限创世、成功建池与实际 LP 手续费分配是当前讨论方向。募集期限、退款、领取及分配条件待确认；交易、质押与手续费领取均未上线，不承诺固定收益。||The proposed direction is limited genesis issuance, successful pool creation and distribution of actual LP fees. Deadlines, refunds, claims and allocation rules are unconfirmed. Trading, staking and fee claims are not live; no fixed return is promised.
一条链接，一份明确来源。||One link. A clear source.
使用公开 .ai 名称生成专属分享链接。||Create an invitation link from your public .ai name.
朋友打开链接后，Mint 区显示分享人的名字。||The Mint section shows the referrer's name when a friend visits.
首次模拟订单确认后锁定来源；自己邀请自己不计入。||The first simulated order locks its source. Self-referrals do not count.
当前仅存储在本机浏览器，不提供真实奖励。邀请者 8%、受邀者 2% 仍是讨论方案，尚未采用；正式比例、预算和结算条件待确认。||Records are local and carry no real rewards. An 8% inviter / 2% newcomer split is only a proposal, not an adopted rule. Rates, budget and settlement terms await confirmation.
生成我的邀请||Create my invitation
现在能真实 Mint 吗？||Can I mint for real now?
ECHO 合约已部署并核验，Mint 尚未开放。页面进度、报价与订单仍为本机演示，不会连接钱包、签名或支付。||This is a private design preview. Progress, prices, allocations and orders are illustrative. There is no official mint contract and no wallet connection, signing or payment.
手机上如何使用 Agent？||How do I use an Agent on mobile?
输入身份并选择份数，打开 Agent 入口，一屏核对摘要并复制指令，发给自己的 Agent。正式版会要求核验身份、邀请来源、合约、金额与 Gas。||Enter a name and quantity, review the summary and copy the brief to your Agent. A live version must verify identity, attribution, contract, value and gas.
邀请关系在哪里记录？||Where is attribution recorded?
演示中保存在这个浏览器，刷新后可保留。它不是跨设备或链上归属记录，不产生佣金。正式版需要身份核验与链上事件确认。||The preview saves attribution in this browser. It is not a cross-device or on-chain record and earns no commission. Production requires identity checks and confirmed events.
什么时候开放交易和收益领取？||When will trading and claims open?
正式发行参数、最低门槛、期限、退款、LP 锁定及分配规则确认后再接入相关功能。当前不展示可领取收益，也不承诺固定回报。||These functions require confirmed launch terms, thresholds, deadlines, refunds, LP locks and distribution rules. No claimable income or fixed return is currently offered.
从这里开始||Start here
© ECHO · 暂定品牌||© ECHO · Draft brand
发行规则草案||Draft launch rules
分享||Share
ECHO 首页||ECHO home
主导航||Main navigation
打开导航菜单||Open navigation
关闭导航菜单||Close navigation
一条铂金色金属带折叠成开放的回环||A platinum ribbon folded into an open loop
演示发行进度||Demo issuance progress
减少 Mint 份数||Decrease Mint quantity
增加 Mint 份数||Increase Mint quantity
快捷选择 Mint 份数||Quick Mint quantities
记录数据来源||Record source
查询 .ai 名称，如 nova.ai||Look up an .ai name, e.g. nova.ai
机制与规则分类||Mechanism categories
关闭弹窗||Close dialog
请检查 Mint 份数||Check the Mint quantity
输入 1–10 的整数||Enter an integer from 1 to 10
填写你的 .ai 名称||Enter your .ai name
仅用于预览，未进行身份核验||Preview only; identity is unverified
本机已有模拟首单||First demo order exists on this device
请输入 1–64 位字母或数字，例如 nova.ai。||Enter 1–64 letters or digits, e.g. nova.ai.
请选择 1–10 的整数份数。||Choose an integer quantity from 1 to 10.
演示剩余份数不足，请减少份数。||Not enough demo inventory. Reduce the quantity.
本机模拟记录 · 身份未核验||Local demo · Identities unverified
这个 .ai 名称还没有本机模拟记录。||No local demo records exist for this .ai name.
你的第一声回响，还没有开始。||Your first echo has yet to begin.
返回 Mint 区完成一次模拟，结果会出现在这里。记录仅保存在这个浏览器。||Complete a simulated Mint to see it here. Records stay in this browser.
示例身份 · 未核验||Sample identity · Unverified
查看结果卡||View result card
下一声回响，由你邀请。||Invite the next echo.
链接带上你的公开 .ai 名称，朋友打开即可看见分享人。||Your link includes a public .ai name so friends can see who invited them.
你的公开 .ai 名称||Your public .ai name
专属邀请链接||Personal invitation link
分享邀请链接||Share invitation link
目前仅你可见，公开站点后朋友才能访问。名称未经钱包核验；当前没有真实奖励。||Only you can access this private preview. Friends can visit once it is public. Names are unverified and no real rewards are offered.
请输入有效的 .ai 名称。||Enter a valid .ai name.
生成我的参与结果卡||Create my result card
完成一次模拟 Mint 后，可生成带参与份额的结果卡。||Complete a simulated Mint to create a card with your demo allocation.
没有找到这笔本机模拟订单。||This local demo order was not found.
把你的回响，分享出去。||Share your echo.
ECHO / 演示份额||ECHO / DEMO ALLOCATION
本机模拟参与 · 非链上凭证||Local demo · Not an on-chain receipt
没有支付 BNB，也未收到真实代币。||No BNB spent. No real tokens received.
分享结果图片||Share result image
保存 PNG 图片||Save PNG image
复制结果与邀请链接||Copy result and invitation link
参与结果文字||Participation result text
可长按保存的 ECHO 模拟参与结果卡||ECHO demo result card; press and hold to save
图片只包含公开名称、演示份额和邀请来源链接。私人站点公开后，朋友才能访问。||Images contain only a public name, demo allocation and invitation link. Friends can visit once the site is public.
正在生成图片…||Generating image…
当前设备未提供图片分享，已生成 PNG；也可长按下方图片保存。||Image sharing is unavailable. Your PNG is ready; press and hold the image below to save it.
PNG 已生成；若没有自动下载，可长按下方图片保存。||PNG ready. If it did not download, press and hold the image below to save it.
已取消分享。||Sharing cancelled.
图片暂不可用，请复制结果文字。||Image unavailable. Copy the result text instead.
图片生成失败，请复制结果文字。||Image generation failed. Copy the result text instead.
当前浏览器无法生成图片，请复制结果文字。||This browser cannot generate images. Copy the result text instead.
先在 Mint 区填写 .ai 名称。||Enter your .ai name in Mint first.
已复制。||Copied.
请长按或使用复制快捷键复制。||Press and hold, or use your copy shortcut.
当前名称与分享人相同，不计邀请。||This name matches the inviter. Self-referrals do not count.
本机首单来源已记录，后续链接不会改写原归属。||The first local order locked its source. Later links cannot change it.
本机首单没有邀请来源，后续链接不会追溯新增。||The first local order had no referrer. Later links cannot add one retroactively.
确认模拟订单时记录来源。正式归属仍需身份与链上事件核验。||Confirming the simulated order records its source. Live attribution requires identity and event verification.
首单未关联邀请人||No referrer on the first order
填写自己的 .ai 名称以预览来源。||Enter your .ai name to preview attribution.
先填写上方 .ai 名称||Enter an .ai name above first
来源和订单保存在这个浏览器，刷新后保留；它们不是链上订单，不产生佣金。||Sources and orders remain in this browser after refresh. They are not on-chain orders and earn no commission.
当前浏览器无法保存全部记录。本次会话仍可体验，记录不是链上订单。||This browser cannot save all records. You can still use this session; records are not on-chain.
首单来源已记录 · 本机演示，未产生奖励||First-order source saved · Local demo, no rewards
无新增首单奖励 · 本机演示||No new first-order reward · Local demo
其他标签页记录无效，未载入。||Records from another tab were invalid and were not loaded.
分享标识无效，未新增邀请来源。||The invitation was invalid. No new referrer was added.
邀请来源 · 未核验||Referrer · Unverified
无||None
首单归属||First-order attribution
确认本次模拟订单时记录||Recorded when you confirm this demo order
沿用原归属，不新增奖励||Original source retained; no new reward
本机模拟订单||Local demo order
邀请来源||Referrer
归属状态||Attribution status
首单来源已记录，无真实佣金||First-order source saved; no real commission
无新增首单奖励||No new first-order reward
核对你的创世份额。||Review your genesis allocation.
模拟支付||Demo cost
70% 流动性份额||70% liquidity allocation
30% 项目收入份额||30% project-income allocation
确认模拟订单||Confirm demo order
仅更新演示数据，不连接钱包或支付。正式版会先展示 Gas 与具体交易，再由你确认。||Only demo data changes. No wallet or payment is involved. A live version must show gas and the exact transaction for your confirmation.
你的回响，已被记录。||Your echo has been recorded.
生成参与结果卡||Create result card
查看参与记录||View participation
这不是链上回执。没有支付 BNB，也没有收到代币；份额与进度刷新后重置，本机模拟订单保留。||This is not an on-chain receipt. No BNB was paid and no tokens were received. Allocation and progress reset on refresh; local demo orders remain.
只读身份预览 · 尚未连接钱包或核验身份||Read-only identity preview · No wallet or verification
本机首单状态||Local first-order status
真实资产或收益||Real assets or income
未上线，无可领取资产||Not live; no claimable assets
查看本机订单||View local orders
本机记录不代表链上资产或真实参与资格。||Local records do not prove on-chain assets or live eligibility.
尚无模拟首单||No first demo order
已有模拟首单||First demo order exists
先填写有效名称并选择份数。||Enter a valid name and choose a quantity first.
复制一次，交给 Agent。||Copy once. Send to your Agent.
核对本次摘要后，把指令发送给自己的 Agent。||Review this summary, then send the brief to your Agent.
复制参与指令||Copy participation brief
下一步：复制指令 → 发送给 Agent → 返回查询记录||Next: copy → send to your Agent → return to check records
查看完整指令||View full brief
ECHO Agent 体验指令||ECHO Agent preview brief
修改名称与份额||Edit name and allocation
查询我的记录||Look up my records
ECHO 合约已部署，Mint 暂未开放，当前仍为交互演示，不会签名或支付。||Private preview. No official contract is configured, and no signing or payment occurs.
公开名称 · 未核验||Public name · Unverified
模拟数量||Demo quantity
模拟总费用||Demo total cost
已复制，发送给 Agent||Copied — send to your Agent
切换到自己的 Agent 粘贴发送，完成后返回查询记录。||Paste into your Agent, then return here to check the result.
指令已复制。||Brief copied.
参与规则，公开在前。||Clear rules before participation.
ECHO 为暂定品牌，页面价格、份数、身份和进度均为演示。||ECHO is a draft brand. Prices, quantities, identities and progress are illustrative.
讨论方向：有限创世、募集成功后建池，以及实际 LP 手续费分配。||Proposed direction: limited genesis issuance, pool creation after success and distribution of actual LP fees.
BNB 分账以 70% 流动性、30% 项目毛收入为基础；邀请支出若采用，从项目收入列示。||The basis is 70% BNB liquidity and 30% gross project income. Any adopted referral costs would be listed within project income.
价格、总量、邀请比例、募集期限、门槛、退款及 LP 锁定规则待确认。||Price, supply, referrals, sale period, thresholds, refunds and LP locks await confirmation.
当前不执行支付、质押或领取，也不承诺固定收益。||Payments, staking and claims are not active. No fixed return is promised.
正式参与前，需要核验身份、合约、来源、金额与 Gas，并由你确认具体交易。||Before live participation, verify identity, contract, attribution, value and gas, and confirm the specific transaction.
邀请来源已变化，请重新预览。||The referrer changed. Review a new preview.
本机演示身份数量已达上限。||This browser reached its demo identity limit.
仅限 Agent 铸造||Agent-only minting
切换语言||Switch language
已复制铸造指令，发送给你的 Agent。||Mint brief copied. Send it to your Agent.
当前是私人交互预览，正式合约未配置。||Private interactive preview. Official contracts are not configured.
仅提供给 Agent 的铸造流程。复制指令前可查看摘要。||Built for Agent minting. Review the summary before copying.
查看铸造摘要||Review mint summary
ECHO · 我的邀请||ECHO · My invitation
体验 ECHO 的 Agent 参与流程。当前为私人演示，没有真实 Mint 或奖励。||Try ECHO's Agent flow. This is a private preview with no real Mint or rewards.
ECHO · 我的回响||ECHO · My echo
图片生成失败，请复制结果文字。||Image generation failed. Copy the result text instead.
 入口|| Entry
`;
export const EN=Object.freeze(Object.fromEntries(pairs.trim().split('\n').map(line=>line.split('||'))));
export function translateText(source,language='en'){
  if(language!=='en'||typeof source!=='string')return source;
  const value=source.trim();if(!value)return source;
  let result=EN[value];
  if(result===undefined){const arrow=value.match(/^(.*?)(\s*[↗↓↑✓])$/);if(arrow&&EN[arrow[1].trim()])result=EN[arrow[1].trim()]+arrow[2];}
  const patterns=[
    [/^自动付费上限（开盘前）：(.+) BNB，Gas 另设上限$/,m=>`Automatic payment cap (pre-open): ${m[1]} BNB, with a separate gas cap`],
    [/^开盘门槛 · 本机演示 ([\d,]+) \/ 5,000 份（含免费）$/,m=>`Opening threshold · Local demo ${m[1]} / 5,000 shares (including free)`],
    [/^([\d,]+) \/ ([\d,]+) 份$/,m=>`${m[1]} / ${m[2]} shares`],
    [/^当前身份剩余 (\d+) 份额度，请减少份数或成功邀请新身份。$/,m=>`This identity has ${m[1]} shares remaining. Reduce the quantity or successfully invite a new identity.`],
    [/^免费剩余 ([\d,]+) \/ ([\d,]+) 份$/,m=>`Free remaining: ${m[1]} / ${m[2]} shares`],
    [/^剩余 ([\d,]+) 份$/,m=>`${m[1]} shares remaining`],
    [/^\/ ([\d,]+) 份$/,m=>`/ ${m[1]} shares`],
    [/^(\d+) 份 · (.+ BNB)$/,m=>`${m[1]} ${m[1]==='1'?'share':'shares'} · ${m[2]}`],
    [/^([\d,]+) ECHO · 演示$/,m=>`${m[1]} ECHO · Demo`],
    [/^(.+\.ai) · 未核验$/,m=>`${m[1]} · Unverified`],
    [/^我的首单邀请演示：(\d+)$/,m=>`My first-order referrals (demo): ${m[1]}`],
    [/^由 (.+\.ai) 分享给你$/,m=>`Invited by ${m[1]}`],
    [/^(\d+) 份模拟 Mint · 来源：(.+)$/,m=>`${m[1]} demo shares · Referrer: ${m[2]==='无'?'None':m[2]}`],
    [/^(\d+) 份模拟 · (DEMO-\d+)$/,m=>`${m[1]} demo shares · ${m[2]}`],
    [/^(\d+) 份模拟 Mint \/ (DEMO-\d+)$/,m=>`${m[1]} demo Mint shares / ${m[2]}`],
    [/^· (\d+) 份演示 Mint$/,m=>`· ${m[1]} demo Mint shares`],
    [/^(\d+) 份$/,m=>`${m[1]} ${m[1]==='1'?'share':'shares'}`],
    [/^本次模拟了 (\d+) 份 Mint，基础份额 ([\d,]+) ECHO。邀请来源随首单一起记录。$/,m=>`Simulated ${m[1]} Mint shares and ${m[2]} ECHO. The first order records its original referrer.`]
  ];
  if(result===undefined){for(const [pattern,render]of patterns){const match=value.match(pattern);if(match){result=render(match);break;}}}
  if(result===undefined)return source;
  return source.slice(0,source.indexOf(value))+result+source.slice(source.indexOf(value)+value.length);
}
