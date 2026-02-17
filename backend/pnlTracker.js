/**
 * Sistema de Polling Escalonado para PnL
 * - Top 5 KOLs: polling a cada 10 minutos
 * - KOLs 6-10: polling a cada 20 minutos  
 * - KOLs 11-15: polling a cada 30 minutos
 * - Horário reduzido (00h-06h): metade da frequência
 * 
 * Otimizado para plano Free do Helius (100k requests/mês)
 * Estimativa: ~40.000 requests/mês (40% do limite)
 */
const { getKols, recomputeRanksByPnl } = require('./wallets');
const { updateKolPnL } = require('./pnlCalculator');
const { getCacheStats } = require('./txCache');

// Intervalos de polling em ms
const POLL_INTERVALS = {
  TOP_5: 10 * 60 * 1000,      // 10 minutos
  MID_5: 20 * 60 * 1000,      // 20 minutos
  BOTTOM_5: 30 * 60 * 1000,   // 30 minutos
};

// Multiplicador para horário de baixa atividade (00h-06h)
const NIGHT_MULTIPLIER = 2;

// Timers ativos
let timers = {
  top5: null,
  mid5: null,
  bottom5: null,
};

// Estatísticas de uso
let stats = {
  requestsToday: 0,
  requestsTotal: 0,
  lastReset: Date.now(),
  lastPoll: {},
};

// Callback para notificar atualizações
let onUpdateCallback = null;

/**
 * Verifica se é horário de baixa atividade (00h-06h)
 */
function isNightTime() {
  const hour = new Date().getHours();
  return hour >= 0 && hour < 6;
}

/**
 * Obtém o intervalo ajustado para o horário
 */
function getAdjustedInterval(baseInterval) {
  return isNightTime() ? baseInterval * NIGHT_MULTIPLIER : baseInterval;
}

/**
 * Agrupa KOLs por tier de polling
 */
function getKolsByTier() {
  const kols = getKols().filter(k => k.chain === 'SOL' && k.full);
  
  // Ordenar por rank
  const sorted = [...kols].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  
  return {
    top5: sorted.slice(0, 5),
    mid5: sorted.slice(5, 10),
    bottom5: sorted.slice(10, 15),
    all: sorted,
  };
}

/**
 * Atualiza PnL de um grupo de KOLs
 */
async function pollKolGroup(kols, groupName, period = 'daily') {
  if (!kols || kols.length === 0) return;

  console.log(`[pnlTracker] Polling ${groupName}: ${kols.length} wallets`);
  
  const results = [];
  
  for (const kol of kols) {
    try {
      const updated = await updateKolPnL(kol, period);
      results.push(updated);
      stats.requestsToday++;
      stats.requestsTotal++;
      
      // Pequeno delay entre requests
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.warn(`[pnlTracker] Erro ao atualizar ${kol.name}:`, e.message);
      results.push(kol);
    }
  }

  stats.lastPoll[groupName] = Date.now();

  recomputeRanksByPnl();
  if (onUpdateCallback && results.length > 0) {
    const allKols = getKols();
    onUpdateCallback(allKols, groupName);
  }

  return results;
}

/**
 * Inicia polling para Top 5 KOLs
 */
function startTop5Polling() {
  const poll = async () => {
    const { top5 } = getKolsByTier();
    await pollKolGroup(top5, 'top5');
    
    // Reagendar com intervalo ajustado
    const interval = getAdjustedInterval(POLL_INTERVALS.TOP_5);
    timers.top5 = setTimeout(poll, interval);
  };
  
  // Primeira execução após 30 segundos
  timers.top5 = setTimeout(poll, 30 * 1000);
}

/**
 * Inicia polling para KOLs 6-10
 */
function startMid5Polling() {
  const poll = async () => {
    const { mid5 } = getKolsByTier();
    await pollKolGroup(mid5, 'mid5');
    
    const interval = getAdjustedInterval(POLL_INTERVALS.MID_5);
    timers.mid5 = setTimeout(poll, interval);
  };
  
  // Primeira execução após 2 minutos
  timers.mid5 = setTimeout(poll, 2 * 60 * 1000);
}

/**
 * Inicia polling para KOLs 11-15
 */
function startBottom5Polling() {
  const poll = async () => {
    const { bottom5 } = getKolsByTier();
    await pollKolGroup(bottom5, 'bottom5');
    
    const interval = getAdjustedInterval(POLL_INTERVALS.BOTTOM_5);
    timers.bottom5 = setTimeout(poll, interval);
  };
  
  // Primeira execução após 4 minutos
  timers.bottom5 = setTimeout(poll, 4 * 60 * 1000);
}

/**
 * Reset diário do contador de requests
 */
function startDailyReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    console.log(`[pnlTracker] Reset diário: ${stats.requestsToday} requests ontem`);
    stats.requestsToday = 0;
    stats.lastReset = Date.now();
    
    // Reiniciar reset para próxima meia-noite
    startDailyReset();
  }, msUntilMidnight);
}

/**
 * Inicia o sistema de polling escalonado
 */
function start(callback) {
  onUpdateCallback = callback;
  
  console.log('[pnlTracker] Iniciando polling escalonado...');
  console.log('[pnlTracker] Top 5: 10min | Mid 5: 20min | Bottom 5: 30min');
  console.log('[pnlTracker] Horário noturno (00h-06h): frequência reduzida pela metade');
  
  startTop5Polling();
  startMid5Polling();
  startBottom5Polling();
  startDailyReset();
  
  // Log de estatísticas a cada hora
  setInterval(() => {
    const cacheStats = getCacheStats();
    console.log(`[pnlTracker] Stats: ${stats.requestsToday} requests hoje | ${cacheStats.walletsTracked} wallets em cache`);
  }, 60 * 60 * 1000);
}

/**
 * Para todos os timers de polling
 */
function stop() {
  if (timers.top5) clearTimeout(timers.top5);
  if (timers.mid5) clearTimeout(timers.mid5);
  if (timers.bottom5) clearTimeout(timers.bottom5);
  timers = { top5: null, mid5: null, bottom5: null };
  console.log('[pnlTracker] Polling parado');
}

/**
 * Força atualização imediata de todas as wallets
 */
async function forceRefreshAll(period = 'daily') {
  const { all } = getKolsByTier();
  console.log(`[pnlTracker] Forçando atualização de ${all.length} wallets...`);
  return await pollKolGroup(all, 'force', period);
}

/**
 * Obtém estatísticas de uso
 */
function getStats() {
  const { all } = getKolsByTier();
  return {
    ...stats,
    isNightMode: isNightTime(),
    walletsTracked: all.length,
    estimatedMonthlyRequests: Math.round(stats.requestsToday * 30),
    freeplanUsage: Math.round((stats.requestsToday * 30 / 100000) * 100) + '%',
    intervals: {
      top5: `${POLL_INTERVALS.TOP_5 / 60000}min`,
      mid5: `${POLL_INTERVALS.MID_5 / 60000}min`,
      bottom5: `${POLL_INTERVALS.BOTTOM_5 / 60000}min`,
    },
    lastPolls: stats.lastPoll,
  };
}

module.exports = {
  start,
  stop,
  forceRefreshAll,
  getStats,
  getKolsByTier,
};
