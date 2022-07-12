// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IStakeRewards {
    function totalSupply() external view returns (uint256);

    function balanceOf(address _user) external view returns (uint256);

    function pendingReward(address _user) external view returns (uint256);

    function deposit(uint256 _amount) external;

    function withdraw(uint256 _amount) external;

    function claimRewards() external;
}
