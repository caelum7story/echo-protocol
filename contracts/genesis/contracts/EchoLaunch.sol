// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EmergencyControl} from "./EmergencyControl.sol";
import {EchoToken} from "./EchoToken.sol";
import {EchoOracle} from "./EchoOracle.sol";
import {IAgentID,IWBNB,IV2Factory,IV2Pair,IV2Router} from "./Interfaces.sol";
contract EchoLaunch is EmergencyControl {
 using SafeERC20 for IERC20;
 uint256 public constant TOTAL_SHARES=10000;
 uint256 public constant OPEN_AT=5000;
 uint256 public constant FREE_SHARES=1000;
 uint256 public constant TOKENS_PER_SHARE=1000 ether;
 uint256 public constant LP_TOKENS_PER_PAID_SHARE=700 ether;
 uint256 public constant BASE_ID_ALLOWANCE=10;
 uint256 public constant MAX_PER_TX=10;
 uint256 public constant MAX_TTL=600;
 uint256 public constant LIQUIDITY_BPS=7000;
 uint256 public constant MAX_TAX_SWAP_BPS=25;
 uint256 public constant TAX_SWAP_SLIPPAGE_BPS=300;
 uint256 public constant AUTO_TAX_THRESHOLD=100 ether;
 address public constant DEAD=0x000000000000000000000000000000000000dEaD;
 EchoToken public immutable token;
 EchoOracle public immutable oracle;
 IV2Pair public immutable pair;
 IV2Router public immutable router;
 IAgentID public immutable identity;
 bytes32 public immutable identityCodeHash;
 address public immutable wbnb;
 address payable public immutable treasury;
 address public immutable rewardVault;
 bool public mintEnabled;
 bool public opened;
 bool public closed;
 uint256 public totalMinted;
 uint256 public totalPaid;
 uint256 public freeClaimed;
 uint256 public pendingLiquidityBnb;
 uint256 public pendingLiquidityTokens;
 uint256 public pricingVersion=1;
 mapping(uint256=>uint256) public mintedById;
 mapping(uint256=>uint256) public successfulInvites;
 mapping(uint256=>uint256) public firstReferrer;
 struct Config {address admin;address treasury;address rewards;address rescueVault;address identity;bytes32 identityCodeHash;address router;}
 struct Pricing {uint256 preOpenPrice;uint256 premiumBps;uint256 maxDeviationBps;uint256 minBnbReserve;uint256 maxOracleAge;}
 Pricing public pricing=Pricing(0.002 ether,10000,1500,0.1 ether,900);
 struct Quote {uint256 cost;uint256 free;uint256 paid;uint256 tokens;uint256 unitPrice;uint256 version;bytes32 stateHash;}
 struct MintParams {uint256 identityId;uint256 shares;uint256 referrerId;bytes32 quoteHash;uint256 maxCost;uint256 deadline;}
 error Unavailable();error BadShares();error Ineligible();error InvalidQuote();error Expired();error InvalidPayment();error InvalidReferral();error PriceNotReady();error InvalidPricing();error LiquidityNotReady();
 error PhaseBoundary(uint256 remaining);
 event Minted(address indexed wallet,uint256 indexed identityId,uint256 indexed referrerId,uint256 shares,uint256 freeShares,uint256 cost,uint256 tokens);
 event PricingChanged(uint256 indexed version,Pricing pricing);
 event MintEnabled(bool enabled);
 event Opened(uint256 mintedShares,uint256 bnb,uint256 tokens,uint256 lp);
 event LiquidityAdded(uint256 bnb,uint256 tokens,uint256 lp);
 event UnusedLiquidityBurned(uint256 amount);
 event TaxProcessed(uint256 tokens,uint256 minBnbOut);
 event TaxProcessingDeferred();
 event MintClosed(bytes32 reason);
 constructor(Config memory c) EmergencyControl(c.admin,c.rescueVault){
  if(c.treasury==address(0)||c.rewards==address(0)||c.treasury==address(this)||c.rewards==address(this)||c.identity.code.length==0||c.identity.codehash!=c.identityCodeHash||c.router.code.length==0)revert InvalidConfiguration();
  identity=IAgentID(c.identity);identityCodeHash=c.identityCodeHash;router=IV2Router(c.router);treasury=payable(c.treasury);rewardVault=c.rewards;
  address f=router.factory();wbnb=router.WETH();if(f.code.length==0||wbnb.code.length==0)revert InvalidConfiguration();
  token=new EchoToken(address(this),c.rewards,f);
  address existing=IV2Factory(f).getPair(address(token),wbnb);
  pair=IV2Pair(existing==address(0)?IV2Factory(f).createPair(address(token),wbnb):existing);
  if(pair.factory()!=f||!((pair.token0()==address(token)&&pair.token1()==wbnb)||(pair.token1()==address(token)&&pair.token0()==wbnb)))revert InvalidConfiguration();
  token.configurePair(address(pair));
  oracle=new EchoOracle(address(pair),address(token),address(this));
 }
 receive() external payable {if(msg.sender!=wbnb&&msg.sender!=address(router))revert InvalidPayment();}
 function setMintEnabled(bool enabled) external onlyOwner nonReentrant {if(enabled&&(paused||retired||closed))revert Unavailable();mintEnabled=enabled;emit MintEnabled(enabled);}
 function setPricing(Pricing calldata p) external onlyOwner nonReentrant {
  if(retired||rescue.eta!=0||p.preOpenPrice<1e12||p.preOpenPrice>1 ether||p.premiumBps<10000||p.premiumBps>20000||p.maxDeviationBps<100||p.maxDeviationBps>2000||p.minBnbReserve<0.01 ether||p.minBnbReserve>1000 ether||p.maxOracleAge<300||p.maxOracleAge>3600)revert InvalidPricing();
  if(!opened){uint256 remaining=OPEN_AT-totalMinted;uint256 minimumPaid=remaining-Math.min(FREE_SHARES-freeClaimed,remaining);if(pendingLiquidityBnb+minimumPaid*(p.preOpenPrice*LIQUIDITY_BPS/10000)<p.minBnbReserve)revert InvalidPricing();}
  pricing=p;pricingVersion++;emit PricingChanged(pricingVersion,p);
 }
 function _ownerOf(uint256 id) private view returns(address a){
  if(address(identity).codehash!=identityCodeHash)revert Ineligible();try identity.ownerOf(id) returns(address who){a=who;}catch{revert Ineligible();}if(a==address(0))revert Ineligible();
 }
 function _market() private view returns(uint256 spot,uint256 twap,uint256 tokens){
  uint256 at;uint256 bnb;(spot,twap,at,bnb,tokens)=oracle.read();
  Pricing memory p=pricing;if(at>block.timestamp||block.timestamp-at>p.maxOracleAge||bnb<p.minBnbReserve||spot==0||twap==0)revert PriceNotReady();
  uint256 diff=spot>twap?spot-twap:twap-spot;if(Math.mulDiv(diff,10000,twap)>p.maxDeviationBps)revert PriceNotReady();
 }
 function quote(address wallet,uint256 id,uint256 shares,uint256 referrerId) public view returns(Quote memory q){
  if(!mintEnabled||paused||closed||retired)revert Unavailable();
  if(shares==0||shares>MAX_PER_TX||totalMinted+shares>TOTAL_SHARES)revert BadShares();
  if(!opened&&totalMinted+shares>OPEN_AT)revert PhaseBoundary(OPEN_AT-totalMinted);
  if(_ownerOf(id)!=wallet||mintedById[id]+shares>BASE_ID_ALLOWANCE+successfulInvites[id])revert Ineligible();
  if(mintedById[id]==0){if(referrerId!=0&&(referrerId==id||_ownerOf(referrerId)==wallet))revert InvalidReferral();}
  else if(referrerId!=firstReferrer[id])revert InvalidReferral();
  q.free=mintedById[id]==0&&freeClaimed<FREE_SHARES?1:0;q.paid=shares-q.free;q.tokens=shares*TOKENS_PER_SHARE;
  q.unitPrice=pricing.preOpenPrice;
  if(opened&&q.paid!=0){(uint256 spot,uint256 twap,)=_market();q.unitPrice=Math.mulDiv(Math.max(spot,twap),TOKENS_PER_SHARE*pricing.premiumBps,1 ether*10000,Math.Rounding.Ceil);}
  q.cost=q.paid*q.unitPrice;q.version=pricingVersion;
  q.stateHash=keccak256(abi.encode(block.chainid,address(this),wallet,id,shares,referrerId,mintedById[id],successfulInvites[id],q.version,opened,q.cost,q.free));
 }
 function mint(MintParams calldata m) external payable nonReentrant {
  _deadline(m.deadline);Quote memory q=quote(msg.sender,m.identityId,m.shares,m.referrerId);
  if(q.stateHash!=m.quoteHash||q.cost>m.maxCost)revert InvalidQuote();if(msg.value!=q.cost)revert InvalidPayment();
  bool first=mintedById[m.identityId]==0;
  mintedById[m.identityId]+=m.shares;totalMinted+=m.shares;totalPaid+=q.paid;freeClaimed+=q.free;
  if(first){firstReferrer[m.identityId]=m.referrerId;if(m.referrerId!=0)successfulInvites[m.referrerId]++;}
  uint256 lpBnb=q.cost*LIQUIDITY_BPS/10000;pendingLiquidityBnb+=lpBnb;pendingLiquidityTokens+=q.paid*LP_TOKENS_PER_PAID_SHARE;
  IERC20(address(token)).safeTransfer(msg.sender,q.tokens);
  if(!opened&&totalMinted==OPEN_AT)_open();else if(opened&&q.paid!=0)_addLiquidity();
  if(totalMinted==TOTAL_SHARES){closed=true;uint256 unused=7_000_000 ether-totalPaid*LP_TOKENS_PER_PAID_SHARE;token.burnLiquidityReserve(unused);emit UnusedLiquidityBurned(unused);emit MintClosed(keccak256("SOLD_OUT"));}
  if(q.cost!=0){(bool ok,)=treasury.call{value:q.cost-lpBnb}("");if(!ok)revert NativeTransferFailed();}
  emit Minted(msg.sender,m.identityId,m.referrerId,m.shares,q.free,q.cost,q.tokens);
  // Outside all pair transfer hooks: failure cannot block Mint or a DEX swap.
  if(opened&&token.balanceOf(address(token))>=AUTO_TAX_THRESHOLD){try this.processAutomaticTaxes{gas:500000}(block.timestamp+60){}catch{emit TaxProcessingDeferred();}}
 }
 function openEarly() external onlyOwner nonReentrant {if(!mintEnabled||paused||retired||closed||opened)revert Unavailable();_open();}
 function _open() private {
  if(pendingLiquidityBnb<pricing.minBnbReserve||pendingLiquidityTokens==0)revert LiquidityNotReady();
  opened=true;pricingVersion++;token.openTrading();
  uint256 b=pendingLiquidityBnb;uint256 t=pendingLiquidityTokens;uint256 lp=_addLiquidity();oracle.start();emit Opened(totalMinted,b,t,lp);
 }
 function _addLiquidity() private returns(uint256 lp){
  uint256 b=pendingLiquidityBnb;uint256 t=pendingLiquidityTokens;if(b==0||t==0)revert LiquidityNotReady();pendingLiquidityBnb=0;pendingLiquidityTokens=0;
  IWBNB(wbnb).deposit{value:b}();if(!IWBNB(wbnb).transfer(address(pair),b))revert InvalidPayment();IERC20(address(token)).safeTransfer(address(pair),t);
  // Fixed 700 ECHO per paid share bounds reserve use. All 70% BNB enters the pool.
  // When market-linked quotes exceed spot, the excess BNB increases pool reserves.
  lp=pair.mint(DEAD);if(lp==0)revert LiquidityNotReady();emit LiquidityAdded(b,t,lp);
 }
 function _deadline(uint256 deadline) private view {if(deadline<block.timestamp||deadline>block.timestamp+MAX_TTL)revert Expired();}
 function taxQuote(uint256 requested) public view returns(uint256 amount,uint256 minimum){
  if(!opened||paused||retired)revert Unavailable();(uint256 spot,uint256 twap,uint256 reserve)=_market();
  amount=Math.min(requested,Math.min(token.balanceOf(address(token)),reserve*MAX_TAX_SWAP_BPS/10000));if(amount==0)return(0,0);
  address[] memory path=new address[](2);path[0]=address(token);path[1]=wbnb;
  uint256[] memory amounts=router.getAmountsOut(amount,path);
  uint256 fair=Math.mulDiv(amount,Math.min(spot,twap),1 ether)*9975/10000;
  minimum=Math.min(amounts[1],fair)*(10000-TAX_SWAP_SLIPPAGE_BPS)/10000;if(minimum==0)revert PriceNotReady();
 }
 function processTaxes(uint256 requested,uint256 minBnbOut,uint256 deadline) external nonReentrant {_deadline(deadline);_processTaxes(requested,minBnbOut,deadline);}
 function processAutomaticTaxes(uint256 deadline) external {if(msg.sender!=address(this))revert InvalidConfiguration();_processTaxes(type(uint256).max,0,deadline);}
 function _processTaxes(uint256 requested,uint256 minBnbOut,uint256 deadline) private {
  (uint256 amount,uint256 minimum)=taxQuote(requested);if(amount==0)return;
  minimum=Math.max(minimum,minBnbOut);token.swapTax(address(router),treasury,amount,minimum,deadline);emit TaxProcessed(amount,minimum);
 }
 function _beforeRescue(address asset,uint256 amount) internal override {
  if(asset==address(pair)||token.isAmmPair(asset))revert InvalidRescue();
  if(asset==address(0)){
   if(amount>address(this).balance)revert InvalidRescue();
   pendingLiquidityBnb=amount>=pendingLiquidityBnb?0:pendingLiquidityBnb-amount;
  }
  if(asset==wbnb||asset==address(token)){retired=true;closed=true;mintEnabled=false;emit MintClosed(keccak256("EMERGENCY_RESCUE"));}
 }
}
