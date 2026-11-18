// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

interface IV2Factory {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}
interface IV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function mint(address to) external returns (uint256);
}
interface IWBNB {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}
interface IV2Router {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function getAmountsOut(uint256 amount, address[] calldata path) external view returns (uint256[] memory);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amount, uint256 minOut, address[] calldata path, address to, uint256 deadline) external;
}
