// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IAgentID { function ownerOf(uint256 id) external view returns(address); }
interface IWBNB { function deposit() external payable; function withdraw(uint256) external; function transfer(address,uint256) external returns(bool); }
interface IV2Factory { function getPair(address,address) external view returns(address); function createPair(address,address) external returns(address); }
interface IV2Pair {
 function token0() external view returns(address); function token1() external view returns(address); function factory() external view returns(address);
 function getReserves() external view returns(uint112,uint112,uint32); function price0CumulativeLast() external view returns(uint256); function price1CumulativeLast() external view returns(uint256);
 function mint(address) external returns(uint256); function totalSupply() external view returns(uint256);
}
interface IV2Router {
 function factory() external view returns(address); function WETH() external view returns(address);
 function getAmountsOut(uint256,address[] calldata) external view returns(uint256[] memory);
 function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[] calldata,address,uint256) external;
}
