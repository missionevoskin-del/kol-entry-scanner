/**
 * Exporta trades do KOLBR para formato usado na geração do dataset de treino.
 * Uso: node scripts/export_trades_for_dataset.js [--output raw_trades.json]
 *
 * Os trades exportados podem ser enviados ao GPT (via prompt em prompt_for_human_analysis.md)
 * para gerar análises humanas. Depois use convert_to_dataset.js para o formato final.
 */
const fs = require('fs');
const path = require('path');

const TRADES_FILE = path.join(__dirname, '..', 'data', 'trades.json');
const KOLS_FILE = path.join(__dirname, '..', 'data', 'kols.json');
const KOLSCAN_FILE = path.join(__dirname, '..', 'data', 'kols-kolscan.json');
const OUTPUT = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : path.join(__dirname, 'raw_trades_for_analysis.json');

function loadJson(filepath, fallback = []) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.warn('[export] Erro ao carregar', filepath, e.message);
  }
  return fallback;
}

function loadKols() {
  const manual = loadJson(KOLS_FILE, []);
  const kolscan = loadJson(KOLSCAN_FILE, []);
  const byWallet = new Map();
  [...manual, ...kolscan].forEach((k, i) => {
    const w = k.full || k.wallet;
    if (w) byWallet.set(w, { ...k, id: k.id || i + 1 });
  });
  return byWallet;
}

function main() {
  const trades = loadJson(TRADES_FILE, []);
  const kolsByWallet = loadKols();

  if (trades.length === 0) {
    console.log('[export] Nenhum trade em data/trades.json. Rode o app para coletar trades.');
    console.log('[export] Criando amostra sintética para referência...');
  }

  const exported = trades.map((t) => {
    const kol = t.kol || (t.wallet ? kolsByWallet.get(t.wallet) : null) || {};
    const wallet = kol.full || kol.wallet || t.wallet || '';
    const kolResolved = kolsByWallet.get(wallet) || kol;

    return {
      ca: t.ca || t.mint || t.tokenMint,
      name: t.name || 'Unknown',
      symbol: t.symbol || '?',
      marketCap: t.mc ?? t.marketCap ?? 0,
      liquidity: t.liq ?? t.liquidity ?? 0,
      volume24h: t.vol24h ?? t.volume24h ?? 0,
      buys: t.buys ?? 0,
      sells: t.sells ?? 0,
      priceChange1h: t.priceChange1h ?? 0,
      priceChange24h: t.change ?? t.priceChange24h ?? 0,
      kol: {
        name: kolResolved.name || kol.name || '?',
        wallet: kolResolved.wallet || kol.wallet || wallet?.slice(0, 8) + '...',
        full: wallet,
        winRate: kolResolved.winRate ?? kol.winRate ?? 0,
        rank: kolResolved.rank ?? kol.rank ?? '?',
        pnl: kolResolved.pnl ?? kol.pnl ?? 0,
      },
      tradeType: (t.type || 'buy').toLowerCase(),
      signature: t.signature || null,
      _ts: t._ts || null,
    };
  });

  // Se não houver trades reais, adicionar amostras sintéticas
  if (exported.length === 0) {
    exported.push(
      {
        ca: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        name: 'USD Coin',
        symbol: 'USDC',
        marketCap: 0,
        liquidity: 0,
        volume24h: 0,
        buys: 0,
        sells: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        kol: { name: 'Santos', wallet: 'DXwu...GFH', full: 'DXwuEuLCjq44dHJtBNc6cNGyduHrQ7YwJSZdP69VXGFH', winRate: 72, rank: 3, pnl: 1500 },
        tradeType: 'buy',
        signature: null,
        _ts: null,
      },
      {
        ca: 'So11111111111111111111111111111111111111112',
        name: 'Wrapped SOL',
        symbol: 'SOL',
        marketCap: 80000000,
        liquidity: 2500000,
        volume24h: 5000000,
        buys: 1200,
        sells: 950,
        priceChange1h: 2.5,
        priceChange24h: -1.2,
        kol: { name: 'ZecaPiranha', wallet: 'EHP4...UCB', full: 'EHP4W8X5kwXK1EQHQwy3gGRZzbfYAbST2jJpxVELPUCB', winRate: 65, rank: 5, pnl: 800 },
        tradeType: 'buy',
        signature: null,
        _ts: null,
      }
    );
  }

  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(exported, null, 2), 'utf8');
  console.log(`[export] ${exported.length} trades exportados para ${OUTPUT}`);
  console.log('[export] Use o prompt em prompt_for_human_analysis.md para gerar análises com GPT.');
  console.log('[export] Depois: node scripts/convert_to_dataset.js raw_trades_with_analyses.json');
}

main();
