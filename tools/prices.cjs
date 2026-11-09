// Snapshot 30 days of hourly closes for the Position Lab (source: Yahoo Finance chart API).
// Usage: node prices.cjs   -> ../site/data/prices.json
const fs = require('fs'), path = require('path');
const stocks = require('D:/Claude/basis/data/stocks.json');
const PICK = ['TSLA', 'NVDA', 'AAPL', 'COIN', 'MSTR', 'PLTR', 'AMD', 'META'];
(async () => {
  const out = { source: 'Yahoo Finance, 1h closes', made: new Date().toISOString(), stocks: [] };
  for (const t of PICK) {
    const s = stocks.find(x => x.ticker === t);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1mo&interval=1h`, { headers: { 'user-agent': 'Mozilla/5.0' } }).then(r => r.json());
    const q = r.chart.result[0], ts = q.timestamp, c = q.indicators.quote[0].close;
    const pts = ts.map((x, i) => [x, c[i]]).filter(p => p[1] != null).map(([x, y]) => [x, +y.toFixed(2)]);
    out.stocks.push({ ticker: t, name: s.name, token: s.token, feed: s.feed, pts });
    console.log(t, pts.length, pts[0][1], '->', pts.at(-1)[1]);
  }
  fs.writeFileSync(path.join(__dirname, '../site/data/prices.json'), JSON.stringify(out));
})();
