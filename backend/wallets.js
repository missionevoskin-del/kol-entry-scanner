const fs = require('fs');
const path = require('path');

// Paths absolutos para não quebrar em produção (Railway)
const DATA_FILE = path.join(__dirname, '..', 'data', 'kols.json');
const KOLSCAN_FILE = path.join(__dirname, '..', 'data', 'kols-kolscan.json');

// Fallback hardcoded quando arquivos não existirem em produção
const KOLS_FALLBACK = [
  { name: 'Santos', handle: '@santos', wallet: 'DXwuEuLCjq44dHJtBNc6cNGyduHrQ7YwJSZdP69VXGFH', chain: 'SOL', group: 'FRD' },
  { name: 'Trutinha', handle: '@Trutinha', wallet: 'EeZDLghjJmEwXP3LQb5yL3okBfQ5R6NJpVYfXA2pR1NF', chain: 'SOL', group: 'CPD' },
  { name: 'Trutinha (2)', handle: '@Trutinha', wallet: 'FdRxF4HEP5FmzZGv8Y7MWf892yffDawnva62qnhe8GAn', chain: 'SOL', group: 'CPD' },
  { name: 'ZecaPiranha', handle: '@ZecaPiranha', wallet: 'EHP4W8X5kwXK1EQHQwy3gGRZzbfYAbST2jJpxVELPUCB', chain: 'SOL', group: 'CR' },
  { name: 'tech', handle: '@tech', wallet: '5d3jQcuUvsuHyZkhdp78FFqc7WogrzZpTtec1X9VNkuE', chain: 'SOL', group: 'CR' },
  { name: 'Krill', handle: '@Krill', wallet: '9o5Q4NFkpsejMaanvaFirzFqWpy1w2emVUiad6ZJaRZr', chain: 'SOL', group: '' },
  { name: 'Gabriel Amaral', handle: '@GabrielAmaral', wallet: '4FMxMnarfvEFuazzNu4hvsJQCSnBYKLFyUHBG6e5GCTk', chain: 'SOL', group: '' },
  { name: 'Augusto', handle: '@Augusto', wallet: '3B9KnGjfGdyHoc8GbJa92im6kkBjfsvHHZkZVW2h1cHq', chain: 'SOL', group: '' },
  { name: 'Simonsen', handle: '@Simonsen', wallet: '4gMTSVYy9LutsZUDNAYMhFz3BZoTNwvrF7sveCpwbVaz', chain: 'SOL', group: '' },
  { name: 'Ellenth', handle: '@Ellenth', wallet: 'DGdVBQMLRZoDkArWwiWDmbL1rr9XEjQHFW6CkfnHbFM9', chain: 'SOL', group: '' },
  { name: 'Dijair Silva', handle: '@DijairSilva', wallet: 'F67jSGtrHoHhu5yTNWancFs2pNiJjgaotJQFynDs1bne', chain: 'SOL', group: '' },
  { name: 'i dont lose', handle: '@idontlose', wallet: 'ChTRJGdZ3gdw6iw32YshvWYhaUYLeeGomuSHN59Pmpcz', chain: 'SOL', group: '' },
  { name: 'henry', handle: '@henry', wallet: 'H34P7WHdbdaGDWgQJv98wuDAkLi17e9Z5K7F2Tsqek2z', chain: 'SOL', group: '' },
  { name: 'GreatShow', handle: '@GreatShow', wallet: 'oFbi2R6wuE76728Y2qLurUxsFGKhN8yGr3EhgyQjHCu', chain: 'SOL', group: '' },
  { name: 'squinsol', handle: '@squinsol', wallet: '3p5Dj6Ef72Q6uVX81K4Snr7grJE83YFUyaNyM4E137WB', chain: 'SOL', group: '' },
  { name: 'Cardoso', handle: '@Cardoso', wallet: 'G3VdHpbsqgnbdS44nvvKUr28qk1zUBGcocvyzaF9HFxY', chain: 'SOL', group: 'FRD' },
  { name: 'Dusty', handle: '@Dusty', wallet: '3TAHqJMp1bo2G6okNSJs3UWc9SugYxiaB7AFPa3nARGX', chain: 'SOL', group: 'FRD' },
  { name: 'friv', handle: '@friv', wallet: 'HHiuG1g3zqihVtW8ZfGknKWq1BCjtodZKTmPdE8XUJgh', chain: 'SOL', group: '' },
  { name: 'friv (2)', handle: '@friv', wallet: 'GMmS3WV8oFL9ajGpYvfZHCHUidTEaAJwWBucbWT8xAVY', chain: 'SOL', group: '' },
  { name: 'mstzera', handle: '@mstzera', wallet: 'fZgAzfgvgBFTZAZuxdKf89jcYsKbCTFFUNKe9gCygqb', chain: 'SOL', group: '' },
  { name: 'angelical', handle: '@angelical', wallet: 'GvtQAgZDDnRhDMyne9pwZagWijFQh6ZbDxHfDcAzJvWu', chain: 'SOL', group: '' },
  { name: 'cross', handle: '@cross', wallet: '7BFAAyyxi6j8AUv6RgUBCYC5EM3RWPTZjDrafv4Txjva', chain: 'SOL', group: '' },
];

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

  // Fallback: se ambos os arquivos estão vazios, usar lista fixa (ex.: Railway filesystem)
  if (KOLS.length === 0 && kolscanKols.length === 0) {
    console.warn('[wallets] Arquivos vazios — usando fallback com', KOLS_FALLBACK.length, 'KOLs');
    KOLS = KOLS_FALLBACK.map((k, i) => ({
      id: i + 1,
      rank: i + 1,
      name: k.name,
      handle: k.handle || '',
      chain: k.chain || 'SOL',
      wallet: k.wallet ? k.wallet.slice(0, 6) + '...' + k.wallet.slice(-5) : '',
      full: k.wallet || '',
      pnl: 0,
      winRate: 0,
      trades: 0,
      vol24: 0,
      alertOn: false,
      group: k.group || '',
      source: 'fallback',
    }));
    initialized = true;
    console.log(`[wallets] Carregados ${KOLS.length} KOLs (fallback)`);
    return;
  }

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
