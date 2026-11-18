import {DEMO,normalizeIdentity,quoteMint,formatBNB} from './model.mjs';

export function mintSummary(quantity, remaining=DEMO.totalShares,eligibility={}) {
  const q=quoteMint(quantity,remaining,eligibility);
  return {...q,costLabel:`${formatBNB(q.costWei)} BNB`,tokenLabel:`${q.tokens.toLocaleString('zh-CN')} ECHO`};
}

export function buildAgentBrief({identity,quantity,remaining,eligibility={},referrer=null,firstOrder=true,baseUrl=null,language='zh'}) {
  const name=normalizeIdentity(identity),q=mintSummary(quantity,remaining,eligibility);
  const paidCeiling=formatBNB(DEMO.priceWei*BigInt(q.quantity));
  const inviter=referrer ? normalizeIdentity(referrer) : null;
  if(inviter===name) throw new Error('不能把自己的身份作为邀请来源。');
  const site=baseUrl?new URL(baseUrl):null;
  if(site&&!['https:','http:'].includes(site.protocol))throw new Error('官网地址必须使用 HTTP 或 HTTPS。');
  const guide=site?new URL('/llms.txt',site.origin).href:'/llms.txt';
  const config=site?new URL('/network.json',site.origin).href:'/network.json';
  if(language==='en')return [
    'Review ECHO genesis Mint participation with my Agent.',
    'MINT CLOSED: official ECHO contracts are deployed and checked, but this website still offers simulations only. Do not request wallet approvals, signatures, transfers or transaction broadcasts.',
    '',
    'Sample identity: '+name+' (not wallet-verified)',
    'Target network: BNB Chain, chainId 56 (workflow description only)',
    'Official Agent guide: '+guide,
    'Official network configuration: '+config,
    'If executionReady is not true, or mintContract is absent, stop all transaction execution and explain the preview. If the public site cannot be accessed, say so; never request login credentials.',
    'Planned quantity: '+q.quantity+(q.quantity===1?' share':' shares'),
    'Free first; automatic paid fallback if free quota is unavailable. Pre-open Mint payment ceiling for this selected quantity: '+paidCeiling+' BNB, with a separate user-approved gas cap. Wallet authorization is still required. After opening, confirm a fresh live-price ceiling before automatic execution.',
    'Confirmed pre-open paid price: 0.002 BNB per share. After opening, each share keeps a fixed token allocation while its BNB price follows the market. Re-read the live phase and quote; never reuse this pre-open preview as a post-open transaction price.',
    'Confirmed delivery and permissions: live Mint sends ECHO to the minter in the same successful transaction, with no separate claim. The owner may change future Mint pricing rules; completed mints are unaffected. Token tax rates and the 30-minute opening tax schedule cannot be changed by the owner. A pricing-version change or spending outside prior consent requires fresh confirmation. This preview does not implement these contract permissions.',
    'No overall Mint deadline and no Mint refunds. On each successful paid mint, 70% of collected BNB funds liquidity and 30% is sent directly to the project address. Opening is triggered at 5,000 cumulative shares including free claims, or earlier by the owner. Minting continues after opening.',
    '20% of total token supply is reserved exclusively for rewards; liquidity tokens are allocated separately. Confirmed cap: 10,000 shares at 1,000 ECHO each. Total supply: 21,250,000 ECHO; user mint allocation: 10,000,000; liquidity reserve: 7,000,000; rewards: 4,250,000 (20%). Liquidity tokens are added in batches; unused liquidity reserve is burned after sellout. Reward distribution is undecided.',
    'Secondary-market token taxes: buy 1%; sell 2%, except the first 30 minutes after pool opening when sell tax is 30% instead of 2%. Tax tokens are accumulated and batch-swapped to BNB for the project address. DEX fees and gas are separate. Live pricing, taxes and automatic conversion are not implemented in this preview.',
    'Confirmed design: 1,000 free shares globally; only the first share per official .ai identity may be free while quota remains. Paid shares do not consume the free pool. Live gas still applies.',
    'Base lifetime allowance: 10 shares, including at most one free share. Each distinct directly invited identity that completes its first mint adds one paid share to the inviter allowance. Free or paid first mints count; self-referrals and repeat mints do not. This does not increase global supply.',
    'Identity already minted: '+q.identityMinted+'; successful invites: '+q.successfulInvites+'; total allowance: '+q.identityLimit+'; remaining allowance: '+q.identityRemaining,
    'Free shares in this quote: '+q.freeQuantity,
    'Paid shares in this quote: '+q.paidQuantity,
    'Pre-open paid price per share: '+formatBNB(DEMO.priceWei)+' BNB (confirmed design; preview execution is disabled)',
    'Demo total cost: '+q.costLabel+'; actual gas must be checked separately',
    'For future live execution, verify ownership of the stable official identity ID and recheck its cumulative mint count, free-claim status, unique direct referrals, global supply and free quota immediately before signing. A name or wallet change must not reset identity limits. Re-read the quote if price or free availability changes. Automatic paid fallback is allowed only within my prior wallet-, identity-, quantity-, referrer-, pricing-version-, expiry-, Mint-cost- and gas-bounded consent. Stop when consent is absent, exceeded or changed; never request unlimited authority.',
    'Demo base allocation: '+q.tokenLabel,
    'Referrer: '+(inviter||'None')+' (public name, not verified on-chain)',
    'First-order status: '+(firstOrder?'No first demo order in this browser':'First demo order exists; retain its original referrer'),
    '',
    'Limited issuance uses the confirmed opening trigger; project LP is sent to the dead address and no project LP-fee sharing is offered. Live contracts and market quoting are not integrated.',
    'The 70% liquidity / 30% gross project-income split applies only to BNB actually collected from paid shares. Free shares contribute no BNB. Referral commission rates, budgets and settlement terms are unconfirmed. The previous random-echo idea is only an unadopted candidate.',
    'The pre-open price, no-deadline/no-refund policy, launch trigger and tax rates are confirmed. Supply allocation is confirmed. Reward distribution, live website integration remains pending; read deployed addresses and status from network.json. No fixed returns are promised.',
    'Explain identity checks, costs, attribution and the record lookup workflow. For a future live version, verify official configuration, deployed contracts, identity ownership, value and gas; obtain confirmation for the exact transaction before submission, unless prior explicit bounded consent already covers it and the wallet permits automatic signing.',
    'Report a transaction hash only after a real submission and confirm success only from its receipt and events. Never invent a hash, token receipt or on-chain participation.',
    'No real tokens, commissions or fees are claimable in this preview.'
  ].join('\n');
  return [
    '请帮我评审 ECHO 的创世 Mint 参与流程。',
    'ECHO 正式合约已部署并核验，但 Mint 仍关闭，网页交互仍为模拟。不要请求钱包授权、签名、转账或广播交易。',
    '',
    `示例身份：${name}（尚未经钱包核验）`,
    '目标网络：BNB Chain，chainId 56（仅流程说明）',
    '先读取官方 Agent 文档：'+guide,
    '再核对官方状态配置：'+config,
    '如果 executionReady 不是 true，或未提供正式 mintContract，停止任何交易流程，只解释预览。网站已公开；无法访问时说明情况，不索要登录凭证。',
    `计划数量：${q.quantity} 份`,
    '首免优先，免费额度不足时自动转为付费。本次所选数量的开盘前 Mint 付款上限：'+paidCeiling+' BNB，Gas 另需用户设定上限；必须先取得钱包授权。开盘后先确认新的市场报价总额上限，再在授权范围内自动执行。',
    '已确认开盘前付费价 0.002 BNB / 份。开盘后每份代币数量固定，BNB 单价随市场报价调整；必须重新读取实时阶段与报价，不能沿用当前开盘前预览金额。',
    '已确认到账与权限：正式 Mint 成功后，ECHO 在同一笔交易中直接到达铸造钱包，无需再次领取。管理员可修改后续 Mint 计价规则，不影响已完成的铸造；代币税率及开盘 30 分钟税率安排不可修改。计价版本变化或超出原有授权范围时，必须重新确认。当前预览尚未实现这些合约权限。',
    '不设整体 Mint 截止时间，不退款。每笔成功付费铸造收入的 70% 用于建池，30% 直接转入项目地址。累计铸造 5,000 份（含免费）自动开盘，管理员也可提前开盘，开盘后继续 Mint。',
    '总供应量的 20% 专门预留奖励，建池代币另行配备；发行上限 10,000 份，每份 1,000 ECHO；总供应量 2,125 万，其中用户 Mint 1,000 万、建池专用 700 万、奖励 425 万（20%）。建池分批配币，售罄后未使用的建池预留销毁；奖励发放办法待确认。',
    '二级市场代币税：买 1%，卖 2%；从池子开盘起前 30 分钟卖税为 30%，替代常规 2%。税费先累积代币，再分批兑换成 BNB 转入项目地址；DEX 手续费和 Gas 另计。当前预览尚未接入真实市场报价、税费或自动兑换。',
    '已确认：全站共 1,000 份免费名额，每个官方 .ai 身份仅首份可免费，计入创世总量；付费铸造不消耗免费名额，正式参与仍需网络 Gas。',
    '每个 .ai 基础累计额度 10 份，含最多 1 份免费。每直接邀请一个不同身份完成首次铸造，邀请者增加 1 份付费额度；免费或付费首铸均计入，同一身份只计一次，自邀与重复铸造不叠加。不增加全站发行总量。',
    `当前已铸：${q.identityMinted} 份；成功邀请：${q.successfulInvites} 位；累计上限：${q.identityLimit} 份；剩余额度：${q.identityRemaining} 份。`,
    `本次免费份数：${q.freeQuantity} 份`,
    `本次付费份数：${q.paidQuantity} 份`,
    `开盘前付费单价：${formatBNB(DEMO.priceWei)} BNB（已确认设计，当前不执行交易）`,
    `演示总费用：${q.costLabel}，正式 Gas 另行核验`,
    '正式执行时，核验稳定的官方身份 ID 及其所有权，签名前重新核对累计已铸、首免使用状态、不同受邀身份、全站供应和免费额度。换名字或钱包不能重置身份额度。首免不足时，仅可在我预先授权的钱包、身份、份数、推荐人、计价版本、有效期、Mint 金额及 Gas 上限内重新报价并自动付费；未获授权、超出上限或计价版本变化时停止确认，不得无限授权。',
    `演示基础份额：${q.tokenLabel}`,
    `邀请来源：${inviter || '无'}（公开名称，尚未经链上核验）`,
    `首单状态：${firstOrder ? '本机未记录模拟首单' : '本机已有模拟首单，原归属保持不变'}`,
    '',
    '按已确认门槛建池，项目 LP 转入销毁地址，不提供项目 LP 手续费分配。真实合约与开盘后市场报价尚未接入。',
    '70% 建池、30% 项目毛收入仅分配付费份额实际收取的 BNB；免费份额不产生 BNB 分账。邀请佣金若采用，从项目收入内列支，比例、上限和结算条件尚未确认。',
    '原有随机回响仅为候选演示，不作为本次收益承诺。开盘前价格、不设截止时间、不退款、开盘门槛和税率已确认；总量分配已确认；正式合约与钱包地址已部署确定；以 network.json 的状态为准，官网真实交易尚未开放。',
    '',
    '请解释身份核验、费用、邀请归属、订单结果和回到网页查看记录的流程。正式上线后，应重新读取官方配置及实时链上报价，展示合约、金额与 Gas，取得我对具体交易的确认，或使用仍有效且涵盖本次交易的明确限额授权后再执行。',
    '完成真实交易后才可报告回执与交易哈希。当前仅本机模拟，不得编造交易哈希、代币到账或链上参与记录。',
    '当前没有真实代币、佣金或手续费可以领取。'
  ].join('\n');
}
