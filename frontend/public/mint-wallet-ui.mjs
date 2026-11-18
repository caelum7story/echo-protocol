import {MintWalletFlow} from './mint-wallet-flow.mjs';
import {DEPLOYMENT,formatEther} from './chain.mjs';
import {AgenticWalletTransport,officialQrView} from './agentic-wallet.mjs';

export function initMintWallet({getClient,getLanguage,getShares,getReferrer,onQuote,onIdentity,showAgent,isInviteModule}){
 const phrases=new Map();const $=id=>document.getElementById(id),t=(zh,en)=>{phrases.set(zh,[zh,en]);phrases.set(en,[zh,en]);return getLanguage()==='en'?en:zh;};
 const headerWallet=document.querySelector('.header-agent');
 let busy=false,balance=null,identity=null,feedback='',receipt=null,poll=null,epoch=0,activeKind=null,connectEpoch=0,connectionStage=null;
 let connectingTransport=null,qrClock=null;
 let storage;try{storage=localStorage;}catch{}
 const flow=new MintWalletFlow({getClient,storage,onChange:()=>{if(!flow.wallet){identity=null;balance=null;}render();}});
 const panel=document.createElement('section');panel.className='mint-wallet-card';panel.dataset.noTranslate='';
 panel.innerHTML='<div class="mint-wallet-top"><strong id="mint-wallet-state"></strong><button type="button" class="text-button" id="mint-wallet-connect"></button></div><p id="mint-wallet-address"></p><div class="mint-wallet-bottom"><span id="mint-wallet-identity"></span><b id="mint-wallet-balance"></b></div><p id="mint-wallet-feedback" role="status" aria-live="polite"></p><a id="mint-last-transaction" target="_blank" rel="noopener noreferrer" hidden></a><button type="button" id="mint-wallet-refresh" class="text-button"></button>';
 document.querySelector('#mint-form .mint-fields').prepend(panel);
 const primary=document.createElement('button');primary.type='button';primary.className='button button-ink';primary.id='wallet-mint-button';primary.dataset.noTranslate='';
 const secondary=document.querySelector('#mint-form [data-action="agent"]');secondary.before(primary);secondary.className='text-button wallet-agent-alternative';
 const pending=document.createElement('section');pending.className='wallet-pending';pending.dataset.noTranslate='';pending.hidden=true;
 pending.innerHTML='<h3 id="wallet-pending-title"></h3><p id="wallet-pending-text" role="status"></p><a id="wallet-pending-link" target="_blank" rel="noopener noreferrer"></a><label id="wallet-recovery-label" for="wallet-recovery-hash"></label><input id="wallet-recovery-hash" autocomplete="off" spellcheck="false" placeholder="0x…"><button type="button" class="button button-ghost" id="wallet-pending-check"></button><details id="wallet-clear-details"><summary id="wallet-clear-summary"></summary><label class="wallet-ack"><input id="wallet-no-send-ack" type="checkbox"><span id="wallet-no-send-text"></span></label><button type="button" class="text-button" id="wallet-clear-pending"></button></details>';
 primary.after(pending);
 const dialog=document.createElement('dialog');dialog.id='wallet-mint-dialog';dialog.setAttribute('aria-labelledby','wallet-dialog-title');dialog.className='wallet-mint-dialog';dialog.dataset.noTranslate='';document.body.append(dialog);
 const errorMessage=(e,{connection=false}={})=>{
  if(Number(e?.code)===4001)return t('你已取消钱包请求。','You cancelled the wallet request.');
  const c=e?.providerError?.code||e?.message||'',map={
   AGENTIC_OPERATOR_OFFLINE:['扫码服务暂不可用，请稍后重试，或使用自己的 Agent。','The QR service is unavailable. Retry shortly or use your own Agent.'],
   AGENTIC_SERVICE_UNAVAILABLE:['扫码服务暂不可用，请稍后重试。','The QR service is temporarily unavailable. Please retry.'],
   AGENTIC_CONNECTION_CAPACITY:['当前连接较多，请稍后重新生成二维码。','Connection capacity reached. Generate a new code shortly.'],
   AGENTIC_RATE_LIMIT:['二维码请求较频繁，请稍后重试。','Too many QR requests. Please retry later.'],
   AGENTIC_CONNECTION_CANCELLED:['连接已取消，没有发起铸造付款。','Connection cancelled. No Mint payment initiated.'],
   DEVELOPER_MODE_REQUIRED:['请在币安 App 的 Agentic Wallet 设置中启用 Developer Mode，再重新核对铸造。','Enable Developer Mode in the Binance App Agentic Wallet settings, then review this Mint again.'],
   WALLET_HAS_PENDING_REQUEST:['钱包里已有待处理请求，请先在币安 App 中完成或取消。','Your wallet has a pending request. Complete or cancel it in the Binance App.'],
   AGENTIC_MINT_PENDING:['正在等待币安钱包返回结果，请检查 App，并点击“恢复核验”；不要重复付款。','Waiting for Binance Wallet. Check the App and resume verification; do not pay again.'],
   APP_CONFIRMATION_PENDING:['请在币安 App 中确认或取消这笔请求，然后恢复核验。','Approve or reject this request in the Binance App, then resume verification.'],
   AGENTIC_PREVIEW_TIMEOUT:['官方预演仍未返回，请稍后查询；没有提交付款。','The official preview has not returned. Check shortly; no payment was submitted.'],
   OFFICIAL_PREVIEW_HIGH_RISK:['官方预演发现风险，已停止提交。可使用自己的 Agent 查看具体预演。','The official preview flagged risk. Submission stopped. Your own Agent can inspect the preview.'],
   OFFICIAL_PREVIEW_REJECTED:['币安官方预演未通过，没有提交付款。','The official Binance preview did not pass. No payment submitted.'],
   NO_BROWSER_WALLET:['未检测到浏览器钱包，请选择币安钱包扫码，或交给 Agent。','No browser wallet found. Choose Binance Wallet QR or use your Agent.'],
   WRONG_WALLET_NETWORK:['请在钱包中切换到 BNB Chain（56），再重新连接。','Switch your wallet to BNB Chain (56), then reconnect.'],
   NO_OFFICIAL_IDENTITY:['这个钱包没有可核验的官方 .ai 身份。请连接持有身份的钱包，或使用原来的 Agent 入口。','This wallet has no verifiable official .ai identity. Connect the identity wallet or use the Agent route.'],
   WALLET_IDENTITY_MISMATCH:['连接的钱包与官方身份持有人不符，请重新连接。','The connected wallet does not own this official identity. Reconnect.'],
   WALLET_CHANGED:['钱包账号或网络已变化，请重新连接并核对。','The wallet account or network changed. Reconnect and review again.'],
   WALLET_DISCONNECTED:['钱包已断开，请重新连接。','Wallet disconnected. Please reconnect.'],
   WALLET_CONNECTION_TIMEOUT:['扫码连接已超时。请重新生成二维码，或交给自己的 Agent。没有发起铸造付款。','The connection expired. Generate a new QR code or use your own Agent. No Mint payment was initiated.'],
   INSUFFICIENT_BNB:['BNB 不足以支付本次铸造及 Gas；免费份额也需要 Gas。','Insufficient BNB for this Mint and gas. Free shares also require gas.'],
   MINT_PENDING:['上次交易结果尚待核验，请先检查，不要重复付款。','Verify the previous transaction before another payment.'],
   REVIEW_EXPIRED:['报价已过期或钱包已变化，请重新核对。','The review expired or the wallet changed. Request a new review.'],
   REVIEW_REQUIRED:['请先重新查看交易预览。','Request a new transaction review first.'],
   STALE_CHAIN_STATE:['链上数据延迟，暂不准备付款，请稍后刷新。','Chain data is delayed. Refresh before preparing payment.'],
   RELEASE_UNAVAILABLE:['正式配置未通过核对，请刷新后重试。','The official configuration could not be verified. Refresh and retry.'],
   STORAGE_UNAVAILABLE:['浏览器无法保存待处理交易，请允许本站本地存储后重试，或交给 Agent。','This browser cannot save pending transactions. Allow local storage or use your Agent.'],
   WRONG_RECOVERY_TRANSACTION:['交易哈希与原钱包、金额或铸造内容不符。','This hash does not match the original wallet, amount and Mint call.'],
   TRANSACTION_HASH_REQUIRED:['请先在钱包记录中查到交易哈希，再恢复核验。','Find the transaction hash in your wallet, then resume verification.'],
   INVALID_TRANSACTION_HASH:['请输入完整交易哈希。','Enter a complete transaction hash.'],
   ORACLE_NOT_READY:['市场报价尚未就绪，请稍后重试。','Market pricing is not ready. Please retry later.'],
   IDENTITY_QUOTA_EXCEEDED:['超过这个身份的剩余铸造额度。','Insufficient remaining quota for this identity.'],
   GLOBAL_QUOTA_EXCEEDED:['超过全站剩余铸造份数。','Insufficient shares remain.'],
   SELF_REFERRAL:['邀请人不能是自己或同一钱包的身份。','The inviter cannot be you or another identity of the same wallet.'],
   INVALID_REFERRAL:['邀请来源无效，请在邀请奖励页修改后再继续。','Invalid referral. Update it in Rewards before continuing.'],
   MINT_CLOSED:['Mint 当前未开放，请刷新状态。','Mint is not currently open. Refresh the state.'],
   SOLD_OUT_OR_RETIRED:['Mint 已结束或停用。','Mint is sold out or retired.']
  };
  if(map[c])return t(...map[c]);if(e?.providerError?.message)return e.providerError.message;if(c==='SESSION_RESTARTED')return t('连接服务已重启，请重新扫码。之前的交易仍可恢复核验。','The connection service restarted. Scan again; previous transactions remain recoverable.');if(c==='REQUEST_EXPIRED_BEFORE_SUBMISSION')return t('已核实请求过期前未提交，可重新核对铸造。','Verified that this request expired before submission. You can request a new review.');if(c.startsWith('PHASE_BOUNDARY:'))return t('本次跨过开池门槛，请减少份数，开池后再重新报价。','This crosses pool opening. Reduce shares and re-quote after opening.');
  if(connection)return t('扫码连接未完成，没有发起新的付款。请重新生成二维码。','QR connection incomplete. No new payment was initiated. Generate a new QR code.')+' '+t('错误码：','Code: ')+String(c).replace(/[^A-Za-z0-9_:-]/g,'_').slice(0,80);
  return flow.pending?t('交易结果尚不明确。请检查钱包记录并恢复核验，不要重复付款。','The transaction result is uncertain. Check wallet history and resume verification; do not pay again.'):t('请求未完成，请刷新后重试；尚未确认铸造成功。','Request incomplete. Refresh and retry; Mint success is not confirmed.');
 };
 async function verifyRelease(){
  const r=await fetch('/agent.json',{cache:'no-store'});if(!r.ok)throw Error('RELEASE_UNAVAILABLE');const c=await r.json();
  if(c.chainId!==56||c.executionReady!==true||c.mintEnabled!==true||c.mintContract?.toLowerCase()!==DEPLOYMENT.launch.toLowerCase()||c.tokenContract?.toLowerCase()!==DEPLOYMENT.token.toLowerCase()||Object.entries(DEPLOYMENT.codeHashes).some(([k,h])=>c.codeHashes?.[k]!==h))throw Error('RELEASE_UNAVAILABLE');
 }
 function render(){
  panel.dataset.connected=String(!!flow.wallet);panel.setAttribute('aria-busy',String(busy));
  $('mint-wallet-state').textContent=connectionStage|| (flow.wallet?t('钱包已连接','Wallet connected'):t('Binance Agentic Wallet','Binance Agentic Wallet'));
  $('mint-wallet-connect').textContent=busy?t('处理中…','Working…'):flow.wallet?t('断开','Disconnect'):t('扫码连接 ↗','Scan to connect ↗');$('mint-wallet-connect').disabled=busy;
  $('mint-wallet-address').textContent=flow.wallet||t('用币安 App 扫码，连接持有官方 .ai 身份的 Agentic Wallet。','Scan with the Binance App to connect the Agentic Wallet holding your official .ai identity.');
  $('mint-wallet-identity').textContent=identity?.name||t('连接后读取身份与额度','Read identity and quota after connecting');
  $('mint-wallet-balance').textContent=balance===null?'BNB Chain · — BNB':formatEther(balance)+' BNB';
  $('mint-wallet-feedback').textContent=feedback;$('mint-wallet-refresh').hidden=!flow.wallet;$('mint-wallet-refresh').textContent=t('刷新身份与余额 ↻','Refresh identity & balance ↻');$('mint-wallet-refresh').disabled=busy;
  if(headerWallet){headerWallet.disabled=busy;headerWallet.classList.add('wallet-header-connect');headerWallet.dataset.noTranslate='';headerWallet.setAttribute('aria-label',flow.wallet?t('更换参与钱包','Change participation wallet'):t('使用 Agentic Wallet','Use Agentic Wallet'));headerWallet.querySelector('.header-agent-label').textContent=flow.wallet?flow.wallet.slice(0,6)+'…'+flow.wallet.slice(-4):t('Agentic Wallet','Agentic Wallet');}
  $('mint-last-transaction').hidden=!receipt?.hash;if(receipt?.hash){$('mint-last-transaction').href='https://bscscan.com/tx/'+receipt.hash;$('mint-last-transaction').textContent=t('查看本次链上交易 ↗','View this on-chain transaction ↗');}
  const label=flow.sending?t('请在钱包确认…','Confirm in your wallet…'):busy?t('正在核对…','Checking…'):flow.pending?t('核验上次铸造','Verify previous Mint'):flow.wallet?t('核对并铸造 ECHO','Review & mint ECHO'):t('扫码连接并铸造 ECHO','Connect & mint ECHO');
  primary.textContent=label;primary.disabled=busy;secondary.textContent=t('其他钱包方式','Other wallet options');
  const mobile=$('mobile-agent');if(!isInviteModule()){mobile.textContent=label;mobile.disabled=busy;}else mobile.disabled=false;
  pending.hidden=!flow.pending;
  $('wallet-pending-title').textContent=t('上次铸造待核验','Previous Mint awaits verification');
  $('wallet-pending-text').textContent=flow.pending?.hash?t('已取得交易哈希；确认回执和同笔到账前，不重复提交。','Transaction hash received. Verify receipt and matching delivery before another submission.'):t('钱包尚未返回可核验结果。请先检查原钱包的交易记录。','No verifiable result returned yet. Check the original wallet history first.');
  const hash=flow.pending?.hash;$('wallet-pending-link').hidden=!hash;if(hash){$('wallet-pending-link').href='https://bscscan.com/tx/'+hash;$('wallet-pending-link').textContent=t('在 BscScan 核对 ↗','Check on BscScan ↗');}
  for(const id of ['wallet-recovery-label','wallet-recovery-hash'])$(id).hidden=!!hash||!!flow.pending?.unreadable;
  $('wallet-recovery-label').textContent=t('原钱包中的交易哈希','Transaction hash from the original wallet');
  $('wallet-pending-check').textContent=t('恢复核验 ↻','Resume verification ↻');$('wallet-pending-check').disabled=busy||!!flow.pending?.unreadable;
  $('wallet-clear-details').hidden=!!hash;$('wallet-clear-summary').textContent=t('钱包确认未提交？','Wallet confirms it was never submitted?');
  $('wallet-no-send-text').textContent=t('我已检查钱包，确认这笔交易没有提交或成功。清除不会取消链上交易。','I checked my wallet: this transaction was neither submitted nor successful. Clearing does not cancel an on-chain transaction.');
  $('wallet-clear-pending').textContent=t('清除这条本地待处理记录','Clear this local pending record');$('wallet-clear-pending').disabled=busy;
 }
 function closeDialog(){++connectEpoch;clearInterval(qrClock);const c=connectingTransport;connectingTransport=null;if(c)void c.disconnect().catch(()=>{});dialog.close();flow.preview=null;}
 function shell(title){dialog.replaceChildren();const top=document.createElement('div');top.className='wallet-dialog-top';const h=document.createElement('h2');h.id='wallet-dialog-title';h.textContent=title;const close=document.createElement('button');close.type='button';close.className='text-button';close.textContent=t('关闭 ×','Close ×');close.onclick=closeDialog;top.append(h,close);dialog.append(top);if(!dialog.open)dialog.showModal();}
 function note(text){const p=document.createElement('p');p.textContent=text;dialog.append(p);return p;}
 function button(label,action,primary=false){const b=document.createElement('button');b.type='button';b.className='button '+(primary?'button-ink':'button-ghost');b.textContent=label;b.onclick=action;dialog.append(b);return b;}
 function openAgentic(resumeReview=true){
  if(busy)return;shell(t('连接 Binance Agentic Wallet','Connect Binance Agentic Wallet'));
  note(t('扫码将把你的 Agentic Wallet 会话交给 ECHO 服务。本页仅开放 ECHO 铸造；连接不会付款，每笔 Mint 都需要你另行确认。币安 App 中的权限与额度仍适用。','Scanning delegates your Agentic Wallet session to the ECHO service. This page offers ECHO Mint only. Connecting does not pay; each Mint requires your separate confirmation. Your Binance App permissions and limits still apply.'));
  const more=document.createElement('details'),summary=document.createElement('summary'),risk=document.createElement('p'),link=document.createElement('a');summary.textContent=t('查看会话授权说明','Session authorization details');risk.textContent=t('本站的 Mint 限制由 ECHO 服务执行，不代表币安将会话权限限制为只能 Mint。请只连接你信任的服务，可在本站断开或在币安管理会话。','ECHO enforces the Mint-only service routes; this does not mean Binance limits the underlying session to Mint. Connect only to services you trust, and disconnect here or manage the session in Binance.');link.href='https://www.binance.com/en/support/faq/detail/3ff00e2d488a41c4aaa4aabb6fc36763';link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('币安官方会话说明 ↗','Binance session guidance ↗');more.append(summary,risk,link);dialog.append(more);
  const label=document.createElement('label'),ack=document.createElement('input'),words=document.createElement('span');label.className='wallet-ack';ack.type='checkbox';words.textContent=t('我已阅读并同意本次会话连接。','I have read and agree to this session connection.');label.append(ack,words);dialog.append(label);const start=button(t('同意并生成二维码','Agree & generate QR'),()=>beginAgentic(resumeReview),true);start.disabled=true;ack.onchange=()=>start.disabled=!ack.checked;
  button(t('使用自己的 Agent','Use my own Agent'),()=>{closeDialog();showAgent();});
 }
 async function beginAgentic(resumeReview){
  if(busy)return;busy=true;connectionStage=t('等待扫码确认…','Waiting for QR confirmation…');render();const attempt=++connectEpoch;shell(t('使用币安 App 扫码','Scan with the Binance App'));
  const status=note(t('正在生成官方二维码…','Generating the official QR code…')),area=document.createElement('div');area.className='echo-agentic-qr';dialog.append(area);const cancel=button(t('取消连接','Cancel connection'),closeDialog);let previous='';
  const transport=new AgenticWalletTransport({onView:async s=>{
   if(s.state==='TRANSACTION'){feedback=s.operation?.status==='PENDING_CONFIRMATION'?t('请在币安 App 中确认本次铸造；不要重复提交。','Confirm this Mint in the Binance App; do not submit again.'):t('正在等待交易结果，可在 App 中查看。','Waiting for the transaction result. Check the App.');render();return;}
   if(attempt!==connectEpoch||!dialog.open)return;
   if(s.state==='QUEUED'){status.textContent=t('正在生成官方二维码…','Generating the official QR code…');return;}
   if(s.state==='PENDING'&&s.urlForWeb&&s.urlForWeb!==previous){try{officialQrView(s);previous=s.urlForWeb;const {qrDataUrl}=await import('./vendor/agentic-qr.mjs'),src=await qrDataUrl(s.urlForWeb);if(attempt!==connectEpoch||!dialog.open)return;area.replaceChildren();const img=document.createElement('img'),pair=document.createElement('p'),timer=document.createElement('p'),link=document.createElement('a');img.src=src;img.width=288;img.height=288;img.alt=t('币安官方 Agentic Wallet 本次连接二维码','Official Binance Agentic Wallet QR for this connection');pair.className='echo-agentic-pair';pair.textContent=t('配对码：','Pairing code: ')+s.pairingCode;timer.className='help';link.href=s.urlForWeb;link.target='_blank';link.rel='noopener noreferrer';link.className='button button-ghost';link.textContent=t('在手机上打开币安 ↗','Open Binance on this phone ↗');area.append(img,pair,timer,link);const tick=()=>{const left=Math.max(0,Math.ceil((s.expiresAt-Date.now())/1000));timer.textContent=t('有效期 ','Expires in ')+Math.floor(left/60)+':'+String(left%60).padStart(2,'0');};clearInterval(qrClock);tick();qrClock=setInterval(tick,1000);status.textContent=t('用币安 App 扫码，核对配对码后确认连接。','Scan with the Binance App, compare the pairing code, then approve the connection.');}catch{status.textContent=t('二维码未能显示，请取消后重试。','QR display failed. Cancel and retry.');}}
  }});connectingTransport=transport;let ready=false;
  try{await flow.connect(transport,{timeoutMs:330000});if(attempt!==connectEpoch){await flow.disconnect();return;}activeKind='agentic';connectingTransport=null;clearInterval(qrClock);closeDialog();await loadAccount();ready=!!identity;}
  catch(e){const connected=flow.wallet&&flow.transport===transport;feedback=errorMessage(e,{connection:!connected});if(!connected)await transport.disconnect().catch(()=>{});status.textContent=feedback;cancel.textContent=t('关闭','Close');if(!/risk control|restricted|blocked|风控|禁止|拦截/i.test(e.providerError?.message??''))button(t('重新连接','Try again'),()=>{closeDialog();openAgentic(resumeReview);});}
  finally{connectingTransport=null;busy=false;connectionStage=null;clearInterval(qrClock);render();}
  if(ready&&resumeReview)await review();
 }
 async function loadAccount(){
  const request=++epoch,account=await flow.account();if(request!==epoch)return;
  balance=account.balance;identity=account.name?{name:account.name}:null;
  if(!account.name){feedback=errorMessage(Error('NO_OFFICIAL_IDENTITY'));render();return;}
  await onIdentity(account.name);if(request!==epoch)return;feedback=t('身份已核验。选择份数后查看本次费用。','Identity verified. Choose shares to review the cost.');render();
 }
 async function connectWallet(kind,resumeReview=false){
  let reviewEpoch=null;
  if(busy)return;busy=true;connectionStage=t('等待钱包连接…','Waiting for wallet connection…');feedback=t('请在币安 App 扫码并确认连接，连接不会发起付款。','Scan and approve the connection in the Binance App. Connecting does not initiate payment.');render();const attempt=++connectEpoch;
  // The SDK owns its QR modal. A native top-layer dialog would hide it.
  dialog.close();
  try{const {createMintWallet}=await import('./vendor/binance-wallet-mint.mjs');const transport=await createMintWallet({language:getLanguage(),kind});if(attempt!==connectEpoch)return;
   await flow.connect(transport);if(attempt!==connectEpoch){await flow.disconnect();return;}activeKind=kind;closeDialog();reviewEpoch=connectEpoch;await loadAccount();
  }catch(e){feedback=flow.wallet||e?.message==='WALLET_CONNECTION_TIMEOUT'?errorMessage(e):t('连接已取消或未完成。可以重新扫码，也可以使用浏览器钱包；没有发起铸造付款。','Connection cancelled or incomplete. Scan again or use a browser wallet. No Mint payment was initiated.');if(attempt===connectEpoch){openConnect();const p=note(feedback);p.setAttribute('role','status');}}
  finally{busy=false;connectionStage=null;render();}
  if(resumeReview&&flow.wallet&&identity&&reviewEpoch===connectEpoch)await review();
 }
 function openConnect(){
  shell(t('其他钱包方式','Other wallet options'));
  note(t('使用持有官方 .ai 身份的钱包。连接只读取账号；铸造会另行展示金额，由你在钱包确认。','Use the wallet that owns your official .ai identity. Connecting reads the account; Mint payment is reviewed and confirmed separately.'));
  button(t('币安钱包扫码 / App 连接','Binance Wallet QR / App'),()=>connectWallet('binance'),true);
  button(t('使用当前浏览器钱包','Use browser wallet'),()=>connectWallet('browser'));
  note(t('这里连接 Binance Wallet。它与 Agentic Wallet 可能是不同地址；请核对持有身份的钱包。Agentic Wallet 也可继续使用下方 Agent 指令。','This connects Binance Wallet, which may differ from your Agentic Wallet address. Check the identity owner. Agentic Wallet can also use the Agent instructions below.'));
  button(t('交给我的 Agent ↗','Use my Agent ↗'),()=>{closeDialog();showAgent();});
 }
 async function review(){
  if(busy)return;if(flow.pending){pending.scrollIntoView({block:'center'});return;}if(!flow.wallet){openAgentic(true);return;}
  busy=true;feedback=t('核验身份、链上报价和交易模拟…','Verifying identity, chain quote and simulation…');receipt=null;render();
  try{await verifyRelease();const p=await flow.review({shares:getShares(),referrer:getReferrer()});onQuote(p.prepared.quote);
   shell(t('核对本次铸造','Review this Mint'));const q=p.prepared.quote,dl=document.createElement('dl');dl.className='quote-details';
   for(const [label,value]of [[t('官方身份','Official identity'),q.identity.name],[t('份数 / 到账','Shares / delivery'),q.shares+' / '+(q.shares*1000).toLocaleString()+' ECHO'],[t('免费 / 付费份数','Free / paid shares'),q.free+' / '+q.paid],[t('铸造付款','Mint payment'),formatEther(q.cost)+' BNB'],[p.prepared.official?t('预估 Gas','Estimated gas'):t('本次请求 Gas 上限','Requested gas ceiling'),formatEther(p.prepared.maximumGasWei)+' BNB'],[p.prepared.official?t('预计合计','Estimated total'):t('合计最多请求','Maximum requested total'),formatEther(BigInt(q.cost)+BigInt(p.prepared.maximumGasWei))+' BNB'],[t('邀请来源','Referrer'),q.referrer.name||t('无','None')],[t('付款钱包','Paying wallet'),p.wallet],[t('目标合约 · BNB Chain 56','Contract · BNB Chain 56'),DEPLOYMENT.launch]]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);}dialog.append(dl);
   if(p.prepared.official){const o=p.prepared.official,risks=o.risks??{},items=[...(risks.riskDetails??[]),...Object.entries(risks.addresses??{}).flatMap(([address,a])=>(a.riskDetails??[]).map(r=>({...r,title:address+' · '+r.title})))];for(const r of items){const warning=note([r.title,r.description].filter(Boolean).join(' — '));warning.className='notice warning';}const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=t('币安官方预演与风险详情','Official Binance simulation & risks');pre.textContent=JSON.stringify(o,null,2);details.append(summary,pre);dialog.append(details);note(t('Gas 是估算，不是币安执行费用的硬上限。官方预演已完成；请核对解析、风险和权限变更后确认。','Gas is an estimate, not a hard Binance execution fee cap. The official preview is ready; review its parsing, risks and permission changes before confirming.'));}
   note(p.prepared.official?t('预览最多有效 90 秒。确认后可能直接提交交易；币安要求额外确认时，请在 App 中处理。','This preview lasts at most 90 seconds. Confirmation may submit directly; complete any additional approval required by Binance in the App.'):t('本次预览最多有效 90 秒。确认后由钱包展示最终交易；钱包中的金额与费用应与此一致。','This review lasts at most 90 seconds. Your wallet shows the final transaction after confirmation; compare its amount and fees with this review.'));
   button(p.prepared.official?t('确认支付 '+formatEther(q.cost)+' BNB + Gas','Confirm '+formatEther(q.cost)+' BNB + gas'):t('确认，前往钱包签名','Confirm & continue to wallet'),()=>submit(p.id),true);button(t('返回修改','Back to edit'),closeDialog);
   feedback=t('预览已准备好，尚未提交交易。','Review ready. No transaction submitted.');
  }catch(e){feedback=errorMessage(e);}finally{busy=false;render();}
 }
 async function submit(id){
  if(busy)return;busy=true;render();
  try{await verifyRelease();const hash=await flow.submit(id);dialog.close();feedback=t('已提交，正在核验到账；请勿重复付款。','Submitted. Checking delivery; do not pay again.');render();await checkPending();}
  catch(e){feedback=errorMessage(e);dialog.close();}finally{busy=false;render();}
 }
 async function checkPending(){
  clearTimeout(poll);try{let r=$('wallet-recovery-hash').value.trim();if(!flow.pending?.hash&&activeKind==='agentic'&&flow.transport?.pendingHash){if(r)await flow.transport.recoverHash(flow.pending.agenticPreviewId,r);else r=await flow.transport.pendingHash(flow.pending.tx,flow.pending.agenticPreviewId);}const result=flow.pending?.hash?await flow.check():await flow.recover(r);receipt=result;
   feedback=result.status==='confirmed'&&result.confirmations>=2?t('铸造成功，已核验同笔 ECHO 到账。','Mint succeeded. Matching ECHO delivery verified.'):result.status==='failed'?t('交易失败，铸造未完成；Gas 以链上记录为准。','Transaction failed; Mint incomplete. Refer to the chain for gas.'):t('交易待确认，尚不能确认到账。','Transaction pending. Delivery is not confirmed.');
   if(flow.pending?.hash)poll=setTimeout(async()=>{if(document.hidden)return;await checkPending();},5000);
   if(!flow.pending&&flow.wallet){const outcome=feedback;await loadAccount();feedback=outcome;}
  }catch(e){if(e.notSubmitted===true&&flow.pending&&!flow.pending.hash)flow.clearUnsubmitted(true);feedback=errorMessage(e);}render();
 }
 secondary.removeAttribute('data-action');secondary.onclick=openConnect;
 primary.onclick=review;$('mint-wallet-connect').onclick=async()=>{if(!flow.wallet){openAgentic(false);return;}if(busy)return;busy=true;try{++epoch;await flow.disconnect();feedback=t('钱包已断开。','Wallet disconnected.');identity=null;balance=null;}finally{busy=false;render();}};
 if(headerWallet)headerWallet.onclick=async()=>{if(busy)return;if(flow.wallet){openConnect();return;}openAgentic(false);};
 $('mint-wallet-refresh').onclick=async()=>{if(busy)return;busy=true;try{await loadAccount();}catch(e){feedback=errorMessage(e);}finally{busy=false;render();}};
 $('wallet-pending-check').onclick=async()=>{if(busy)return;busy=true;render();try{await checkPending();}finally{busy=false;render();}};
 $('wallet-clear-pending').onclick=()=>{try{flow.clearUnsubmitted($('wallet-no-send-ack').checked);$('wallet-no-send-ack').checked=false;feedback=t('已清除本地待处理记录。','Local pending record cleared.');}catch{feedback=t('请先检查原钱包并勾选确认。','Check the original wallet and tick the acknowledgement first.');}render();};
 dialog.addEventListener('cancel',()=>{closeDialog();});dialog.addEventListener('close',()=>{clearInterval(qrClock);if(connectingTransport){const c=connectingTransport;connectingTransport=null;void c.disconnect().catch(()=>{});}flow.preview=null;});
 document.addEventListener('echo:language',()=>{if(dialog.open)closeDialog();const phrase=phrases.get(feedback);if(phrase)feedback=t(...phrase);render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&flow.pending?.hash&&!busy)checkPending();});
 window.addEventListener('pagehide',()=>{clearTimeout(poll);flow.stopWatch?.();});
 render();
 void(async()=>{try{const transport=new AgenticWalletTransport(),s=await transport.api('status');if(s.state==='CONNECTED'&&!flow.wallet&&!busy){activeKind='agentic';await flow.connect(transport);await loadAccount();}}catch{}})();
 return {render,main:review,invalidate:()=>{flow.invalidate();if(dialog.open)closeDialog();},connected:()=>!!flow.wallet};
}
