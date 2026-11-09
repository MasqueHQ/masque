const assert = require("node:assert/strict");
const hre = require("hardhat");
const { parseEther, keccak256, toHex, zeroAddress, createWalletClient, createPublicClient, createTestClient, custom, getContract } = require("viem");
const { hardhat } = require("viem/chains");

// viem straight on Hardhat's in-process chain (the viem toolbox plugin is not installed here)
const transport = custom(hre.network.provider);
async function deploy(name, args = [], wallet) {
  const a = await hre.artifacts.readArtifact(name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
  const { contractAddress } = await pub.waitForTransactionReceipt({ hash });
  return at(a.abi, contractAddress, wallet);
}
const at = (abi, address, wallet) => {
  const c = getContract({ abi, address, client: { public: pub, wallet } });
  // wait for every write so reads after it see the new state
  return { ...c, abi, address, write: new Proxy({}, { get: (_, fn) => async (args, opts) => { const h = await c.write[fn](args, opts); const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("reverted"); return h; } }) };
};
let pub;

const P = name => keccak256(toHex(name));            // pockets are hashes of a label
const MAIN = P("main"), LONG = P("long");

async function reverts(promise, error) {
  try { await promise; } catch (e) { const msg = String(e.message || e); assert.ok(msg.includes(error), `expected ${error}, got: ${msg.slice(0, 200)}`); return; }
  assert.fail(`expected revert ${error}`);
}

describe("MasqueVault", () => {
  let vault, tsla, alice, bob, test;
  beforeEach(async () => {
    await hre.run("compile", { quiet: true });
    pub = createPublicClient({ chain: hardhat, transport });
    test = createTestClient({ chain: hardhat, mode: "hardhat", transport });
    const [a, b] = await pub.request({ method: "eth_accounts" });
    alice = createWalletClient({ chain: hardhat, transport, account: a });
    bob = createWalletClient({ chain: hardhat, transport, account: b });
    vault = await deploy("MasqueVault", [], alice);
    tsla = await deploy("TestToken", ["Test Tesla", "tTSLA", 18, parseEther("10")], alice);
  });
  const as = (c, w) => at(c.abi, c.address, w);

  it("deposits and withdraws ETH to any address", async () => {
    await vault.write.deposit([MAIN], { value: parseEther("1") });
    assert.equal(await vault.read.balanceOf([alice.account.address, MAIN, zeroAddress]), parseEther("1"));
    const fresh = "0x000000000000000000000000000000000000bEEF";
    await vault.write.withdraw([zeroAddress, parseEther("0.4"), MAIN, fresh]);
    assert.equal(await pub.getBalance({ address: fresh }), parseEther("0.4"));
    assert.equal(await vault.read.balanceOf([alice.account.address, MAIN, zeroAddress]), parseEther("0.6"));
  });

  it("deposits and withdraws tokens", async () => {
    await tsla.write.faucet();
    await tsla.write.approve([vault.address, parseEther("10")]);
    await vault.write.depositToken([tsla.address, parseEther("6"), MAIN]);
    assert.equal(await vault.read.balanceOf([alice.account.address, MAIN, tsla.address]), parseEther("6"));
    await vault.write.withdraw([tsla.address, parseEther("6"), MAIN, bob.account.address]);
    assert.equal(await tsla.read.balanceOf([bob.account.address]), parseEther("6"));
    assert.equal(await tsla.read.balanceOf([vault.address]), 0n);
  });

  it("never lets one owner take another owner's balance", async () => {
    await vault.write.deposit([MAIN], { value: parseEther("1") });
    const asBob = await as(vault, bob);
    await reverts(asBob.write.withdraw([zeroAddress, 1n, MAIN, bob.account.address]), "Insufficient");
    await reverts(asBob.write.move([zeroAddress, 1n, MAIN, LONG]), "Insufficient");
    assert.equal(await pub.getBalance({ address: vault.address }), parseEther("1"));
  });

  it("cannot withdraw more than the pocket holds", async () => {
    await vault.write.deposit([MAIN], { value: parseEther("1") });
    await reverts(vault.write.withdraw([zeroAddress, parseEther("1.01"), MAIN, alice.account.address]), "Insufficient");
    await reverts(vault.write.withdraw([zeroAddress, 1n, LONG, alice.account.address]), "Insufficient");
  });

  it("moves between own pockets", async () => {
    await vault.write.deposit([MAIN], { value: parseEther("1") });
    await vault.write.move([zeroAddress, parseEther("0.3"), MAIN, LONG]);
    assert.equal(await vault.read.balanceOf([alice.account.address, LONG, zeroAddress]), parseEther("0.3"));
    assert.equal(await vault.read.balanceOf([alice.account.address, MAIN, zeroAddress]), parseEther("0.7"));
  });

  it("locks a pocket until its time, and a lock only extends", async () => {
    await vault.write.deposit([LONG], { value: parseEther("1") });
    const now = (await pub.getBlock()).timestamp;
    await vault.write.lock([LONG, now + 3600n]);
    await reverts(vault.write.withdraw([zeroAddress, 1n, LONG, alice.account.address]), "PocketLocked");
    await reverts(vault.write.move([zeroAddress, 1n, LONG, MAIN]), "PocketLocked");
    await reverts(vault.write.lock([LONG, now + 60n]), "LockCanOnlyExtend");
    await vault.write.deposit([LONG], { value: 1n });          // a locked pocket still receives
    await test.increaseTime({ seconds: 3601 }); await test.mine({ blocks: 1 });
    await vault.write.withdraw([zeroAddress, parseEther("1") + 1n, LONG, alice.account.address]);
  });

  it("rejects zero amounts and the zero address", async () => {
    await reverts(vault.write.deposit([MAIN], { value: 0n }), "ZeroAmount");
    await vault.write.deposit([MAIN], { value: 1n });
    await reverts(vault.write.withdraw([zeroAddress, 1n, MAIN, zeroAddress]), "ZeroAddress");
    await reverts(vault.write.withdraw([zeroAddress, 0n, MAIN, alice.account.address]), "ZeroAmount");
  });

  it("is safe against a reentering receiver", async () => {
    const evil = await deploy("Reenter", [vault.address], alice);
    await evil.write.start({ value: parseEther("1") });
    // the attacker deposited 1 ETH and asked for it back while trying to withdraw again inside the call
    assert.equal(await pub.getBalance({ address: vault.address }), 0n);
    assert.equal(await evil.read.reentered(), false);
  });

  it("faucet drips once an hour", async () => {
    await tsla.write.faucet();
    await reverts(tsla.write.faucet(), "TooSoon");
    await test.increaseTime({ seconds: 3601 }); await test.mine({ blocks: 1 });
    await tsla.write.faucet();
    assert.equal(await tsla.read.balanceOf([alice.account.address]), parseEther("20"));
  });
});
