/**
 * Calculador de PnL por período
 * - Calcula PnL diário, semanal e mensal
 * - Usa histórico de trades armazenado
 * - Busca dados históricos do Helius quando necessário
 */
const axios = require('axios');
const { getTrades } = require('./tradesStore');
const { getLastSignature, updateLastSignature } = require('./txCache');

const HELIUS_API = 'https://api.helius.xyz';

// Períodos em millisegundos
const PERIODS = {
  daily: 24 * 60 * 60 * 1000,        // 24 horas
  weekly: 7 * 24 * 60 * 60 * 1000,   // 7 dias
  monthly: 30 * 24 * 60 * 60 * 1000, // 30 dias
};

/**
 * Busca histórico de transações de uma wallet no Helius
 * Busca todas as transações recentes para calcular PnL corretamente
 */
async function fetchWalletHistory(walletAddr, limit = 100) {
  // Helius desativado por padrão — HELIUS_ENABLED=1 para reativar
  if (process.env.HELIUS_ENABLED !== '1' && process.env.HELIUS_ENABLED !== 'true') {
    return [];
  }
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    console.warn('[pnlCalc] HELIUS_API_KEY não configurada');
    return [];
  }

  try {
    // Buscar apenas SWAPs (formato compatível com Helius Enhanced Transactions)
    const url = `${HELIUS_API}/v0/addresses/${walletAddr}/transactions?api-key=${key}&type=SWAP&limit=${limit}`;
    
    console.log(`[pnlCalc] Buscando SWAPs: ${walletAddr.slice(0, 8)}...`);
    const { data } = await axios.get(url, { timeout: 15000 });
    
    if (!Array.isArray(data)) {
      console.warn('[pnlCalc] Resposta inválida do Helius');
      return [];
    }

    console.log(`[pnlCalc] ${walletAddr.slice(0, 8)}: ${data.length} transações encontradas`);
    
    // Atualizar cache com a signature mais recente
    if (data.length > 0 && data[0]?.signature) {
      updateLastSignature(walletAddr, data[0].signature);
    }

    return data;
  } catch (e) {
    console.warn('[pnlCalc] Erro ao buscar histórico:', walletAddr.slice(0, 8), e.message);
    return [];
  }
}

/**
 * Parseia uma transação para extrair valor (SWAP, TRANSFER, etc)
 */
function parseSwapValue(tx) {
  if (!tx) return null;

  const type = (tx.type || '').toUpperCase();
  if (!type.includes('SWAP')) return null;

  const tokenTransfers = tx.tokenTransfers || [];
  const nativeTransfers = tx.nativeTransfers || [];
  const feePayer = (tx.feePayer || '').toString();

  // Fallback: tokenBalanceChanges (alguns formatos Helius)
  const balanceChanges = tx.accountData?.flatMap((a) => a.tokenBalanceChanges || []) || [];

  let valueSol = 0;
  let valueUsdc = 0;
  let direction = 'buy';
  let tokenMint = null;

  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  for (const t of tokenTransfers) {
    const from = (t.fromUserAccount || t.fromTokenAccount || '').toString();
    const to = (t.toUserAccount || t.toTokenAccount || '').toString();
    const mint = (t.mint || t.tokenAddress || '').toString();

    if (mint && mint !== SOL_MINT) {
      tokenMint = mint;
      if (from === feePayer || (feePayer && from.startsWith(feePayer.slice(0, 8)))) direction = 'sell';
      else if (to === feePayer || (feePayer && to.startsWith(feePayer.slice(0, 8)))) direction = 'buy';
    }

    const sym = (t.tokenSymbol || '').toUpperCase();
    if (sym === 'USDC' || sym === 'USDT') {
      valueUsdc += Math.abs(parseFloat(t.tokenAmount) || parseFloat(t.amount) || 0);
    }
  }

  // Fallback tokenBalanceChanges
  if (valueUsdc === 0 && balanceChanges.length > 0) {
    for (const b of balanceChanges) {
      const mint = (b.mint || b.tokenAddress || '').toString();
      if (mint && mint !== SOL_MINT) tokenMint = tokenMint || mint;
      const amt = Math.abs(parseFloat(b.tokenAmount) || parseFloat(b.amount) || 0);
      if (amt > 0) valueUsdc += amt;
    }
  }

  for (const t of nativeTransfers || []) {
    const amount = Math.abs((t.amount || 0) / 1e9);
    if (amount > 0.0001) valueSol += amount;
  }

  const solPrice = parseFloat(process.env.SOL_PRICE) || 170;
  const valUsd = valueUsdc > 0 ? valueUsdc : valueSol * solPrice;

  if (valUsd < 1 || !tokenMint) return null;

  return {
    signature: tx.signature,
    timestamp: tx.timestamp ? (typeof tx.timestamp === 'number' ? tx.timestamp * 1000 : tx.timestamp) : Date.now(),
    type: direction,
    tokenMint,
    valueSol,
    valueUsdc,
    valUsd,
    feePayer,
  };
}

/**
 * Calcula PnL de uma wallet baseado no histórico de trades
 */
