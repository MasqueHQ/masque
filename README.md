<p align="center"><img src="site/brand/masque-pfp.png" width="140" alt="Masque"></p>

# Masque

A non-custodial terminal for stock tokens on Robinhood Chain. Markets stay public; Masque is built to keep one thing out of sight: who holds what.

## What is live, and what is not

| Part | Status | Notes |
|---|---|---|
| Swap stock tokens | Live | TSLA, NVDA, AAPL and more through Uniswap v3 pools, signed in your own wallet |
| Pons launches | Live | Buy and sell coins on their Pons bonding curve from the Launches tab |
| Position lab | Live | Replays a leveraged position on 30 days of real prices |
| Perps | Paper | Practice positions on live prices, stored in your browser, no funds involved |
| Vault | Testnet | `MasqueVault.sol`, no admin; mainnet only after an outside audit |

Masque never holds user funds. The site reads the chain in your browser and every trade is sent from your wallet.

## Demo

Watch the 45-second demo: [site/media/masque-demo.mp4](site/media/masque-demo.mp4)

## Run it locally

```bash
node serve.mjs          # http://127.0.0.1:5200
```

`serve.mjs` serves `site/` with strict security headers and a read-only `/rpc` proxy to Robinhood Chain (plus `/rpc-test` for the testnet).

## Contracts

```bash
cd contracts
npm install hardhat@2 viem @openzeppelin/contracts
npx hardhat test
```

`MasqueVault` keeps ETH and ERC-20 balances in named pockets. Only the owner can move or withdraw their balance, a pocket can be time-locked, and nobody can pause or change the vault. Deposits and withdrawals are public transactions; the vault keeps holdings off the owner's wallet page, it does not hide who deposited.

## Links

- Site: coming soon
- X: [@kestrelworks](https://x.com/kestrelworks)
- Code: [github.com/MasqueHQ/masque](https://github.com/MasqueHQ/masque)

Not affiliated with Robinhood. Not financial advice. Tokens can lose all value.
