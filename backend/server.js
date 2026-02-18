/**
 * KOL Entry Scanner - Backend
 * Express + WebSocket (mesma porta) + Helius + PnL Tracker
 */
const http = require('http');
const app = require('./app');
const { WebSocketServer } = require('ws');
const { addTrade: persistTrade } = require('./tradesStore');
const helius = require('./helius');
const pnlTracker = require('./pnlTracker');
const { loadCache } = require('./txCache');

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
  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', (err) => { console.warn('[ws] Erro:', err.message); clients.delete(ws); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] HTTP + WebSocket em http://localhost:${PORT}`);
  console.log(`[server] WebSocket path: /ws`);
});

loadCache();

helius.start((trade) => {
  persistTrade(trade);
  broadcast({ type: 'trade', data: trade });
});

pnlTracker.start((updatedKols, groupName, period) => {
  broadcast({ type: 'pnl_update', data: { kols: updatedKols, group: groupName, period: period || 'daily', timestamp: Date.now() } });
  console.log(`[server] PnL atualizado: ${updatedKols.length} KOLs (${groupName}, ${period || 'daily'})`);
});

console.log('[server] Sistema de polling escalonado iniciado');

process.on('SIGINT', () => {
  console.log('[server] Encerrando...');
  helius.stop();
  pnlTracker.stop();
  server.close();
  wsServer.close();
  process.exit(0);
});
