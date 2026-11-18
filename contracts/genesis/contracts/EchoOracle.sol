// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IV2Pair} from "./Interfaces.sol";
/// @notice Permissionless 5-minute V2 cumulative-price observations, counterfactual through current timestamp.
contract EchoOracle {
 uint256 public constant WINDOW=300;
 uint256 public constant MAX_WINDOW=3600;
 uint256 private constant Q112=2**112;
 IV2Pair public immutable pair;bool public immutable tokenIs0;address public immutable controller;
 uint256 public cumulative;uint32 public sampledAt;uint256 public twapWeiPerToken;uint256 public observedAt;bool public started;
 error NotReady();error Unauthorized();
 event Observed(uint256 price,uint256 at);
 constructor(address p,address token,address c){pair=IV2Pair(p);tokenIs0=pair.token0()==token;controller=c;}
 function _current() private view returns(uint256 c,uint32 now32,uint256 bnbReserve,uint256 tokenReserve){
  (uint112 r0,uint112 r1,uint32 stamp)=pair.getReserves();
  tokenReserve=tokenIs0?r0:r1;bnbReserve=tokenIs0?r1:r0;if(tokenReserve==0||bnbReserve==0)revert NotReady();
  now32=uint32(block.timestamp);c=tokenIs0?pair.price0CumulativeLast():pair.price1CumulativeLast();
  unchecked{uint32 elapsed=now32-stamp;c+=((bnbReserve<<112)/tokenReserve)*elapsed;}
 }
 function start() external {if(msg.sender!=controller||started)revert Unauthorized();(cumulative,sampledAt,,)=_current();started=true;}
 function update() external returns(bool){
  if(!started)revert NotReady();(uint256 c,uint32 stamp,,)=_current();uint32 elapsed;unchecked{elapsed=stamp-sampledAt;}
  if(elapsed<WINDOW)return false;
  if(elapsed>MAX_WINDOW){cumulative=c;sampledAt=stamp;twapWeiPerToken=0;observedAt=0;return false;}
  uint256 diff;unchecked{diff=c-cumulative;}
  twapWeiPerToken=Math.mulDiv(diff/elapsed,1 ether,Q112);observedAt=block.timestamp;cumulative=c;sampledAt=stamp;emit Observed(twapWeiPerToken,observedAt);return true;
 }
 function read() external view returns(uint256 spot,uint256 twap,uint256 at,uint256 bnb,uint256 tokens){
  if(!started||twapWeiPerToken==0)revert NotReady();(,,bnb,tokens)=_current();spot=Math.mulDiv(bnb,1 ether,tokens);return(spot,twapWeiPerToken,observedAt,bnb,tokens);
 }
}
