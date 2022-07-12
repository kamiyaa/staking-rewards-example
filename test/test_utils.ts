import { ethers } from "hardhat";

export async function mineNBlocks(n: number) {
  for (let index = 0; index < n; index++) {
    await ethers.provider.send("evm_mine", []);
  }
}

export async function increaseTime(n: number) {
  await ethers.provider.send("evm_increaseTime", [n]);
}

export async function disableAutomaticMining() {
  await ethers.provider.send("evm_setAutomine", [false]);
  await ethers.provider.send("evm_setIntervalMining", [0]);
}
