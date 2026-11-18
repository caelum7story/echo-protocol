// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IV2Pair,IV2Factory,IV2Router} from "./Interfaces.sol";
/// @notice Fixed supply and tax schedule; no owner, proxy, mint authority or tax setter.
contract EchoToken is ERC20 {
 uint256 public constant TOTAL_SUPPLY=21_250_000 ether;
 uint256 public constant REWARD_RESERVE=4_250_000 ether;
 uint256 public constant BUY_TAX_BPS=100;
 uint256 public constant SELL_TAX_BPS=200;
 uint256 public constant OPENING_SELL_TAX_BPS=3000;
 uint256 public constant OPENING_TAX_SECONDS=1800;
 address public immutable controller;
 address public immutable factory;
 address public primaryPair;
 uint256 public openedAt;
 error Unauthorized(); error InvalidConfiguration(); error TradingNotOpen();
 constructor(address c,address rewardVault,address f) ERC20("ECHO","ECHO") {
  if(c==address(0)||rewardVault==address(0)||rewardVault==c||f.code.length==0)revert InvalidConfiguration();
  controller=c;factory=f;_mint(rewardVault,REWARD_RESERVE);_mint(c,TOTAL_SUPPLY-REWARD_RESERVE);
 }
 modifier onlyController(){if(msg.sender!=controller)revert Unauthorized();_;}
 function configurePair(address p) external onlyController {if(primaryPair!=address(0)||p.code.length==0)revert InvalidConfiguration();primaryPair=p;}
 function openTrading() external onlyController {if(openedAt!=0||primaryPair==address(0))revert InvalidConfiguration();openedAt=block.timestamp;}
 function burnLiquidityReserve(uint256 amount) external onlyController {_burn(controller,amount);}
 function isAmmPair(address a) public view returns(bool) {
  if(a==primaryPair&&a!=address(0))return true;
  if(a.code.length==0)return false;
  // Recognize canonical pairs on the immutable supported V2 factory. No arbitrary owner exemptions.
  (bool ok,bytes memory data)=a.staticcall{gas:6000}(abi.encodeWithSelector(IV2Pair.token0.selector));
  if(!ok||data.length!=32)return false;address t0=abi.decode(data,(address));
  (ok,data)=a.staticcall{gas:6000}(abi.encodeWithSelector(IV2Pair.token1.selector));
  if(!ok||data.length!=32)return false;address t1=abi.decode(data,(address));
  if(t0!=address(this)&&t1!=address(this))return false;
  return IV2Factory(factory).getPair(t0,t1)==a;
 }
 function currentSellTaxBps() public view returns(uint256){return openedAt!=0&&block.timestamp<openedAt+OPENING_TAX_SECONDS?OPENING_SELL_TAX_BPS:SELL_TAX_BPS;}
 function swapTax(address router,address recipient,uint256 amount,uint256 minOut,uint256 deadline) external onlyController {
  if(openedAt==0||amount==0||minOut==0||recipient==address(0)||IV2Router(router).factory()!=factory)revert InvalidConfiguration();
  address[] memory route=new address[](2);route[0]=address(this);route[1]=IV2Router(router).WETH();
  _approve(address(this),router,amount);
  IV2Router(router).swapExactTokensForETHSupportingFeeOnTransferTokens(amount,minOut,route,recipient,deadline);
  _approve(address(this),router,0);
 }
 function _update(address from,address to,uint256 value) internal override {
  if(from==address(0)||to==address(0)||from==controller||from==address(this)){super._update(from,to,value);return;}
  bool buy=isAmmPair(from);bool sell=isAmmPair(to);
  if((buy||sell)&&openedAt==0)revert TradingNotOpen();
  uint256 rate=buy?BUY_TAX_BPS:sell?currentSellTaxBps():0;
  uint256 fee=value*rate/10000;
  if(fee!=0)super._update(from,address(this),fee);
  super._update(from,to,value-fee);
 }
}
