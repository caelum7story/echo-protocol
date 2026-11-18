// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
contract MockIdentity {
 mapping(uint256=>address) public ownerOf;
 function issue(address to,uint256 id) external {require(ownerOf[id]==address(0));ownerOf[id]=to;}
 function issueBatch(address to,uint256 start,uint256 count) external {for(uint256 i;i<count;i++){require(ownerOf[start+i]==address(0));ownerOf[start+i]=to;}}
 function transfer(uint256 id,address to) external {require(ownerOf[id]==msg.sender);ownerOf[id]=to;}
}
contract MockWBNB is ERC20 {
 constructor()ERC20("Wrapped BNB","WBNB"){}
 receive()external payable{_mint(msg.sender,msg.value);}
 function deposit()external payable{_mint(msg.sender,msg.value);}
 function withdraw(uint256 amount)external{_burn(msg.sender,amount);(bool ok,)=msg.sender.call{value:amount}("");require(ok);}
}
contract MockPair is ERC20 {
 using SafeERC20 for IERC20;
 address public immutable factory;address public immutable token0;address public immutable token1;
 uint112 private r0;uint112 private r1;uint32 private stamp;uint256 public price0CumulativeLast;uint256 public price1CumulativeLast;
 bool private unlocked=true;
 constructor(address a,address b)ERC20("V2 local LP","LP"){factory=msg.sender;(token0,token1)=a<b?(a,b):(b,a);}
 modifier lock(){require(unlocked,"LOCKED");unlocked=false;_;unlocked=true;}
 function getReserves()external view returns(uint112,uint112,uint32){return(r0,r1,stamp);}
 function _update()private{
  uint256 b0=IERC20(token0).balanceOf(address(this));uint256 b1=IERC20(token1).balanceOf(address(this));require(b0<=type(uint112).max&&b1<=type(uint112).max);
  uint32 now32=uint32(block.timestamp);uint32 elapsed;unchecked{elapsed=now32-stamp;}
  if(elapsed!=0&&r0!=0&&r1!=0){unchecked{price0CumulativeLast+=(uint256(r1)<<112)/r0*elapsed;price1CumulativeLast+=(uint256(r0)<<112)/r1*elapsed;}}
  r0=uint112(b0);r1=uint112(b1);stamp=now32;
 }
 function mint(address to)external lock returns(uint256 liquidity){
  uint256 a0=IERC20(token0).balanceOf(address(this))-r0;uint256 a1=IERC20(token1).balanceOf(address(this))-r1;
  if(totalSupply()==0){liquidity=Math.sqrt(a0*a1)-1000;_mint(address(0xdEaD),1000);}else{liquidity=Math.min(a0*totalSupply()/r0,a1*totalSupply()/r1);}
  require(liquidity!=0);_mint(to,liquidity);_update();
 }
 function swap(uint256 out0,uint256 out1,address to,bytes calldata)external lock {
  require(out0!=0||out1!=0);require(out0<r0&&out1<r1);if(out0!=0)IERC20(token0).safeTransfer(to,out0);if(out1!=0)IERC20(token1).safeTransfer(to,out1);
  uint256 b0=IERC20(token0).balanceOf(address(this));uint256 b1=IERC20(token1).balanceOf(address(this));uint256 in0=b0>r0-out0?b0-(r0-out0):0;uint256 in1=b1>r1-out1?b1-(r1-out1):0;
  require(in0!=0||in1!=0);require((b0*10000-in0*25)*(b1*10000-in1*25)>=uint256(r0)*r1*10000**2,"K");_update();
 }
 function sync()external lock{_update();}
 function skim(address to)external lock {IERC20(token0).safeTransfer(to,IERC20(token0).balanceOf(address(this))-r0);IERC20(token1).safeTransfer(to,IERC20(token1).balanceOf(address(this))-r1);}
}
contract MockFactory {
 mapping(address=>mapping(address=>address))public getPair;
 function createPair(address a,address b)external returns(address p){require(a!=b&&getPair[a][b]==address(0));p=address(new MockPair(a,b));getPair[a][b]=p;getPair[b][a]=p;}
}
contract MockRouter {
 using SafeERC20 for IERC20;
 address public immutable factory;address public immutable WETH;bool public fail;
 constructor(address f,address w){factory=f;WETH=w;}
 receive()external payable{require(msg.sender==WETH);}
 function setFail(bool v)external{fail=v;}
 function getAmountsOut(uint256 amount,address[] calldata route)external view returns(uint256[]memory amounts){amounts=new uint256[](2);amounts[0]=amount;MockPair p=MockPair(MockFactory(factory).getPair(route[0],route[1]));(uint112 r0,uint112 r1,)=p.getReserves();(uint256 rin,uint256 rout)=route[0]==p.token0()?(r0,r1):(r1,r0);amounts[1]=amount*9975*rout/(rin*10000+amount*9975);}
 function _swap(address input,address output,address to)private returns(uint256 amountOut){
  MockPair p=MockPair(MockFactory(factory).getPair(input,output));(uint112 r0,uint112 r1,)=p.getReserves();bool zero=input==p.token0();(uint256 rin,uint256 rout)=zero?(r0,r1):(r1,r0);
  uint256 actualIn=IERC20(input).balanceOf(address(p))-rin;amountOut=actualIn*9975*rout/(rin*10000+actualIn*9975);p.swap(zero?0:amountOut,zero?amountOut:0,to,"");
 }
 function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amount,uint256 minimum,address[]calldata route,address to,uint256 deadline)external{
  require(!fail&&deadline>=block.timestamp);require(route.length==2&&route[1]==WETH);
  IERC20(route[0]).safeTransferFrom(msg.sender,MockFactory(factory).getPair(route[0],WETH),amount);uint256 out=_swap(route[0],WETH,address(this));require(out>=minimum);MockWBNB(payable(WETH)).withdraw(out);(bool ok,)=to.call{value:out}("");require(ok);
 }
 function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 minimum,address[]calldata route,address to,uint256 deadline)external payable{
  require(!fail&&deadline>=block.timestamp&&route.length==2&&route[0]==WETH);uint256 beforeBalance=IERC20(route[1]).balanceOf(to);
  MockWBNB(payable(WETH)).deposit{value:msg.value}();IERC20(WETH).safeTransfer(MockFactory(factory).getPair(WETH,route[1]),msg.value);_swap(WETH,route[1],to);require(IERC20(route[1]).balanceOf(to)-beforeBalance>=minimum);
 }
}
contract Receiver {
 bool public reject;address public target;bytes public data;bool public attempted;bool public reentered;
 function setReject(bool v)external{reject=v;}function setAttack(address t,bytes calldata d)external{target=t;data=d;}
 receive()external payable{require(!reject);if(target!=address(0)){attempted=true;(reentered,)=target.call(data);}}
}
contract MockAsset is ERC20{constructor()ERC20("Test asset","TST"){}function mint(address to,uint256 v)external{_mint(to,v);}}
