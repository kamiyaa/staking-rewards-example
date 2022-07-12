import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-storage-layout";

import "solidity-coverage";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  let i = 0;
  for (const account of accounts) {
    console.log(i, account.address);
    i++;
  }
});

/*
task("balance", "Prints an account's balance")
  .addParam("account", "The account's address")
  .setAction(async (taskArgs) => {
    const account = web3.utils.toChecksumAddress(taskArgs.account);
    const balance = await web3.eth.getBalance(account);

    console.log(web3.utils.fromWei(balance, "ether"), "ONE");
  });
*/

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.7",
    settings: {
        optimizer: {
            enabled: true,
            runs: 1000,
        },
        outputSelection: {
            "*": {
                "*": ["storageLayout"],
            },
          },
    },
  },
  networks: {
    testnet: {
      url: "placeholder",
      accounts: [ `${process.env.PRIVATE_KEY}` ]
    },
    mainnet: {
      url: "placeholder",
      accounts: [ `${process.env.PRIVATE_KEY}` ]
    },
    hardhat: {
      mining: {
        mempool: {
          order: "fifo"
        }
      }
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
