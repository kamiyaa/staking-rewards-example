import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { KamiToken } from "../typechain";

describe("KamiToken", () => {
  const TOKEN_CAP = 700_000_000;
  const MINT_AMOUNT = 500_000_000;

  const REVERT_CAP_TOO_LOW = "New cap is lower than total supply";

  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  let kamiToken: KamiToken;

  beforeEach(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // deploy token
    const kamiTokenFactory = await ethers.getContractFactory("KamiToken");
    kamiToken = await kamiTokenFactory.deploy();
    await kamiToken.initialize(TOKEN_CAP);

    // make sure owners are correct
    expect(await kamiToken.owner()).to.equal(owner.address);

    // make sure minting works and mint to owner
    await expect(kamiToken.mint(MINT_AMOUNT))
      .to.emit(kamiToken, "Transfer")
      .withArgs(ethers.constants.AddressZero, owner.address, MINT_AMOUNT);
    expect(await kamiToken.balanceOf(owner.address)).to.equal(MINT_AMOUNT);
  });

  it("initial supply is 700M and owned by owner", async () => {
    expect(await kamiToken.totalSupply()).to.equal(MINT_AMOUNT);
    expect(await kamiToken.balanceOf(owner.address)).to.equal(MINT_AMOUNT);
  });

  it("allowance should equal approval", async () => {
    await kamiToken.approve(addr1.address, 63);
    expect(await kamiToken.allowance(owner.address, addr1.address)).to.equal(
      63
    );
  });

  it("minting works", async () => {
    const mintAmount = 1000;
    await kamiToken.mint(mintAmount);
    expect(await kamiToken.totalSupply()).to.equal(MINT_AMOUNT + mintAmount);
    expect(await kamiToken.balanceOf(owner.address)).to.equal(
      MINT_AMOUNT + mintAmount
    );
  });

  it("increasing token cap works", async () => {
    const newCap = 1_000_000_000;
    await kamiToken.updateCap(newCap);
    expect(await kamiToken.cap()).to.equal(newCap);
    await kamiToken.mint(newCap - MINT_AMOUNT);
    expect(await kamiToken.totalSupply()).to.equal(newCap);
    expect(await kamiToken.balanceOf(owner.address)).to.equal(newCap);
  });

  it("increasing token cap fails if lower than supply", async () => {
    const newCap = 400_000_000;
    await expect(kamiToken.updateCap(newCap)).to.be.revertedWith(
      REVERT_CAP_TOO_LOW
    );
  });
});
