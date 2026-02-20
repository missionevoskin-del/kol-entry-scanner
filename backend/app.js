/**
 * Express app - KOL Entry Scanner (Solana only)
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { getKols, recomputeRanksByPnl, addKol, removeKol, getKolByWallet, getSolanaWallets } = require('./wallets');
const { getTokenData } = require('./dexscreener');
const { getRecentTrades } = require('./tradesStore');
const { analyzeToken } = require('./openai');
const { calculateWalletPnL, updateKolPnL } = require('./pnlCalculator');
const { getStats: getTrackerStats, forceRefreshAll, getKolsByTier } = require('./pnlTracker');
const { getCacheStats, clearAllCache } = require('./txCache');

const app = express();
app.use(cors());
app.use(express.json());

function rankKolsForPeriod(period = 'daily') {
  const periodName = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'daily';
  const kols = getKols().map((k) => {
    const periodMetrics = k.metrics?.[periodName];
    const fallback = k._pnlPeriod === periodName ? {
      pnl: k.pnl,
      winRate: k.winRate,
      trades: k.trades,
      volume: k.vol24,
      updatedAt: k._pnlUpdated,
    } : null;
    const m = periodMetrics || fallback || { pnl: 0, winRate: 0, trades: 0, volume: 0, updatedAt: null };
    return {
      ...k,
      pnl: Number(m.pnl || 0),
      winRate: Number(m.winRate || 0),
      trades: Number(m.trades || 0),
      vol24: Number(m.volume || 0),
      _pnlPeriod: periodName,
      _pnlUpdated: m.updatedAt || null,
    };
  });

  const byPnl = [...kols].sort((a, b) =>
    (b.pnl - a.pnl) ||
    (b.winRate - a.winRate) ||
    a.name.localeCompare(b.name)
  );
  const byWinRate = [...kols].sort((a, b) =>
    (b.winRate - a.winRate) ||
    (b.pnl - a.pnl) ||
    a.name.localeCompare(b.name)
  );

  const rankPnl = new Map(byPnl.map((k, i) => [k.id, i + 1]));
  const rankWinRate = new Map(byWinRate.map((k, i) => [k.id, i + 1]));

  return kols
    .map((k) => ({
      ...k,
      full: k.full || (k.wallet && String(k.wallet).length > 25 ? k.wallet : k.full),
      rank: rankPnl.get(k.id) || 999,
      rankPnl: rankPnl.get(k.id) || 999,
      rankWinRate: rankWinRate.get(k.id) || 999,
    }))
    .sort((a, b) => a.rankPnl - b.rankPnl);
}

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/trades/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 120, 200);
    const trades = getRecentTrades(limit);
    res.json({ trades, count: trades.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    helius: !!process.env.HELIUS_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    kols: getKols().length,
  });
});

app.get('/api/kols/pnl', (req, res) => {
  try {
    const period = (req.query.period || 'daily').toLowerCase();
    const validPeriods = ['daily', 'weekly', 'monthly'];
    const p = validPeriods.includes(period) ? period : 'daily';
    const kols = rankKolsForPeriod(p);
    res.json({ period: p, count: kols.length, kols, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kols/refresh-pnl', async (req, res) => {
  try {
    const period = (req.body.period || 'daily').toLowerCase();
    const p = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'daily';
    const results = await forceRefreshAll(p);
    if (p === 'daily') recomputeRanksByPnl();
    res.json({ ok: true, period: p, updated: results?.length || 0, message: 'PnL atualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/kols', (req, res) => {
  try {
    res.json(rankKolsForPeriod('daily'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/token/:ca', async (req, res) => {
  try {
    const data = await getTokenData(req.params.ca);
    if (!data) return res.status(404).json({ error: 'Token não encontrado' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { token, kol, tradeType, customPrompt } = req.body;
    if (!token?.ca || !kol) return res.status(400).json({ error: 'token e kol obrigatórios' });
    const result = await analyzeToken(token, kol, tradeType || 'buy', customPrompt || '');
    res.json(result || { veredito: 'NEUTRO', confianca: 0, resumo: 'Análise indisponível' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pnl/:wallet', async (req, res) => {
  try {
    const period = (req.query.period || 'daily').toLowerCase();
    if (!['daily', 'weekly', 'monthly'].includes(period)) return res.status(400).json({ error: 'Período inválido' });
    const pnlData = await calculateWalletPnL(req.params.wallet, period);
    res.json({ wallet: req.params.wallet, period, ...pnlData, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tracker/stats', (req, res) => {
  try {
    const trackerStats = getTrackerStats();
    const cacheStats = getCacheStats();
    const tiers = getKolsByTier();
    res.json({
      tracker: trackerStats,
      cache: cacheStats,
      tiers: { top5: tiers.top5.map(k => k.name), mid5: tiers.mid5.map(k => k.name), bottom5: tiers.bottom5.map(k => k.name) },
      optimization: { plan: 'Helius Free', strategy: 'Polling escalonado', nightMode: trackerStats.isNightMode ? 'Ativo' : 'Inativo' },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cache/clear', (req, res) => {
  try {
    clearAllCache();
    res.json({ ok: true, message: 'Cache limpo' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.redirect('/index.html'));

module.exports = app;
