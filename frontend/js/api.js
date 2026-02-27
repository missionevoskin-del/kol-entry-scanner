/**
 * Funções de API - KOL Entry Scanner BR
 * Centraliza todas as requisições fetch
 */

import { API_BASE } from './config.js';

/**
 * Busca dados do token (prioriza API interna, fallback DexScreener direto)
 * @param {string} ca - Contract Address
 * @param {string} chain - Chain (default solana)
 */
export async function fetchTokenData(ca, chain = 'solana') {
  try {
    const r = await fetch(`${API_BASE || ''}/api/token/${ca}`);
    if (r.ok) {
      const d = await r.json();
      return {
        name: d.name,
        symbol: d.symbol,
        priceUsd: d.priceUsd,
        mc: d.marketCap,
        liq: d.liquidity,
        vol24: d.volume24h,
        buys: d.buys,
        sells: d.sells,
        change24: d.priceChange24h,
        change1h: d.priceChange1h,
        imageUrl: d.logo,
        pairAddr: d.pairAddress,
        dexId: d.dexId,
        url: d.url,
      };
    }
  } catch (e) {}
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.pairs?.length) return null;
    const pairs = d.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = pairs[0];
    return {
      name: p.baseToken?.name || '?',
      symbol: p.baseToken?.symbol || '?',
      priceUsd: parseFloat(p.priceUsd) || 0,
      mc: p.fdv || p.marketCap || 0,
      liq: p.liquidity?.usd || 0,
      vol24: p.volume?.h24 || 0,
      buys: p.txns?.h24?.buys || 0,
      sells: p.txns?.h24?.sells || 0,
      change24: p.priceChange?.h24 || 0,
      change1h: p.priceChange?.h1 || 0,
      pairAddr: p.pairAddress,
      dexId: p.dexId,
      url: p.url,
      imageUrl: p.info?.imageUrl || null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Análise de token via GPT-4o mini (sob demanda)
 * @param {object} tokenPayload
 * @param {object} kol
 * @param {string} tradeType
 * @param {string} customPrompt
 */
export async function analyzeTokenAI(tokenPayload, kol, tradeType, customPrompt) {
  try {
    const r = await fetch(`${API_BASE || ''}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenPayload,
        kol: kol || null,
        tradeType: tradeType || 'buy',
        customPrompt,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.veredito) return d;
    if (!r.ok && d?.error) {
      console.warn('[analyze]', r.status, d.error);
    }
  } catch (e) {
    console.warn('[analyze] Erro de rede:', e.message);
  }
  return null;
}

/**
 * Busca taxa USD/BRL
 */
export async function fetchBRLRate() {
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = await res.json();
    const rate = parseFloat(data?.USDBRL?.bid || data?.USDBRL?.ask);
    if (rate && !isNaN(rate)) return rate;
  } catch (e) {}
  return null;
}

/**
 * Status da API (Helius, OpenAI, KOLs)
 */
export async function fetchApiStatus() {
  try {
    const url = `${API_BASE || ''}/api/status`;
    const r = await fetch(url);
    if (r.ok) return await r.json();
  } catch (e) {}
  return { helius: false, openai: false, kols: 0 };
}

/**
 * Carrega KOLs com PnL do período
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 */
export async function fetchKolsPnL(period = 'daily') {
  try {
    const r = await fetch(`${API_BASE || ''}/api/kols/pnl?period=${period}`);
    if (r.ok) {
      const data = await r.json();
      return data?.kols || (Array.isArray(data) ? data : []);
    }
    if (r.status >= 500) console.warn('[api] /api/kols/pnl', r.status);
  } catch (e) {
    console.warn('[api] fetchKolsPnL:', e.message);
  }
  return null;
}

/**
 * Fallback: endpoint simples de KOLs (com retry)
 */
export async function fetchKols(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${API_BASE || ''}/api/kols`);
      if (r.ok) {
        const data = await r.json();
        return data?.kols ?? (Array.isArray(data) ? data : []);
      }
      if (r.status >= 500 && i === retries - 1) console.warn('[api] /api/kols', r.status);
    } catch (e) {
      if (i === retries - 1) console.warn('[api] fetchKols:', e.message);
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

/**
 * Força refresh de PnL no backend
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 */
/**
 * Busca PnL de uma wallet específica
 * @param {string} wallet - endereço Solana
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 */
export async function fetchWalletPnL(wallet, period = 'daily') {
  try {
    const r = await fetch(`${API_BASE || ''}/api/pnl/${encodeURIComponent(wallet)}?period=${period}`);
    if (r.ok) return await r.json();
  } catch (e) {}
  return null;
}

export async function refreshPnL(period = 'daily') {
  try {
    const r = await fetch(`${API_BASE || ''}/api/kols/refresh-pnl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period }),
    });
    if (r.status === 429) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Aguarde antes de atualizar novamente');
    }
    return r.ok;
  } catch (e) {
    throw e;
  }
}

/**
 * Busca últimos trades (persistidos + carregados no startup) com retry
 */
export async function fetchRecentTrades(limit = 60, hours = 24, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${API_BASE || ''}/api/trades/recent?limit=${limit}&hours=${hours}`);
      if (r.ok) {
        const d = await r.json();
        return d.trades || [];
      }
    } catch (e) {}
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return [];
}