function calculatePnLFromTrades(trades, periodMs) {
  const now = Date.now();
  const cutoff = now - periodMs;

  // Filtrar trades do período
  const periodTrades = trades.filter(t => {
    const ts = t._ts || t.timestamp || 0;
    return ts >= cutoff;
  });

  if (periodTrades.length === 0) {
    return { pnl: 0, trades: 0, wins: 0, losses: 0, winRate: 0, volume: 0 };
  }

  // Agrupar por token para calcular PnL
  const tokenPnL = {};
  let totalVolume = 0;

  for (const trade of periodTrades) {
    const mint = trade.ca || trade.mint || trade.tokenMint || 'unknown';
    const val = trade.valUsd || 0;
    const type = trade.type;

    if (!tokenPnL[mint]) {
      tokenPnL[mint] = { buys: 0, sells: 0, buyValue: 0, sellValue: 0 };
    }

    if (type === 'buy') {
      tokenPnL[mint].buys++;
      tokenPnL[mint].buyValue += val;
    } else {
      tokenPnL[mint].sells++;
      tokenPnL[mint].sellValue += val;
    }

    totalVolume += val;
  }

  // Calcular PnL total e estatísticas
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;

  for (const mint of Object.keys(tokenPnL)) {
    const { buyValue, sellValue } = tokenPnL[mint];
    const pnl = sellValue - buyValue;
    totalPnL += pnl;

    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  }

  const totalTokens = Object.keys(tokenPnL).length;
  const winRate = totalTokens > 0 ? Math.round((wins / totalTokens) * 100) : 0;

  return {
    pnl: Math.round(totalPnL),
    trades: periodTrades.length,
    wins,
    losses,
    winRate,
    volume: Math.round(totalVolume),
  };
}

/**
 * Calcula PnL de uma wallet para um período específico
 * Combina dados locais + histórico do Helius
 */
async function calculateWalletPnL(walletAddr, period = 'daily') {
  const periodMs = PERIODS[period] || PERIODS.daily;

  // 1. Pegar trades locais
  const allTrades = getTrades();
  const walletTrades = allTrades.filter(t => 
    t.kol?.full === walletAddr || 
    t.feePayer === walletAddr
  );

  // 2. Buscar histórico adicional do Helius (se necessário)
  let heliusTrades = [];
  try {
    const history = await fetchWalletHistory(walletAddr, 30);
    heliusTrades = history
      .map(parseSwapValue)
      .filter(Boolean)
      .map(t => ({ ...t, _ts: t.timestamp }));
  } catch (e) {
    console.warn('[pnlCalc] Erro ao buscar Helius:', e.message);
  }

  // 3. Combinar trades (evitar duplicatas por signature)
  const seenSigs = new Set();
  const combinedTrades = [];

  for (const t of walletTrades) {
    const sig = t.signature || `local-${t._ts}`;
    if (!seenSigs.has(sig)) {
      seenSigs.add(sig);
      combinedTrades.push(t);
    }
  }

  for (const t of heliusTrades) {
    if (!seenSigs.has(t.signature)) {
      seenSigs.add(t.signature);
      combinedTrades.push(t);
    }
  }

  // 4. Calcular PnL
  return calculatePnLFromTrades(combinedTrades, periodMs);
}

/**
 * Calcula PnL de todas as wallets para um período
 */
async function calculateAllWalletsPnL(wallets, period = 'daily') {
  const results = [];

  for (const wallet of wallets) {
    const addr = wallet.full || wallet;
    const pnlData = await calculateWalletPnL(addr, period);
    
    results.push({
      wallet: addr,
      name: wallet.name || 'Unknown',
      ...pnlData,
    });

    // Pequeno delay para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

/**
 * Atualiza PnL de um KOL com dados do período
 */
async function updateKolPnL(kol, period = 'daily') {
  if (!kol.full) {
    console.warn('[pnlCalc] KOL sem endereço completo:', kol.name);
    return kol;
  }

  try {
    const pnlData = await calculateWalletPnL(kol.full, period);
    const updatedAt = Date.now();
    kol.metrics = kol.metrics || {};
    kol.metrics[period] = {
      pnl: pnlData.pnl,
      winRate: pnlData.winRate,
      trades: pnlData.trades,
      volume: pnlData.volume,
      updatedAt,
    };
    
    // Manter campos legados sincronizados com o último período atualizado.
    kol.pnl = pnlData.pnl;
    kol.winRate = pnlData.winRate;
    kol.trades = pnlData.trades;
    kol.vol24 = pnlData.volume;
    kol._pnlUpdated = updatedAt;
    kol._pnlPeriod = period;
    
    console.log(`[pnlCalc] ${kol.name}: PnL=${pnlData.pnl} | WR=${pnlData.winRate}% | Trades=${pnlData.trades}`);
    
    return kol;
  } catch (e) {
    console.warn('[pnlCalc] Erro ao atualizar KOL:', kol.name, e.message);
    return kol;
  }
}

module.exports = {
  calculateWalletPnL,
  calculateAllWalletsPnL,
  updateKolPnL,
  fetchWalletHistory,
  PERIODS,
};
