/**
 * Helius WebSocket - transações em tempo real + parse via Enhanced Transactions API
 * 
 * Otimizado para Helius Free Plan:
 * - WebSocket para trades em tempo real (não usa quota de requests)
 * - Cache de signatures para evitar reprocessar transações
 * - Reconexão automática com backoff exponencial
 */
const WebSocket = require('ws');
const axios = require('axios');
const { getSolanaWallets, getKolByWallet } = require('./wallets');
const { getTokenData } = require('./dexscreener');
const { updateLastSignature, getLastSignature } = require('./txCache');

let heliusWs = null;
let subscriptionId = null;
let onTradeCallback = null;
let reconnectTimer = null;
let pingInterval = null;
let reconnectAttempts = 0;

// URLs do Helius - usar RPC para WebSocket
const HELIUS_WS = 'wss://mainnet.helius-rpc.com';
const HELIUS_API = 'https://api.helius.xyz';

// Cache de signatures processadas para evitar duplicatas
const processedSignatures = new Set();
const MAX_PROCESSED_CACHE = 1000;

// Estatísticas de uso
const wsStats = {
  messagesReceived: 0,
  tradesProcessed: 0,
  duplicatesSkipped: 0,
  reconnections: 0,
  startedAt: null,
};

/**
 * Obtém URL do WebSocket
 * Prioridade: HELIUS_RPC_KEY > HELIUS_API_KEY
 */
function getWsUrl() {
  // Primeiro tenta a chave RPC específica
  const rpcKey = process.env.HELIUS_RPC_KEY;
  if (rpcKey) {
    console.log('[helius] Usando HELIUS_RPC_KEY para WebSocket');
    return `${HELIUS_WS}/?api-key=${rpcKey}`;
  }
  
  // Fallback para API key (pode não funcionar para WS)
  const apiKey = process.env.HELIUS_API_KEY;
  if (apiKey) {
    console.log('[helius] Usando HELIUS_API_KEY para WebSocket (fallback)');
    return `${HELIUS_WS}/?api-key=${apiKey}`;
  }
  
  return null;
}

/**
 * Busca transação parseada no Helius (tipo SWAP com tokenTransfers)
 */
async function fetchParsedTransaction(signature) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  const url = `https://api.helius.xyz/v0/transactions?api-key=${key}`;
  try {
    const { data } = await axios.post(url, { transactions: [signature] }, { timeout: 10000 });
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (e) {
    console.warn('[helius] Erro ao parsear tx:', e.message);
    return null;
  }
}

/**
 * Extrai swap de transação parseada Helius
 */
function parseSwapFromTx(parsed, walletAddr) {
  if (!parsed) return null;
  const txType = (parsed.type || '').toUpperCase();
  if (!txType.includes('SWAP')) return null;

  const kol = getKolByWallet(parsed.feePayer || walletAddr);
  if (!kol) return null;

  const tokenTransfers = parsed.tokenTransfers || [];
  const nativeTransfers = parsed.nativeTransfers || [];
  const feePayer = parsed.feePayer || walletAddr;

  let tokenMint = null;
  let valueSol = 0;
  let valueUsdc = 0;
  let direction = 'buy';

  for (const t of tokenTransfers) {
    const from = (t.fromUserAccount || t.fromTokenAccount || '').toString();
    const to = (t.toUserAccount || t.toTokenAccount || '').toString();
    const mint = (t.mint || t.tokenAddress || '').toString();

    if (mint && mint !== 'So11111111111111111111111111111111111111112') {
      tokenMint = mint;
      if (from === feePayer || from === walletAddr) direction = 'sell';
      else if (to === feePayer || to === walletAddr) direction = 'buy';
    }
    const sym = (t.tokenSymbol || '').toUpperCase();
    if (sym === 'USDC' || sym === 'USDT') {
      valueUsdc += Math.abs(parseFloat(t.tokenAmount) || parseFloat(t.amount) || 0);
    }
  }

  for (const t of nativeTransfers || []) {
    valueSol += Math.abs((t.amount || 0) / 1e9);
  }

  const valUsd = valueUsdc > 0 ? valueUsdc : valueSol * (parseFloat(process.env.SOL_PRICE) || 150);
  if (!tokenMint) return null;

  return {
    kol,
    mint: tokenMint,
    ca: tokenMint,
    type: direction,
    valueSol,
    valueUsdc,
    valUsd: valUsd || 100,
    dex: parsed.source || 'DEX',
    signature: parsed.signature,
  };
}

/**
 * Extrai endereço da wallet do result (fee payer = primeiro account)
 */
function getWalletFromResult(result) {
  const msg = result?.transaction?.transaction?.message || result?.transaction?.message;
  const keys = msg?.accountKeys || [];
  const first = keys[0];
  return typeof first === 'string' ? first : first?.pubkey || null;
}

