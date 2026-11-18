import {DEMO, normalizeIdentity, quoteMint, quoteRecordedMint, identityAllowance} from './model.mjs';

export const REFERRAL_STORAGE_KEY = 'echo.referral.preview.v1';
const MAX_BINDINGS = DEMO.totalShares;
export function createReferralState() {
  return {version:2, pendingReferrer:null, bindings:[], orders:[], nextOrder:1};
}

// Public names are an unverified UI hint. Production attribution must use a
// verified identity ID and the referral written into the confirmed transaction.
export function parseReferralLink(href) {
  try {
    const url = new URL(href);
    const values = url.searchParams.getAll('ref');
    if (!values.length) return {referrer:null, invalid:false};
    if (values.length !== 1 || !values[0] || values[0].length > 67) throw new Error();
    return {referrer:normalizeIdentity(values[0]), invalid:false};
  } catch {
    return {referrer:null, invalid:true};
  }
}

export function buildReferralLink(href, identity) {
  const source = new URL(href);
  if (!['https:', 'http:'].includes(source.protocol)) throw new Error('分享地址必须使用 HTTP 或 HTTPS。');
  // Never propagate authentication parameters, wallet data or old invite IDs.
  const url = new URL(source.pathname, source.origin);
  url.searchParams.set('ref', normalizeIdentity(identity));
  url.hash = 'mint';
  return url.href;
}

export function hydrateReferralState(raw) {
  if (!raw) return createReferralState();
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (![1,2].includes(value.version) || !Array.isArray(value.bindings) || !Array.isArray(value.orders)
      || value.bindings.length > MAX_BINDINGS || value.orders.length > 50
      || !Number.isSafeInteger(value.nextOrder) || value.nextOrder < 1) {
    throw new Error('本机演示记录格式无效。');
  }
  const normalizeRef = name => name === null ? null : normalizeIdentity(name);
  const bindings = value.bindings.map(binding => ({
    identity:normalizeIdentity(binding.identity),
    referrer:normalizeRef(binding.referrer),
    orderId:String(binding.orderId),
    mintedQuantity:value.version===2?binding.mintedQuantity:0,
    freeSharesMinted:value.version===2?binding.freeSharesMinted:0
  }));
  if (new Set(bindings.map(b=>b.identity)).size !== bindings.length
      || bindings.some(b=>b.identity === b.referrer || !/^DEMO-\d+$/.test(b.orderId))) {
    throw new Error('本机演示归属无效。');
  }
  const orders = value.orders.map(order => {
    const identity = normalizeIdentity(order.identity), referrer = normalizeRef(order.referrer);
    const q = quoteRecordedMint(order);
    const binding = bindings.find(b=>b.identity === identity);
    if (!binding || !/^DEMO-\d+$/.test(order.id) || String(q.costWei) !== order.costWei
        || binding.referrer !== referrer || typeof order.firstOrder !== 'boolean'
        || (order.firstOrder && binding.orderId !== order.id)) throw new Error('本机演示订单无效。');
    return {id:order.id, identity, referrer, quantity:q.quantity, costWei:String(q.costWei), mintedBefore:q.mintedBefore,
      ...([2,3].includes(order.pricingVersion)?{pricingVersion:order.pricingVersion,identityMinted:q.identityMinted,successfulInvites:q.successfulInvites,freeClaimsUsed:q.freeClaimsUsed}:{}),
      firstOrder:order.firstOrder, attributionEligible:order.firstOrder && !!referrer};
  });
  for(const binding of bindings){
    const recent=orders.filter(o=>o.identity===binding.identity);
    const minted=recent.reduce((sum,o)=>sum+o.quantity,0),free=recent.reduce((sum,o)=>sum+quoteRecordedMint(o).freeQuantity,0);
    if(value.version===1){
      // A truncated legacy log cannot reconstruct prior consumption. Reserve
      // at least the base limit rather than invent unused quota or a new free mint.
      binding.mintedQuantity=recent.some(o=>o.id===binding.orderId)?minted:Math.max(DEMO.baseIdentityLimit,minted);
      binding.freeSharesMinted=free;
    }
    if(!Number.isSafeInteger(binding.mintedQuantity)||binding.mintedQuantity<Math.max(1,minted)||binding.mintedQuantity>DEMO.totalShares
      ||!Number.isSafeInteger(binding.freeSharesMinted)||binding.freeSharesMinted<free||binding.freeSharesMinted>binding.mintedQuantity)throw new Error('本机演示记录格式无效。');
  }
  const state={version:2,pendingReferrer:normalizeRef(value.pendingReferrer),bindings,orders,nextOrder:value.nextOrder};
  if(mintTotals(state).minted>DEMO.totalShares)throw new Error('本机演示记录格式无效。');
  return state;
}

