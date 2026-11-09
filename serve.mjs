// MASQUE static server + read-only JSON-RPC proxy at /rpc (mainnet) and a testnet proxy at /rpc-test.
// Some networks (Indonesian ISPs among them) block rpc.mainnet.chain.robinhood.com, so the terminal reads the chain
// through its own origin. The proxy resolves the RPC host over DNS-over-HTTPS, forwards only read methods, and never
// sees a key: transactions are signed and sent by the visitor's wallet, not through here.
// /rpc-test also relays eth_sendRawTransaction: the vault preview runs on testnet, the visitor's wallet signs, and
// a signed transaction cannot be changed in transit. Mainnet /rpc stays read-only.
// node serve.mjs [port]   (default 5200, serves ./site)
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
const PORT = +(process.argv[2] || process.env.PORT || 5200);
const HOST = "rpc.mainnet.chain.robinhood.com", FALLBACK_IP = "104.20.46.209";
const READS = new Set(["eth_blockNumber", "eth_chainId", "net_version", "eth_call", "eth_getLogs", "eth_getBlockByNumber", "eth_getBalance",
  "eth_getCode", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getTransactionCount"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".txt": "text/plain" };

const TEST = { host: "rpc.testnet.chain.robinhood.com", ip: FALLBACK_IP, reads: new Set([...READS, "eth_sendRawTransaction", "web3_clientVersion"]) };
let ip = FALLBACK_IP;
async function lookup(host) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: "application/dns-json" } });
    return (await r.json()).Answer?.find(x => x.type === 1)?.data || null;
  } catch { return null; }
}
async function resolve() { ip = await lookup(HOST) || ip; TEST.ip = await lookup(TEST.host) || TEST.ip; }
await resolve(); setInterval(resolve, 30 * 60e3);

// publicnode serves everything but old eth_getLogs, so it backs up the official RPC for the rest
const MIRROR = "robinhood-rpc.publicnode.com";
function upstream(body, mirror, test) {
  const name = test ? TEST.host : mirror ? MIRROR : HOST, addr = test ? TEST.ip : mirror ? MIRROR : ip;
  return new Promise((ok, bad) => {
    const req = https.request({ host: addr, servername: name, port: 443, path: "/", method: "POST", timeout: 20e3,
      headers: { host: name, "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
      const parts = []; res.on("data", d => parts.push(d)); res.on("end", () => ok({ status: res.statusCode, body: Buffer.concat(parts) }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", bad); req.end(body);
  });
}

async function rpc(req, res, test) {
  let size = 0; const parts = [];
  for await (const d of req) { size += d.length; if (size > 256e3) return send(res, 413, "too large"); parts.push(d); }
  let msg; try { msg = JSON.parse(Buffer.concat(parts)); } catch { return send(res, 400, "bad json"); }
  const calls = Array.isArray(msg) ? msg : [msg];
  if (!calls.length || calls.length > 50 || calls.some(c => !(test ? TEST.reads : READS).has(c?.method))) { console.log("refused", calls.length, [...new Set(calls.map(c => c?.method))].join(",")); return send(res, 403, "read methods only"); }
  const body = JSON.stringify(msg);
  const logs = calls.some(c => c.method === "eth_getLogs");
  for (let i = 0; i < 4; i++) {                       // the public RPC rate-limits bursts: back off and retry, then the mirror
    try {
      const r = await upstream(body, !test && i === 3 && !logs, test);
      if (r.status === 429 || r.status >= 500) { await new Promise(t => setTimeout(t, 400 * (i + 1))); continue; }
      res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(r.body);
    } catch { await new Promise(t => setTimeout(t, 300)); }
  }
  send(res, 502, "upstream unavailable");
}

function send(res, code, text) { res.writeHead(code, { "content-type": "text/plain", ...SAFE }); res.end(text); }
// a wallet page must never be framed (clickjacking) and may only load code from itself and the pinned viem CDN
const SAFE = {
  "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": ["default-src 'self'", "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: https:", "media-src 'self'", "connect-src 'self' https://api.dexscreener.com https://rpc.mainnet.chain.robinhood.com https://robinhood-rpc.publicnode.com https://cdn.jsdelivr.net",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join("; "),
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/rpc" || url.pathname === "/rpc-test") return req.method === "POST" ? rpc(req, res, url.pathname === "/rpc-test") : send(res, 405, "POST only");
  let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) return send(res, 403, "no");
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (e, data) => {
    if (e) return send(res, 404, "not found");
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "cache-control": "no-cache", ...SAFE });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`MASQUE on http://127.0.0.1:${PORT}  (rpc via ${ip})`));
