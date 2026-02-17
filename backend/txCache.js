/**
 * Cache inteligente de transações
 * - Armazena últimas signatures processadas por wallet
 * - Evita reprocessar transações antigas
 * - Otimiza uso da API Helius
 */
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'tx-cache.json');

// Estrutura: { walletAddress: { lastSignature, lastProcessed, txCount } }
let cache = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(data);
    }
  } catch (e) {
    console.warn('[txCache] Erro ao carregar cache:', e.message);
    cache = {};
  }
  return cache;
}

function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn('[txCache] Erro ao salvar cache:', e.message);
  }
}

/**
 * Obtém a última signature processada de uma wallet
 */
function getLastSignature(walletAddr) {
  return cache[walletAddr]?.lastSignature || null;
}

/**
 * Atualiza o cache com a última signature processada
 */
function updateLastSignature(walletAddr, signature) {
  if (!cache[walletAddr]) {
    cache[walletAddr] = { txCount: 0 };
  }
  cache[walletAddr].lastSignature = signature;
  cache[walletAddr].lastProcessed = Date.now();
  cache[walletAddr].txCount++;
  
  // Salvar a cada 10 transações para não sobrecarregar o disco
  if (cache[walletAddr].txCount % 10 === 0) {
    saveCache();
  }
}

/**
 * Obtém estatísticas do cache
 */
function getCacheStats() {
  const wallets = Object.keys(cache);
  const totalTx = wallets.reduce((sum, w) => sum + (cache[w]?.txCount || 0), 0);
  return {
    walletsTracked: wallets.length,
    totalTransactions: totalTx,
    lastSaved: getLastSaveTime(),
  };
}

function getLastSaveTime() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      return stats.mtime.toISOString();
    }
  } catch (e) {}
  return null;
}

/**
 * Limpa o cache de uma wallet específica
 */
function clearWalletCache(walletAddr) {
  delete cache[walletAddr];
  saveCache();
}

/**
 * Limpa todo o cache
 */
function clearAllCache() {
  cache = {};
  saveCache();
}

// Carregar cache ao iniciar
loadCache();

// Salvar periodicamente (a cada 5 minutos)
setInterval(saveCache, 5 * 60 * 1000);

module.exports = {
  getLastSignature,
  updateLastSignature,
  getCacheStats,
  clearWalletCache,
  clearAllCache,
  loadCache,
  saveCache,
};
