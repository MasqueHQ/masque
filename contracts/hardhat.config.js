// Robinhood Chain testnet deploys run through scripts/deploy.js; tests use Hardhat's in-process chain via viem.
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 300 }, evmVersion: "cancun" } },
};
