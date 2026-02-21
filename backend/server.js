/**
 * KOL Entry Scanner - Backend
 * Express + WebSocket (mesma porta) + Helius + PnL Tracker
 */
const http = require('http');
const app = require('./app');
const { WebSocketServer } = require('ws');
const { addTrade: persistTrade, getTrades, getRecentTrades, loadTrades } = require('./tradesStore');
const helius = require('./helius');
const pnlTracker = require('./pnlTracker');
const { loadCache } = require('./txCache');
const pnlCache = require('./pnlCache');

const PORT = parseInt(process.env.PORT || '3001', 10);

const clients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: '/ws' });

wsServer.on('connection', (ws) => {
  console.log('[ws] Cliente conectado');
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  const recentTrades = getRecentTrades(120);
  if (recentTrades.length > 0) {
    ws.send(JSON.stringify({ type: 'bootstrap', data: { trades: recentTrades } }));
    console.log('[ws] Bootstrap:', recentTrades.length, 'trades enviados');
  }
  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', (err) => { console.warn('[ws] Erro:', err.message); clients.delete(ws); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] HTTP + WebSocket em http://localhost:${PORT}`);
  console.log(`[server] WebSocket path: /ws`);
});

loadCache();

// Helius DESATIVADO por padrão — defina HELIUS_ENABLED=1 para reativar (evita gasto de API)
const HELIUS_ENABLED = process.env.HELIUS_ENABLED === '1' || process.env.HELIUS_ENABLED === 'true';

if (HELIUS_ENABLED) {
  helius.start((trade) => {
    persistTrade(trade);
    broadcast({ type: 'trade', data: trade });
  });

  // Carrega últimos 5 trades por wallet em background
  loadTrades();
  const existingSigs = new Set((getTrades() || []).map((t) => t.signature).filter(Boolean));
  setTimeout(() => {
    helius.loadRecentTradesForAllWallets((trade) => {
      persistTrade(trade);
      broadcast({ type: 'trade', data: trade });
    }, existingSigs);
  }, 3000);

  pnlTracker.start((updatedKols, groupName, period) => {
    pnlCache.invalidate(period || 'daily');
    broadcast({ type: 'pnl_update', data: { kols: updatedKols, group: groupName, period: period || 'daily', timestamp: Date.now() } });
    console.log(`[server] PnL atualizado: ${updatedKols.length} KOLs (${groupName}, ${period || 'daily'})`);
  });
  console.log('[server] Sistema de polling escalonado iniciado');
} else {
  console.log('[server] Helius desativado — defina HELIUS_ENABLED=1 para reativar');
}

process.on('SIGINT', () => {
  console.log('[server] Encerrando...');
  if (HELIUS_ENABLED) helius.stop();
  pnlTracker.stop();
  server.close();
  wsServer.close();
  process.exit(0);
});
