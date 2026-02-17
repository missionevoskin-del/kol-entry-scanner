/**
 * Express app - KOL Entry Scanner (Solana only)
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { getKols, recomputeRanksByPnl, addKol, removeKol, getKolByWallet, getSolanaWallets } = require('./wallets');
const { getTokenData } = require('./dexscreener');
const { analyzeToken } = require('./openai');
const { calculateWalletPnL, updateKolPnL } = require('./pnlCalculator');
const { getStats: getTrackerStats, forceRefreshAll, getKolsByTier } = require('./pnlTracker');
const { getCacheStats, clearAllCache } = require('./txCache');

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
}

app.get('/health', (req, res) => res.json({ ok: true }));

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
    recomputeRanksByPnl();
    const kols = getKols();
    res.json({ period: p, count: kols.length, kols, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kols/refresh-pnl', async (req, res) => {
  try {
    const period = (req.body.period || 'daily').toLowerCase();
    const results = await forceRefreshAll(period);
    recomputeRanksByPnl();
    res.json({ ok: true, period, updated: results?.length || 0, message: 'PnL atualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/kols', (req, res) => {
  try {
    res.json(getKols());
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
    const { token, kol, tradeType } = req.body;
    if (!token?.ca || !kol) return res.status(400).json({ error: 'token e kol obrigatórios' });
    const result = await analyzeToken(token, kol, tradeType || 'buy');
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