export function mintTotals(state){
  return {minted:state.bindings.reduce((sum,b)=>sum+b.mintedQuantity,0),freeClaimsUsed:Math.min(DEMO.freeShares,state.bindings.reduce((sum,b)=>sum+b.freeSharesMinted,0))};
}
export function mintEligibility(state,buyer){
  const identity=normalizeIdentity(buyer),binding=state.bindings.find(b=>b.identity===identity);
  return identityAllowance({identityMinted:binding?.mintedQuantity||0,successfulInvites:state.bindings.filter(b=>b.referrer===identity).length,freeClaimsUsed:mintTotals(state).freeClaimsUsed});
}

export function withPendingReferral(state, referrer) {
  return {...state, pendingReferrer:normalizeIdentity(referrer)};
}

export function resolveReferral(state, buyer) {
  const identity = normalizeIdentity(buyer);
  const bound = state.bindings.find(binding=>binding.identity === identity);
  if (bound) return {identity, referrer:bound.referrer, firstOrder:false, status:'locked', orderId:bound.orderId};
  if (state.pendingReferrer === identity) return {identity, referrer:null, firstOrder:true, status:'self'};
  return {identity, referrer:state.pendingReferrer, firstOrder:true, status:state.pendingReferrer ? 'pending' : 'none'};
}

export function recordReferralOrder(state, {identity, quantity, expectedReferrer, expectedQuote}) {
  const resolved = resolveReferral(state, identity), q = quoteMint(quantity,DEMO.totalShares-mintTotals(state).minted,mintEligibility(state,identity));
  if (expectedReferrer !== undefined && expectedReferrer !== resolved.referrer) {
    throw new Error('邀请来源已变化，请重新预览。');
  }
  if(expectedQuote&&['mintedBefore','identityMinted','successfulInvites','freeClaimsUsed','costWei'].some(key=>expectedQuote[key]!==q[key]))throw new Error('铸造额度或报价已变化，请重新预览。');
  if (resolved.firstOrder && state.bindings.length >= MAX_BINDINGS) throw new Error('本机演示身份数量已达上限。');
  const id = `DEMO-${String(state.nextOrder).padStart(4,'0')}`;
  const order = {id, identity:resolved.identity, quantity:q.quantity, costWei:String(q.costWei), mintedBefore:q.mintedBefore,
    pricingVersion:q.pricingVersion,identityMinted:q.identityMinted,successfulInvites:q.successfulInvites,freeClaimsUsed:q.freeClaimsUsed,
    referrer:resolved.referrer, firstOrder:resolved.firstOrder,
    attributionEligible:resolved.firstOrder && !!resolved.referrer};
  const bindings = resolved.firstOrder
    ? [...state.bindings, {identity:resolved.identity, referrer:resolved.referrer, orderId:id,mintedQuantity:q.quantity,freeSharesMinted:q.freeQuantity}]
    : state.bindings.map(b=>b.identity===resolved.identity?{...b,mintedQuantity:b.mintedQuantity+q.quantity,freeSharesMinted:b.freeSharesMinted+q.freeQuantity}:b);
  return {order, state:{...state, bindings, orders:[order,...state.orders].slice(0,50), nextOrder:state.nextOrder+1}};
}

export function referralAgentNote(state, identity) {
  const resolved = resolveReferral(state, identity);
  return `邀请来源（公开名称，未核验）：${resolved.referrer || '无'}\n` +
    `当前身份首单状态：${resolved.firstOrder ? '本机尚无模拟首单' : '已有模拟首单，原归属不变'}\n` +
    '请在体验评审中保留这个邀请来源。正式上线时，须核验身份并将邀请归属写入交易记录；当前没有真实订单、佣金或可执行合约。';
}
