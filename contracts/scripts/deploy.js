// Deploy MasqueVault + three faucet test tokens to Robinhood Chain TESTNET and write ../site/data/vault-testnet.json.
//   node node_modules/hardhat/internal/cli/cli.js compile && node scripts/deploy.js
// Sends through the site's /rpc-test relay (serve.mjs must be running) because the testnet RPC is blocked on some
// networks. The deployer is the throwaway testnet key in .deployer.key; fund it from faucet.testnet.chain.robinhood.com.
const fs = require("fs"), path = require("path");
const { createPublicClient, createWalletClient, http, parseEther, parseUnits, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.RPC || "http://127.0.0.1:5200/rpc-test";
const chain = { id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const OUT = path.join(__dirname, "../../site/data/vault-testnet.json");
const art = name => JSON.parse(fs.readFileSync(path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8"));

(async () => {
  const account = privateKeyToAccount(fs.readFileSync(path.join(__dirname, "../.deployer.key"), "utf8").trim());
  const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 30000 }) });
  const wallet = createWalletClient({ chain, transport: http(RPC, { timeout: 30000 }), account });
  if ((await pub.getChainId()) !== 46630) throw new Error("not Robinhood Chain testnet");
  const bal = await pub.getBalance({ address: account.address });
  console.log("deployer", account.address, formatEther(bal), "ETH");
  if (bal < parseEther("0.002")) throw new Error("fund the deployer from https://faucet.testnet.chain.robinhood.com first");

  async function deploy(name, args = []) {
    const a = art(name);
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(name + " deploy reverted");
    console.log(name, args[1] || "", r.contractAddress, "block", r.blockNumber);
    return r;
  }
  const v = await deploy("MasqueVault");
  const specs = [["Masque Test Tesla", "tTSLA", 18, parseEther("5")], ["Masque Test NVIDIA", "tNVDA", 18, parseEther("10")], ["Masque Test Dollar", "tUSDG", 6, parseUnits("1000", 6)]];
  const tokens = [];
  for (const sp of specs) { const r = await deploy("TestToken", sp); tokens.push({ sym: sp[1], addr: r.contractAddress, dec: sp[2] }); }

  const cfg = { chainId: 46630, vault: v.contractAddress, block: Number(v.blockNumber), tokens, deployer: account.address, deployedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2));
  console.log("wrote", OUT);
})().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
