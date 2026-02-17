/**
 * Persistência de trades em data/trades.json
 */
const fs = require('fs');
const path = require('path');

const TRADES_FILE = path.join(__dirname, '..', 'data', 'trades.json');
const MAX_TRADES = 500;

let trades = [];

function loadTrades() {
  try {
    const data = fs.readFileSync(TRADES_FILE, 'utf8');
    trades = JSON.parse(data);
  } catch (e) {
    trades = [];
  }
  return trades;
}

function saveTrades() {
  try {
    const dir = path.dirname(TRADES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 0), 'utf8');
  } catch (e) {
    console.warn('[trades] Erro ao salvar:', e.message);
  }
}

function addTrade(trade) {
  const entry = {
    ...trade,
    _ts: Date.now(),
  };
  trades.unshift(entry);
  if (trades.length > MAX_TRADES) trades.length = MAX_TRADES;
  saveTrades();
}

function getTrades() {
  if (trades.length === 0) loadTrades();
  return trades;
}

module.exports = { addTrade, getTrades, loadTrades };
