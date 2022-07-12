import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  KamiMockLPToken,
  KamiStakingRewards,
  KamiToken,
} from "../typechain";

import { disableAutomaticMining, mineNBlocks } from "./test_utils";

describe("KamiStakingRewards::PendingReward", () => {
  const TOKEN_CAP = 700_000_000;
  const MINT_AMOUNT = 500_000_000;
  const EPOCH_REWARDS = [1000, 100, 10, 1];
  const BLOCK_PER_EPOCH = 100;

  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  let kamiToken: KamiToken;
  let lpToken: KamiMockLPToken;
  let stakeRewards: KamiStakingRewards;

  beforeEach(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // deploy token
    const kamiTokenFactory = await ethers.getContractFactory("KamiToken");
    kamiToken = await kamiTokenFactory.deploy();
    await kamiToken.initialize(TOKEN_CAP);

    const kamiMockLPTokenFactory = await ethers.getContractFactory("KamiToken");
    lpToken = await kamiMockLPTokenFactory.deploy();
    await lpToken.initialize(TOKEN_CAP);

    // deploy rewards
    const stakeRewardFactory = await ethers.getContractFactory(
      "KamiStakingRewards"
    );
    stakeRewards = await stakeRewardFactory.deploy();
    await stakeRewards.initialize(
      lpToken.address,
      kamiToken.address,
      BLOCK_PER_EPOCH,
      EPOCH_REWARDS
    );

    // make sure owners are correct
    expect(await kamiToken.owner()).to.equal(owner.address);
    expect(await stakeRewards.owner()).to.equal(owner.address);

    // mint to owner, then transfer to different users
    await kamiToken.mint(MINT_AMOUNT);
    expect(await kamiToken.balanceOf(owner.address)).to.equal(MINT_AMOUNT);
    await kamiToken.transfer(addr1.address, 100_000_000);
    await kamiToken.transfer(addr2.address, 100_000_000);

    await lpToken.mint(MINT_AMOUNT);
    expect(await lpToken.balanceOf(owner.address)).to.equal(MINT_AMOUNT);
    await lpToken.transfer(addr1.address, 100_000_000);
    await lpToken.transfer(addr2.address, 100_000_000);

    // allow for smart contract to pull funds from user
    await lpToken.connect(owner).approve(stakeRewards.address, TOKEN_CAP);
    await lpToken.connect(addr1).approve(stakeRewards.address, TOKEN_CAP);
    await lpToken.connect(addr2).approve(stakeRewards.address, TOKEN_CAP);
  });

  afterEach(async () => {
    await ethers.provider.send("evm_setAutomine", [true]);
  });

  it("pendingReward is correct with single staker staking once", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(await lpToken.balanceOf(owner.address)).to.equal(
        300_000_000 - 1000
      );
    }
    {
      // produce 2 blocks, then get pending reward
      await mineNBlocks(2); // 2 blocks worth of rewards
      const promise = stakeRewards.pendingReward(owner.address);
      await mineNBlocks(1); // 3 blocks worth of rewards
      const reward = await promise;

      expect(reward).to.equal(3000);
    }

    {
      const promise = stakeRewards.withdraw(1000);
      // we still take into account this block when calculating pending reward
      await mineNBlocks(1); // 4 blocks worth of rewards
      await promise;
      await mineNBlocks(1); // 5 blocks worth of rewards
    }
    {
      // additional blocks produced should not affect pending rewards
      await mineNBlocks(10); // no effect

      const promise = stakeRewards.pendingReward(owner.address);
      await mineNBlocks(1); // no effect
      const reward = await promise;
      expect(reward).to.equal(5000);
    }
    expect(await stakeRewards.balanceOf(owner.address)).to.equal(0);
  });

  it("pendingReward is correct with single staker staking multiple times", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
    }
    {
      const promise = stakeRewards.deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1); // 1 block
      await promise;
    }
    {
      const promise = stakeRewards.withdraw(750);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1); // 2 block
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(2000, 1);
    }
    await mineNBlocks(4); // 6 blocks worth of rewards
    {
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(6000, 1);
    }

    {
      const promise = stakeRewards.withdraw(1250);
      // produce a block to complete the deposit
      await mineNBlocks(1); // 7 blocks worth of rewards
      await promise;
    }
    await mineNBlocks(6); // no effect
    const reward = await stakeRewards.pendingReward(owner.address);
    expect(reward.toNumber()).to.closeTo(8000, 1);
    expect(await stakeRewards.balanceOf(owner.address)).to.equal(0);
  });

  it("pendingReward is correct with single staker restaking", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
    }
    {
      const promise = stakeRewards.deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1); // 1 block
      await promise;
    }
    {
      const promise = stakeRewards.withdraw(750);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1); // 2 block
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(2000, 1);
    }
    await mineNBlocks(4); // 6 blocks worth of rewards
    {
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(6000, 1);
    }

    {
      const promise = stakeRewards.withdraw(1250);
      // produce a block to complete the deposit
      await mineNBlocks(1); // 7 blocks worth of rewards
      await promise;
    }
    await mineNBlocks(6); // no effect
    {
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(8000, 1);
      expect(await stakeRewards.balanceOf(owner.address)).to.equal(0);
    }
    {
      const promise = stakeRewards.deposit(1000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(1);
    {
      const reward = await stakeRewards.pendingReward(owner.address);
      expect(reward.toNumber()).to.closeTo(9000, 1);
    }
  });

  it("pendingReward is correct with multiple stakers staking once", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.connect(addr1).deposit(750_000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(await stakeRewards.balanceOf(addr1.address)).to.equal(750_000);
    }
    await mineNBlocks(2); // 2 blocks worth of rewards
    {
      const promise = stakeRewards.connect(addr2).deposit(250_000);
      await mineNBlocks(1); // 3 blocks worth of rewards
      await promise;
      await mineNBlocks(1); // 4 blocks worth of rewards
      expect(await stakeRewards.balanceOf(addr2.address)).to.equal(250_000);
    }
    {
      const addr1Reward = await stakeRewards.pendingReward(addr1.address);
      expect(addr1Reward.toNumber()).to.closeTo(4000, 1);
      const addr2Reward = await stakeRewards.pendingReward(addr2.address);
      expect(addr2Reward.toNumber()).to.closeTo(0, 1);
    }
    await mineNBlocks(3);
    {
      const addr1Reward = await stakeRewards.pendingReward(addr1.address);
      expect(addr1Reward.toNumber()).to.closeTo(4000 + 750 * 3, 1);
      const addr2Reward = await stakeRewards.pendingReward(addr2.address);
      expect(addr2Reward.toNumber()).to.closeTo(0 + 250 * 3, 1);
    }
    {
      const promise = stakeRewards.connect(addr1).withdraw(500_000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    {
      const addr1Reward = await stakeRewards.pendingReward(addr1.address);
      expect(addr1Reward.toNumber()).to.closeTo(4000 + 750 * 5, 1);
      const addr2Reward = await stakeRewards.pendingReward(addr2.address);
      expect(addr2Reward.toNumber()).to.closeTo(0 + 250 * 5, 1);
    }
    await mineNBlocks(2);
    {
      const addr1Reward = await stakeRewards.pendingReward(addr1.address);
      expect(addr1Reward.toNumber()).to.closeTo(4000 + 750 * 5 + 500 * 2, 1);
      const addr2Reward = await stakeRewards.pendingReward(addr2.address);
      expect(addr2Reward.toNumber()).to.closeTo(0 + 250 * 5 + 500 * 2, 1);
    }
  });
});
