import {feesPanel, bindFeeCalculator} from './funds.mjs';

export function helpPage(t, {feesOpen = false} = {}) {
  const app = document.querySelector('#app');
  app.innerHTML = `<div class="eyebrow">ECHO LAUNCH · FAQ</div><h1>${t('常见问题','Frequently asked questions')}</h1>
    <section class="panel faq-panel">
      <details id="faq-fees" ${feesOpen ? 'open' : ''}><summary>${t('创建、认购和退出分别收取什么费用？','What does creation, subscription or exit cost?')}</summary>${feesPanel(t)}<h3>${t('按金额演算','Calculate for an amount')}</h3><label class="field"><span>BNB</span><input data-fee-example value="1" inputmode="decimal"></label><div data-fee-result></div></details>
      <details><summary>${t('退款申请成功，就代表 BNB 已到账吗？','Does a successful refund request mean BNB has arrived?')}</summary><p>${t('退款先记入合约内可提现余额，再由原钱包提现。请在“我的记录”核对实际提现回执；两步各需 Gas，Gas 不退。','A refund first creates withdrawable contract credit. The original wallet then withdraws it. Check the actual withdrawal receipt in My records. Each step requires gas, which is not refunded.')}</p></details>
      <details><summary>${t('网页连接钱包后，会自动执行交易吗？','Does connecting a wallet execute transactions?')}</summary><p>${t('不会。记录查询只读取公开链上数据；创建、认购、退款与提现仍交给 Agent 逐笔核对、模拟，并由你确认。','No. Record lookup reads public on-chain data. Your Agent still verifies and simulates each creation, subscription, refund or withdrawal, and asks you to confirm.')}</p></details>
      <details><summary>${t('合约经过独立安全审计了吗？','Have the contracts received an independent security audit?')}</summary><p>${t('尚未完成独立安全审计。当前是代币主网公开测试；源码匹配和本地测试不等于独立审计，也不保证项目履约、价格或收益。','An independent security audit has not been completed. This is a token mainnet public beta. Source matching and local tests are not an independent audit or a guarantee of delivery, price or returns.')}</p><a href="#/status">${t('查看合约与风险','Contracts and risks')} ↗</a></details>
      <details><summary>${t('为什么现在不能创建 NFT 项目？','Why is NFT creation unavailable?')}</summary><p>${t('NFT 公开内容存储暂缓，正式 NFT 创建与认购保持关闭。','NFT public content storage is deferred. NFT creation and subscription remain disabled.')}</p></details>
    </section>`;
  bindFeeCalculator(app, t);
}
