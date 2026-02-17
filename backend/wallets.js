const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/kols.json');
const KOLSCAN_FILE = path.join(__dirname, '../data/kols-kolscan.json');

// Carrega KOLs do arquivo JSON
function loadFromFile(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.error('[wallets] Erro ao carregar', filepath, e.message);
  }
  return [];
}

// Salva KOLs manuais no arquivo
function saveKols(kols) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(kols, null, 2));
  } catch (e) {
    console.error('[wallets] Erro ao salvar:', e.message);
  }
}

// Estado interno
let KOLS = [];
let initialized = false;

function initKols() {
  if (initialized) return;

  // Carrega manuais
  const manualKols = loadFromFile(DATA_FILE);

  // Carrega KolScan
  const kolscanKols = loadFromFile(KOLSCAN_FILE);

  // Set de wallets já existentes
  const existingWallets = new Set(manualKols.map(k => k.full || k.wallet));

  // Começa com manuais
  KOLS = manualKols.map((k, i) => ({
    ...k,
    id: k.id || i + 1,
    source: 'manual'
  }));

  // Adiciona KolScan (evita duplicatas)
  kolscanKols.forEach((kol, idx) => {
    if (kol.wallet && !existingWallets.has(kol.wallet)) {
      existingWallets.add(kol.wallet);
      KOLS.push({
        id: 1000 + idx,
        rank: 0,
        name: kol.name,
        handle: kol.handle || '',
        chain: kol.chain || 'SOL',
        wallet: kol.wallet.slice(0, 6) + '...' + kol.wallet.slice(-5),
        full: kol.wallet,
        pnl: kol.pnl || 0,
        winRate: 0,
        trades: 0,
        vol24: 0,
        alertOn: false,
        group: kol.group || '',
        source: 'kolscan'
      });
    }
  });

  // Ordena por PnL e atribui ranks
  KOLS.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  KOLS.forEach((k, i) => k.rank = i + 1);

  initialized = true;
  console.log(`[wallets] Carregados ${KOLS.length} KOLs (${manualKols.length} manuais + ${kolscanKols.length} KolScan)`);
}

function getKols() {
  initKols();
  return KOLS;
}

/**
 * Recalcula rank de todos os KOLs com base no PnL atual (maior PnL = rank 1)
 */
function recomputeRanksByPnl() {
  initKols();
  KOLS.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  KOLS.forEach((k, i) => k.rank = i + 1);
}

function addKol(kol) {
  initKols();
  const id = KOLS.length ? Math.max(...KOLS.map(k => k.id)) + 1 : 1;
  const newKol = {
    id,
    rank: KOLS.length + 1,
    name: kol.name || 'Sem Nome',
    handle: kol.handle || '',
    chain: kol.chain || 'SOL',
    wallet: kol.wallet ? kol.wallet.slice(0, 6) + '...' + kol.wallet.slice(-5) : '',
    full: kol.wallet || kol.full || '',
    pnl: kol.pnl || 0,
    winRate: kol.winRate || 0,
    trades: kol.trades || 0,
    vol24: kol.vol24 || 0,
    alertOn: false,
    group: kol.group || '',
    source: 'manual'
  };
  KOLS.push(newKol);

  // Salva apenas os manuais
  const manuais = KOLS.filter(k => k.source === 'manual');
  saveKols(manuais);

  // Reordena
  KOLS.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  KOLS.forEach((k, i) => k.rank = i + 1);

  return newKol;
}

function removeKol(id) {
  initKols();
  const kol = KOLS.find(k => k.id === id);
  if (!kol) return;

  KOLS = KOLS.filter(k => k.id !== id);
  KOLS.forEach((k, i) => k.rank = i + 1);

  // Salva apenas os manuais
  if (kol.source === 'manual') {
    const manuais = KOLS.filter(k => k.source === 'manual');
    saveKols(manuais);
  }
}

function updateKol(id, data) {
  initKols();
  const kol = KOLS.find(k => k.id === id);
  if (kol) {
    Object.assign(kol, data);
    if (kol.source === 'manual') {
      const manuais = KOLS.filter(k => k.source === 'manual');
      saveKols(manuais);
    }
  }
  return kol;
}

function getKolByWallet(wallet) {
  initKols();
  return KOLS.find(k => k.full === wallet || k.wallet === wallet);
}

function getSolanaWallets() {
  return getKols().filter(k => k.chain === 'SOL' && k.full).map(k => k.full);
}

function setAlertOn(id, on) {
  initKols();
  const kol = KOLS.find(k => k.id === id);
  if (kol) {
    kol.alertOn = !!on;
    if (kol.source === 'manual') {
      const manuais = KOLS.filter(k => k.source === 'manual');
      saveKols(manuais);
    }
  }
}

module.exports = { getKols, recomputeRanksByPnl, addKol, removeKol, updateKol, getKolByWallet, getSolanaWallets, setAlertOn };
