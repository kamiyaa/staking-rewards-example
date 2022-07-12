import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  KamiMockLPToken,
  KamiStakingRewards,
  KamiToken,
} from "../typechain";

import { disableAutomaticMining, mineNBlocks } from "./test_utils";

describe("KamiStakingRewards::ClaimReward", () => {
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
    await kamiToken.transfer(stakeRewards.address, 100_000_000);
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

  it("claimRewards emits event", async () => {
    const EXPECTED_REWARD = ethers.BigNumber.from(2000);

    await stakeRewards.connect(addr1).deposit(1000);
    await mineNBlocks(2);

    const pendingReward = await stakeRewards.pendingReward(addr1.address);
    expect(pendingReward).to.equal(EXPECTED_REWARD);

    const claimedReward1 = EXPECTED_REWARD.add(1000);
    await expect(stakeRewards.connect(addr1).claimRewards())
      .to.emit(stakeRewards, "Claimed")
      .withArgs(addr1.address, claimedReward1);
  });

  it("claimRewards is correct with single staker staking once", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.connect(addr1).deposit(10000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(await lpToken.balanceOf(addr1.address)).to.equal(
        100_000_000 - 10000
      );
    }
    await mineNBlocks(8);
    {
      const pendingReward = await stakeRewards
        .connect(addr1)
        .pendingReward(addr1.address);
      const promise = stakeRewards.connect(addr1).claimRewards();
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(pendingReward.toNumber()).to.closeTo(1000 * 8, 1);
      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(100_000_000 + 1000 * 10, 1);
    }
  });

  it("claimRewards is correct with single staker staking multiple times", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.connect(addr1).deposit(10000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(await lpToken.balanceOf(addr1.address)).to.equal(
        100_000_000 - 10000
      );
    }
    await mineNBlocks(8);
    {
      const promise = stakeRewards.connect(addr1).deposit(5000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(await lpToken.balanceOf(addr1.address)).to.equal(
        100_000_000 - 15000
      );
    }
    await mineNBlocks(8);
    {
      const promise = stakeRewards.connect(addr1).withdraw(8000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(8);
    {
      const promise = stakeRewards.connect(addr1).withdraw(7000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(8); // no effect
    {
      const pendingReward = await stakeRewards
        .connect(addr1)
        .pendingReward(addr1.address);
      const promise = stakeRewards.connect(addr1).claimRewards();
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
      expect(pendingReward.toNumber()).to.closeTo(1000 * 30, 1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(100_000_000 + 1000 * 30, 1);
    }
  });

  it("claimRewards is correct with single staker restaking", async () => {
    await disableAutomaticMining();
    {
      const promise = stakeRewards.connect(addr1).deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    {
      const promise = stakeRewards.connect(addr1).deposit(1000);
      // produce a block to complete the deposit
      await mineNBlocks(1); // 1 block
      await promise;
      await mineNBlocks(1);
    }
    {
      const promise = stakeRewards.connect(addr1).withdraw(750);
      // produce a block to complete the deposit
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    {
      const promise = stakeRewards.connect(addr1).claimRewards();
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(100_000_000 + 1000 * 6, 1);
    }
    {
      const promise = stakeRewards.connect(addr1).withdraw(1250);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(6); // no effect
    {
      const promise = stakeRewards.connect(addr1).claimRewards();
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(100_000_000 + 1000 * 12, 1);
    }
    {
      const promise = stakeRewards.connect(addr1).deposit(1000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(1);
    {
      const promise = stakeRewards.connect(addr1).claimRewards();
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(100_000_000 + 1000 * 21, 1);
    }
  });

  it("claimRewards is correct with multiple stakers staking once", async () => {
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
      const claimRewardsPromise1 = stakeRewards.connect(addr1).claimRewards();
      const claimRewardsPromise2 = stakeRewards.connect(addr2).claimRewards();
      await mineNBlocks(1);
      await claimRewardsPromise1;
      await claimRewardsPromise2;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 4 + 750 * 2,
        1
      );
      const addr2Balance = await kamiToken.balanceOf(addr2.address);
      expect(addr2Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 0 + 250 * 2,
        1
      );
    }
    await mineNBlocks(3);
    {
      const claimRewardsPromise1 = stakeRewards.connect(addr1).claimRewards();
      const claimRewardsPromise2 = stakeRewards.connect(addr2).claimRewards();
      await mineNBlocks(1);
      await claimRewardsPromise1;
      await claimRewardsPromise2;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 4 + 750 * 7,
        1
      );
      const addr2Balance = await kamiToken.balanceOf(addr2.address);
      expect(addr2Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 0 + 250 * 7,
        1
      );
    }
    {
      const promise = stakeRewards.connect(addr1).withdraw(500_000);
      await mineNBlocks(1);
      await promise;
      await mineNBlocks(1);
    }
    await mineNBlocks(2);
    {
      const claimRewardsPromise1 = stakeRewards.connect(addr1).claimRewards();
      const claimRewardsPromise2 = stakeRewards.connect(addr2).claimRewards();
      await mineNBlocks(1);
      await claimRewardsPromise1;
      await claimRewardsPromise2;
      await mineNBlocks(1);

      const addr1Balance = await kamiToken.balanceOf(addr1.address);
      expect(addr1Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 4 + 750 * 9 + 500 * 4,
        1
      );
      const addr2Balance = await kamiToken.balanceOf(addr2.address);
      expect(addr2Balance.toNumber()).to.closeTo(
        100_000_000 + 1000 * 0 + 250 * 9 + 500 * 4,
        1
      );
    }
  });
});
