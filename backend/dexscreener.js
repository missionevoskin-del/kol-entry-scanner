/**
 * DexScreener API - cache 5min para respeitar rate limit (300 req/min)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'token_cache.json');
const TTL_MS = 5 * 60 * 1000; // 5 minutos

let cache = {};

function loadCache() {
  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    cache = JSON.parse(data);
  } catch {
    cache = {};
  }
}

function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0), 'utf8');
  } catch (e) {
    console.warn('[dexscreener] Erro ao salvar cache:', e.message);
  }
}

function getCached(ca) {
  const entry = cache[ca];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    delete cache[ca];
    return null;
  }
  return entry.data;
}

function setCached(ca, data) {
  cache[ca] = { data, ts: Date.now() };
  saveCache();
}

/**
 * Busca dados do token via DexScreener
 * @param {string} ca - Contract Address (token mint)
 * @returns {Promise<object|null>}
 */
async function getTokenData(ca) {
  if (!ca) return null;

  loadCache();
  const cached = getCached(ca);
  if (cached) return cached;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${ca}`;
    const { data } = await axios.get(url, { timeout: 8000 });

    if (!data?.pairs?.length) return null;

    // Par com maior liquidez
    const pairs = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = pairs[0];

    const result = {
      name: p.baseToken?.name || 'Unknown',
      symbol: p.baseToken?.symbol || '?',
      logo: p.info?.imageUrl || null,
      priceUsd: parseFloat(p.priceUsd) || 0,
      marketCap: p.fdv || p.marketCap || 0,
      liquidity: p.liquidity?.usd || 0,
      volume24h: p.volume?.h24 || 0,
      priceChange1h: p.priceChange?.h1 || 0,
      priceChange6h: p.priceChange?.h6 || 0,
      priceChange24h: p.priceChange?.h24 || 0,
      buys: p.txns?.h24?.buys || 0,
      sells: p.txns?.h24?.sells || 0,
      pairAddress: p.pairAddress,
      dexId: p.dexId,
      url: p.url,
    };

    setCached(ca, result);
    return result;
  } catch (e) {
    console.warn('[dexscreener] Erro ao buscar token', ca, e.message);
    return null;
  }
}

module.exports = { getTokenData, loadCache };
