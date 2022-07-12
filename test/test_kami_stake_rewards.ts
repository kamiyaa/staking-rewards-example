import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  KamiMockLPToken,
  KamiStakingRewards,
  KamiToken,
} from "../typechain";

import * as utils from "./test_utils";

describe("KamiStakeRewards", () => {
  const TOKEN_CAP = 700_000_000;
  const MINT_AMOUNT = 500_000_000;
  const EPOCH_REWARDS = [1000, 100, 10, 1];
  const BLOCK_PER_EPOCH = 100;
  const REVERT_ALLOWANCE_TOO_LOW = "ERC20: transfer amount exceeds allowance";
  const AMOUNT_IS_ZERO = "Amount must be greater than 0";
  const AMOUNT_EXCEEDS_STAKE = "Amount exceeds stake amount";

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
  });

  it("deposit fails on zero amount", async () => {
    await expect(stakeRewards.deposit(0)).to.be.revertedWith(AMOUNT_IS_ZERO);
  });

  it("deposit fails if not approved", async () => {
    await expect(stakeRewards.deposit(100)).to.be.revertedWith(
      REVERT_ALLOWANCE_TOO_LOW
    );
  });

  it("deposit succeeds on approval", async () => {
    // approve first, before deposit
    await lpToken.approve(stakeRewards.address, 100);

    await stakeRewards.deposit(100);
    const userDetails = await stakeRewards.userDetails(owner.address);

    expect(await userDetails.stakeAmount).to.equal(100);
    expect(await stakeRewards.totalSupply()).to.equal(100);
    expect(await lpToken.balanceOf(owner.address)).to.equal(300_000_000 - 100);
  });

  it("withdraw fails on zero amount", async () => {
    await expect(stakeRewards.withdraw(0)).to.be.revertedWith(AMOUNT_IS_ZERO);
  });

  it("withdraw fails if amount too high", async () => {
    // approve first, before deposit
    await lpToken.approve(stakeRewards.address, 40);
    await stakeRewards.deposit(40);

    await expect(stakeRewards.withdraw(100)).to.be.revertedWith(
      AMOUNT_EXCEEDS_STAKE
    );
  });

  it("withdraw succeed if amount is valid", async () => {
    // approve first, before deposit
    await lpToken.approve(stakeRewards.address, 100);
    await stakeRewards.deposit(100);
    expect(await lpToken.balanceOf(owner.address)).to.equal(300_000_000 - 100);

    await utils.mineNBlocks(1);

    const withdrawalFee = await stakeRewards.withdrawalFee(owner.address, 65);
    // withdraw
    await stakeRewards.withdraw(65);

    expect(await stakeRewards.balanceOf(owner.address)).to.equal(35);
    expect(await stakeRewards.totalSupply()).to.equal(35);

    const newBalance = 300_000_000 - 100 + 65 - withdrawalFee.toNumber();
    expect(await lpToken.balanceOf(owner.address)).to.equal(newBalance);
  });

  it("withdraw fee is 1% after 3 days", async () => {
    // approve first, before deposit
    await lpToken.approve(stakeRewards.address, 100);
    await stakeRewards.deposit(100);
    expect(await lpToken.balanceOf(owner.address)).to.equal(300_000_000 - 100);

    await utils.increaseTime(3600 * 24 * 3 + 3600);
    await utils.mineNBlocks(1);

    // withdrawal fee should be 1% of 100 (1)
    const withdrawalFee = await stakeRewards.withdrawalFee(owner.address, 100);
    expect(withdrawalFee).to.equal(1);

    // make sure correct message is emitted
    await expect(stakeRewards.withdraw(100))
      .to.emit(stakeRewards, "Withdraw")
      .withArgs(owner.address, 100, 1);

    // make sure user stake is 0 in the contract
    expect(await stakeRewards.balanceOf(owner.address)).to.equal(0);

    // make sure withdrawal fee is actually applied
    const newBalance = 300_000_000 - withdrawalFee.toNumber();
    expect(await lpToken.balanceOf(owner.address)).to.equal(newBalance);
  });
});
