// Downloads a logo for every market on the terminal into site/assets/logos, so the page never hotlinks them.
// Stocks: financialmodelingprep image-stock. ETH/cbBTC: CoinGecko. Other crypto: the coin's own Pons logo, else its
// DexScreener image. Writes site/assets/logos/index.json (symbol -> file). node tools/fetch-logos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, parseAbi } from 'file:///D:/Claude/pons-sniper/node_modules/viem/_esm/index.js';

const OUT = new URL('../site/assets/logos/', import.meta.url);
const pub = createPublicClient({ transport: http('http://127.0.0.1:5200/rpc') });
const INFO = parseAbi(['struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }', 'function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)']);
const STOCKS = ['TSLA', 'NVDA', 'AAPL', 'GOOGL', 'AMZN', 'META', 'MSFT', 'AMD', 'COIN', 'MSTR', 'PLTR', 'SPY'];
const CRYPTO = { cbBTC: '0xcec185eb182c47d1ba1efc84e6959e18cd620be4', PONS: '0x39dbed3a2bd333467115de45665cc57f813c4571', VIRTUAL: '0xc6911796042b15d7fa4f6cde69e245ddcd3d9c31',
  MEME: '0x385f4f8ae47651ce5f58f5265395a669f8281e18', ORBIO: '0xaa07a0e9209e16ac99708c3ec70159c6ef3128a3', TIBBIR: '0x4db7374e966097be94c6680d49156d580f097bbf', PARE: '0x15d36b6a28d8327abc7afabf0f106ae2c9af5c4d',
  ZZZ: '0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a', DEGEN: '0x0830a9dd26a04e959657ab6788d45f5725590c32', ROBINCAT: '0xded852de9fe9ba9b6f27f39e8e81cf851a5c79cc', SHROOM: '0xab093def657f15df31b33922a95e047add645b29' };
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };
const ipfs = (u) => u.startsWith('ipfs://') ? 'https://ipfs.filebase.io/ipfs/' + u.replace(/^ipfs:\/\/(ipfs\/)?/, '') : u;

async function save(sym, url) {
  try {
    const r = await fetch(ipfs(url), { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0' } });
    const type = (r.headers.get('content-type') || '').split(';')[0], ext = EXT[type];
    if (!r.ok || !ext) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 300 || buf.length > 600_000) return null;
    const file = `${sym}.${ext}`; fs.writeFileSync(new URL(file, OUT), buf); return file;
  } catch { return null; }
}
const index = {};
for (const s of STOCKS) index[s] = await save(s, `https://financialmodelingprep.com/image-stock/${s}.png`);
index.ETH = await save('ETH', 'https://assets.coingecko.com/coins/images/279/large/ethereum.png');
index.cbBTC = await save('cbBTC', 'https://assets.coingecko.com/coins/images/40143/large/cbbtc.webp');
const ds = await fetch('https://api.dexscreener.com/tokens/v1/robinhood/' + Object.values(CRYPTO).join(',')).then((r) => r.json()).catch(() => []);
for (const [sym, addr] of Object.entries(CRYPTO)) {
  if (index[sym]) continue;
  let url = null;
  try { url = (await pub.readContract({ address: addr, abi: INFO, functionName: 'getTokenInfo' }))[1]; } catch {}
  let file = url && /^(https?|ipfs):\/\//.test(url) ? await save(sym, url) : null;
  if (!file) { const p = ds.find((x) => x.baseToken.address.toLowerCase() === addr && x.info?.imageUrl); if (p) file = await save(sym, p.info.imageUrl); }
  index[sym] = file;
}
fs.writeFileSync(new URL('index.json', OUT), JSON.stringify(index, null, 1));
console.log(index);