/**
 * Processa notificação de transação do WebSocket
 * Otimizado: usa cache para evitar reprocessar signatures
 */
async function handleTransactionNotification(result) {
  if (!result?.signature) return;

  const signature = result.signature;
  
  // Verificar se já processamos esta signature (evitar duplicatas)
  if (processedSignatures.has(signature)) {
    wsStats.duplicatesSkipped++;
    return;
  }
  
  // Adicionar ao cache de processados
  processedSignatures.add(signature);
  
  // Limpar cache se ficar muito grande
  if (processedSignatures.size > MAX_PROCESSED_CACHE) {
    const toDelete = Array.from(processedSignatures).slice(0, 200);
    toDelete.forEach(sig => processedSignatures.delete(sig));
  }

  const walletAddr = getWalletFromResult(result);
  if (!walletAddr) return;

  const parsed = await fetchParsedTransaction(signature);
  const swap = parseSwapFromTx(parsed, walletAddr);
  if (!swap) return;

  // Atualizar cache de última signature da wallet
  updateLastSignature(walletAddr, signature);

  // Buscar dados do token no DexScreener
  const tokenData = await getTokenData(swap.mint);
  const tok = {
    ca: swap.mint,
    name: tokenData?.name || 'Unknown',
    symbol: tokenData?.symbol || '?',
    desc: 'Token',
    emoji: '●',
    kol: swap.kol,
    type: swap.type,
    valUsd: swap.valUsd,
    mc: tokenData?.marketCap || 0,
    liq: tokenData?.liquidity || 0,
    vol24h: tokenData?.volume24h || 0,
    buys: tokenData?.buys || 0,
    sells: tokenData?.sells || 0,
    change: tokenData?.priceChange24h || 0,
    imageUrl: tokenData?.logo,
    dex: swap.dex,
    signature: swap.signature,
    age: 'Agora',
    holders: 0,
    taxB: 0,
    taxS: 0,
    renounced: null,
    liqLocked: null,
    aiAnalysis: null,
    _ts: Date.now(),
  };

  wsStats.tradesProcessed++;

  // Análise IA removida - só é feita quando usuário clica no botão ANALISAR
  // tok.aiAnalysis permanece null até o usuário solicitar via /api/analyze

  if (onTradeCallback) onTradeCallback(tok);
}

function connect() {
  const url = getWsUrl();
  if (!url) {
    console.warn('[helius] HELIUS_API_KEY não configurada');
    return;
  }

  const wallets = getSolanaWallets();
  if (!wallets.length) {
    console.warn('[helius] Nenhuma wallet SOL para monitorar');
    return;
  }

  heliusWs = new WebSocket(url);

  heliusWs.on('open', () => {
    console.log('[helius] WebSocket conectado, inscrito em', wallets.length, 'wallets');

    heliusWs.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        { failed: false, accountInclude: wallets },
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }));

    pingInterval = setInterval(() => {
      if (heliusWs?.readyState === WebSocket.OPEN) heliusWs.ping();
    }, 25000);
  });

  heliusWs.on('message', async (data) => {
    wsStats.messagesReceived++;
    
    try {
      const msg = JSON.parse(data.toString());

      if (msg.result && typeof msg.result === 'number') {
        subscriptionId = msg.result;
        reconnectAttempts = 0; // Reset on successful subscription
        return;
      }

      if (msg.method === 'transactionNotification' && msg.params?.result) {
        await handleTransactionNotification(msg.params.result);
      }
    } catch (e) {
      console.warn('[helius] Erro ao processar mensagem:', e.message);
    }
  });

  heliusWs.on('error', (err) => {
    console.warn('[helius] WebSocket error:', err.message);
  });

  heliusWs.on('close', () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    heliusWs = null;
    subscriptionId = null;
    wsStats.reconnections++;
    reconnectAttempts++;
    
    // Backoff exponencial: 5s, 10s, 20s, 40s... máximo 5 minutos
    const baseDelay = 5000;
    const maxDelay = 5 * 60 * 1000;
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts - 1) + Math.random() * 3000, maxDelay);
    
    console.log(`[helius] Reconectando em ${Math.round(delay / 1000)}s (tentativa ${reconnectAttempts})`);
    reconnectTimer = setTimeout(connect, delay);
  });
}

function start(callback) {
  onTradeCallback = callback;
  wsStats.startedAt = Date.now();
  connect();
}

/**
 * Obtém estatísticas do WebSocket
 */
function getStats() {
  return {
    ...wsStats,
    connected: heliusWs?.readyState === WebSocket.OPEN,
    subscriptionId,
    processedCacheSize: processedSignatures.size,
    uptimeMs: wsStats.startedAt ? Date.now() - wsStats.startedAt : 0,
  };
}

function stop() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (heliusWs) {
    heliusWs.close();
    heliusWs = null;
  }
}

module.exports = { start, stop, getStats };
