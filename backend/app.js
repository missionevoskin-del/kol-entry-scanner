/**
 * Express app - KOL Entry Scanner (Solana only)
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const logger = require('./logger');
const { getKols, recomputeRanksByPnl, addKol, removeKol, getKolByWallet, getSolanaWallets } = require('./wallets');
const { getTokenData } = require('./dexscreener');
const { getRecentTrades } = require('./tradesStore');
const { analyzeToken } = require('./openai');
const { calculateWalletPnL, updateKolPnL } = require('./pnlCalculator');
const { getStats: getTrackerStats, forceRefreshAll, getKolsByTier } = require('./pnlTracker');
const { getCacheStats, clearAllCache } = require('./txCache');
const pnlCache = require('./pnlCache');

const app = express();

logger.info('app', 'Inicializando aplicação Express');

// ============================================
// Rate Limiting Middleware (simples, sem dependências extras)
// ============================================
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 req/min por IP

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  
  const record = rateLimitStore.get(ip);
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return next();
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({ 
      error: 'Rate limit excedido. Tente novamente em ' + retryAfter + 's', 
      retryAfter 
    });
  }
  
  record.count++;
  next();
}

// Aplicar rate limiting globalmente
app.use(rateLimitMiddleware);

// Limpeza periódica do rate limit store
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 1000);

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

  // Wallets COM atividade (trades > 0) vêm primeiro no ranking; sem registro vão pro final
  const hasActivity = (k) => (k.trades ?? 0) > 0 || (k.vol24 ?? 0) > 0;
  const byPnl = [...kols].sort((a, b) => {
    const actA = hasActivity(a) ? 1 : 0;
    const actB = hasActivity(b) ? 1 : 0;
    if (actB !== actA) return actB - actA;
    return (b.pnl - a.pnl) || (b.winRate - a.winRate) || a.name.localeCompare(b.name);
  });
  const byWinRate = [...kols].sort((a, b) => {
    const actA = hasActivity(a) ? 1 : 0;
    const actB = hasActivity(b) ? 1 : 0;
    if (actB !== actA) return actB - actA;
    return (b.winRate - a.winRate) || (b.pnl - a.pnl) || a.name.localeCompare(b.name);
  });

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

app.get('/health', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    helius: {
      configured: !!process.env.HELIUS_API_KEY,
      enabled: process.env.HELIUS_ENABLED === '1',
    },
    openai: {
      configured: !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
    },
    kols: getKols().length,
    trades: getRecentTrades(1, 24).length,
  };
  
  const allHealthy = Object.values(checks).every(v => 
    typeof v === 'boolean' ? v : true
  );
  
  logger.info('health', 'Health check realizado', { status: allHealthy ? 'healthy' : 'degraded', checks });
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

app.get('/api/trades/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
    const hours = parseInt(req.query.hours, 10) || 24;
    const trades = getRecentTrades(limit, hours);
    logger.debug('trades', 'Buscando trades recentes', { limit, hours, count: trades.length });
    res.json({ trades, count: trades.length });
  } catch (e) {
    logger.error('trades', 'Erro ao buscar trades recentes', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug-status', (req, res) => {
  const openaiKey = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  const hasKey = !!openaiKey && openaiKey.length > 10;
  res.json({
    openaiConfigured: hasKey,
    openaiKeyLength: openaiKey ? openaiKey.length : 0,
    hint: hasKey ? 'Chave detectada. Se a análise falha, verifique logs ou rate limit.' : 'Chave ausente ou inválida. No Railway: Variáveis → OPENAI_API_KEY → Redeploy.',
  });
});

app.get('/api/status', (req, res) => {
  const heliusKey = process.env.HELIUS_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '';
  
  const isHeliusValid = heliusKey.length > 20 && !heliusKey.includes('sua_chave') && !heliusKey.includes('placeholder');
  const isOpenAIValid = openaiKey.length > 10 && !openaiKey.includes('sua_chave') && !openaiKey.includes('sk-proj-sua') && !openaiKey.includes('your-key');
  const hasAnalysis = isOpenAIValid;
  
  res.json({
    helius: isHeliusValid,
    openai: isOpenAIValid,
    hasAnalysis,
    heliusEnabled: process.env.HELIUS_ENABLED === '1',
    solPrice: parseFloat(process.env.SOL_PRICE) || null,
    kols: getKols().length,
  });
});

app.get('/api/kols/pnl', (req, res) => {
  try {
    const period = (req.query.period || 'daily').toLowerCase();
    const validPeriods = ['daily', 'weekly', 'monthly'];
    const p = validPeriods.includes(period) ? period : 'daily';
    const cached = pnlCache.get(p);
    if (cached) {
      return res.json(cached);
    }
    const kols = rankKolsForPeriod(p);
    const payload = { period: p, count: kols.length, kols, updatedAt: new Date().toISOString() };
    pnlCache.set(p, payload);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const refreshPnlLastCall = { ts: 0 };
const REFRESH_PNL_COOLDOWN_MS = 90 * 1000;

app.post('/api/kols/refresh-pnl', async (req, res) => {
  try {
    const now = Date.now();
    if (now - refreshPnlLastCall.ts < REFRESH_PNL_COOLDOWN_MS) {
      const waitSec = Math.ceil((REFRESH_PNL_COOLDOWN_MS - (now - refreshPnlLastCall.ts)) / 1000);
      return res.status(429).json({ error: `Aguarde ${waitSec}s para novo refresh`, retryAfter: waitSec });
    }
    refreshPnlLastCall.ts = now;
    const period = (req.body.period || 'daily').toLowerCase();
    const p = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'daily';
    const results = await forceRefreshAll(p);
    if (p === 'daily') recomputeRanksByPnl();
    pnlCache.invalidate(p);
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

// ============================================
// Validação de Input para /api/analyze
// ============================================
function validateAnalyzeRequest(body) {
  const errors = [];
  
  if (!body.token || typeof body.token !== 'object') {
    errors.push('token é obrigatório e deve ser um objeto');
  } else if (!body.token.ca || typeof body.token.ca !== 'string') {
    errors.push('token.ca (contract address) é obrigatório');
  } else if (body.token.ca.length < 32) {
    errors.push('token.ca parece inválido (muito curto para Solana)');
  }
  
  if (!body.kol || typeof body.kol !== 'object') {
    errors.push('kol é obrigatório e deve ser um objeto');
  } else if (!body.kol.name) {
    errors.push('kol.name é obrigatório');
  }
  
  if (body.tradeType && !['buy', 'sell'].includes(body.tradeType)) {
    errors.push('tradeType deve ser "buy" ou "sell"');
  }
  
  if (body.customPrompt && typeof body.customPrompt !== 'string') {
    errors.push('customPrompt deve ser uma string');
  } else if (body.customPrompt && body.customPrompt.length > 1000) {
    errors.push('customPrompt muito longo (máx 1000 caracteres)');
  }
  
  return errors;
}

app.post('/api/analyze', async (req, res) => {
  try {
    // Validar input
    const validationErrors = validateAnalyzeRequest(req.body);
    if (validationErrors.length > 0) {
      logger.warn('analyze', 'Dados inválidos recebidos', { errors: validationErrors });
      return res.status(400).json({ error: 'Dados inválidos', details: validationErrors });
    }
    
    const { token, kol, tradeType, customPrompt } = req.body;
    const openaiKey = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
    if (!openaiKey || openaiKey.length < 10) {
      logger.warn('analyze', 'OPENAI_API_KEY ausente ou inválida');
      return res.json({ veredito: 'NEUTRO', confianca: 0, resumo: 'Análise indisponível' });
    }
    logger.info('analyze', 'Iniciando análise de token', { ca: token.ca?.slice(0, 8), kol: kol.name, tradeType });
    const result = await analyzeToken(token, kol, tradeType || 'buy', customPrompt || '');
    if (!result) logger.warn('analyze', 'analyzeToken retornou null');
    logger.info('analyze', 'Análise concluída', { veredito: result?.veredito, confianca: result?.confianca });
    res.json(result || { veredito: 'NEUTRO', confianca: 0, resumo: 'Análise indisponível' });
  } catch (e) {
    logger.error('analyze', 'Erro durante análise', { error: e.message, stack: e.stack });
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
      tiers: {
        top5: tiers.top5.map(k => k.name),
        mid5: tiers.mid5.map(k => k.name),
        bottom5: tiers.bottom5.map(k => k.name),
        extra5: (tiers.extra5 || []).map(k => k.name),
      },
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

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
}
app.get('/', (req, res) => res.redirect('/index.html'));

module.exports = app;
