// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// import "hardhat/console.sol";

import "./interfaces/IStakeRewards.sol";
import "./lib/KamiMath.sol";

// Contract for Kami Staking Rewards for unstable coins.
// This contract is responsible for locking up user-provided LP tokens
// in exchange for Kami token rewards.
// Users can deposit, withdraw their LP tokens.
// Users can check their pending rewards and claim rewards.
contract KamiStakingRewards is Ownable, Initializable, IStakeRewards {
    using SafeERC20 for IERC20;

    // events
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount, uint256 fee);
    event Claimed(address indexed user, uint256 amount);

    // structs
    struct UserDetails {
        uint256 stakeAmount;
        uint256 rewardTally;
        uint256 rewardEarned;
        uint256 withdrawalTimestamp;
        uint64 withdrawalBlock;
        bool negativeRewardTally;
    }

    // private variables

    // when the last distribution was
    uint256 private lastDistributionBlock;
    // keeps track of how much reward is owed to each token.
    // fancy math
    uint256 private rewardPerTokenStored = 0;

    // public variables

    // rewards token
    IERC20 public rewardToken;
    // liquidity pool token
    IERC20 public stakeToken;

    // initial start block of rewards
    uint256 public startBlock;

    // total staked amount
    uint256 public override totalSupply;

    // number of blocks per epoch
    uint32 public blocksPerEpoch;
    // how much rewards per block to give at each epoch
    uint256[] public epochRewards;

    // amount of reward tokens accumulated by stakers
    mapping(address => UserDetails) public userDetails;

    function initialize(
        IERC20 _lpToken,
        IERC20 _rewardToken,
        uint32 _blocksPerEpoch,
        uint256[] memory _epochRewards
    ) public onlyOwner initializer {
        startBlock = block.number;
        rewardToken = _rewardToken;
        stakeToken = _lpToken;

        blocksPerEpoch = _blocksPerEpoch;
        epochRewards = _epochRewards;
        lastDistributionBlock = startBlock;
    }

    function approve(uint256 _amount) public {
        stakeToken.approve(address(this), _amount);
    }

    /// View Functions

    function balanceOf(address _user) public view override returns (uint256) {
        return userDetails[_user].stakeAmount;
    }

    /*
     * Function for viewing how much rewards the user can claim
     */
    function pendingReward(address _user)
        public
        view
        override
        returns (uint256)
    {
        return _pendingReward(_user) / 1 ether;
    }

    /*
     * Calculate Withdrawal Fees
     */
    function withdrawalFee(address _user, uint256 amount)
        public
        view
        returns (uint256)
    {
        uint64 withdrawalBlock = userDetails[_user].withdrawalBlock;
        uint256 withdrawalTimestamp = userDetails[_user].withdrawalTimestamp;

        if (block.number == startBlock + withdrawalBlock) {
            return amount / 4; // 25%
        }
        if (block.timestamp - withdrawalTimestamp <= 1 hours) {
            return amount / 25 * 2; // 8%
        }
        if (block.timestamp - withdrawalTimestamp <= 1 days) {
            return amount / 25; // 4%
        }
        if (block.timestamp - withdrawalTimestamp <= 3 days) {
            return amount / 50; // 2%
        }
        if (block.timestamp - withdrawalTimestamp <= 5 days) {
            return amount / 100; // 1%
        }
        if (block.number - startBlock - withdrawalBlock <= blocksPerEpoch * 2) {
            return amount / 200; // 0.5%
        }
        if (block.number - startBlock - withdrawalBlock <= blocksPerEpoch * 4) {
            return amount / 400; // 0.25%
        }
        return amount / 1000; // 0.01%
    }

    /// mutation functions

    /*
     * Stake tokens to earn rewards
     */
    function deposit(uint256 _amount) public override {
        require(_amount > 0, "Amount must be greater than 0");

        stakeToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );

        distributeAndUpdate(pendingDistribution(block.number));

        userDetails[msg.sender].stakeAmount += _amount;
        totalSupply += _amount;

        (uint256 newAmount, bool negative) = KamiMath.signedAddition(
            userDetails[msg.sender].rewardTally,
            rewardPerTokenStored * _amount,
            userDetails[msg.sender].negativeRewardTally
        );
        userDetails[msg.sender].rewardTally = newAmount;
        userDetails[msg.sender].negativeRewardTally = negative;

        // update withdrawal block info
        userDetails[msg.sender].withdrawalBlock = uint64(
            block.number - startBlock
        );
        userDetails[msg.sender].withdrawalTimestamp = block.timestamp;

        emit Deposit(msg.sender, _amount);
    }

    /*
     * Unstake tokens
     */
    function withdraw(uint256 _amount) public override {
        require(_amount > 0, "Amount must be greater than 0");
        require(
            userDetails[msg.sender].stakeAmount >= _amount,
            "Amount exceeds stake amount"
        );

        distributeAndUpdate(pendingDistribution(block.number));
        sweepRewards(msg.sender);

        // apply withdrawal fee
        uint256 withdrawFee = withdrawalFee(msg.sender, _amount);
        stakeToken.safeTransfer(msg.sender, _amount - withdrawFee);

        // update values
        userDetails[msg.sender].stakeAmount -= _amount;
        totalSupply -= _amount;
        (uint256 newAmount, bool negative) = KamiMath.signedSubtract(
            userDetails[msg.sender].rewardTally,
            rewardPerTokenStored * _amount,
            userDetails[msg.sender].negativeRewardTally
        );
        userDetails[msg.sender].rewardTally = newAmount;
        userDetails[msg.sender].negativeRewardTally = negative;

        // update withdrawal block info
        userDetails[msg.sender].withdrawalBlock = uint64(
            block.number - startBlock
        );
        userDetails[msg.sender].withdrawalTimestamp = block.timestamp;

        emit Withdraw(msg.sender, _amount, withdrawFee);
    }

    /*
     * Claim rewards
     */
    function claimRewards() public override {
        uint256 userRewards = pendingReward(msg.sender);
        require(userRewards > 0, "No rewards available");

        // make sure we have enough balance to reward caller
        uint256 balance = rewardToken.balanceOf(address(this));
        require(balance > userRewards, "Not enough rewards to give out");

        distributeAndUpdate(pendingDistribution(block.number));

        // transfer rewards to caller
        rewardToken.safeTransfer(msg.sender, userRewards);
        userDetails[msg.sender].rewardTally =
            userDetails[msg.sender].stakeAmount *
            rewardPerTokenStored;
        userDetails[msg.sender].negativeRewardTally = false;

        // emit an event about it
        emit Claimed(msg.sender, userRewards);
    }

    /// Owner-only

    /// Private functions

    /// Views
    /*
     * Function for viewing how much rewards the user can claim times 1 ether
     */
    function _pendingReward(address _user) private view returns (uint256) {
        if (userDetails[_user].stakeAmount > 0) {
            uint256 newRewardPerToken = rewardPerTokenStored +
                (pendingDistribution(block.number) * 1 ether) /
                totalSupply;
            if (userDetails[_user].negativeRewardTally) {
                return
                    (userDetails[_user].stakeAmount * newRewardPerToken) +
                    userDetails[_user].rewardEarned +
                    userDetails[_user].rewardTally;
            } else {
                return
                    (userDetails[_user].stakeAmount * newRewardPerToken) +
                    userDetails[_user].rewardEarned -
                    userDetails[_user].rewardTally;
            }
        } else {
            if (userDetails[_user].negativeRewardTally) {
                return
                    userDetails[_user].rewardEarned +
                    userDetails[_user].rewardTally;
            } else {
                return
                    userDetails[_user].rewardEarned -
                    userDetails[_user].rewardTally;
            }
        }
    }

    /*
     * Calculates the amount of rewards distributed from startBlock to _blockNumber
     */
    function calculateDistribution(uint256 _blockNumber)
        private
        view
        returns (uint256)
    {
        if (_blockNumber <= startBlock) {
            return 0;
        }

        uint256 total = 0;
        uint64 rewardBlocks = uint64(_blockNumber - startBlock);
        uint32 n = uint32(epochRewards.length);
        for (uint32 i = 0; i < n; i++) {
            uint64 numBlocks = uint64(Math.min(blocksPerEpoch, rewardBlocks));
            total += epochRewards[i] * numBlocks;
            if (rewardBlocks <= blocksPerEpoch) {
                break;
            }
            rewardBlocks -= blocksPerEpoch;
        }
        return total;
    }

    /*
     * Calculates how much rewards have accumulated since the last distribution call
     */
    function pendingDistribution(uint256 blockNumber)
        private
        view
        returns (uint256)
    {
        uint256 distributedRewards = calculateDistribution(
            lastDistributionBlock
        );
        uint256 totalRewards = calculateDistribution(blockNumber);
        return totalRewards - distributedRewards;
    }

    /// Mutation functions

    /*
     * Updates rewardPerToken with the new added amount of rewards.
     * Updates lastDistributionBlock to current block.
     */
    function distributeAndUpdate(uint256 _amount) private {
        if (totalSupply > 0) {
            rewardPerTokenStored += (_amount * 1 ether) / totalSupply;
        }
        lastDistributionBlock = block.number;
    }

    function sweepRewards(address _user) private {
        userDetails[_user].rewardEarned = _pendingReward(_user);
        userDetails[_user].rewardTally =
            userDetails[_user].stakeAmount *
            rewardPerTokenStored;
        userDetails[_user].negativeRewardTally = false;
    }
}
