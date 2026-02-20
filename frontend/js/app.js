/**
 * KOL Entry Scanner BR - Aplicação principal
 */

import {
  API_BASE,
  WS_URL,
  BRL_UPDATE_INTERVAL_MS,
  SEARCH_DEBOUNCE_MS,
  AI_PROMPT_STORAGE_KEY,
  LAST_UPDATE,
} from './config.js';
import { fmt, fmtSub, fmtMC } from './utils/format.js';
import { fetchTokenData, analyzeTokenAI, fetchBRLRate, fetchApiStatus, fetchKolsPnL, fetchKols, refreshPnL } from './api.js';
import { renderWallets, renderWalletsSkeleton } from './components/wallets.js';
import { renderTradesList, getKolPositionForToken } from './components/trades.js';
import { renderAlerts } from './components/alerts.js';
import { renderTokenDetail, renderTokenEmpty, formatAIBody } from './components/token-panel.js';
import { renderKolStats, renderKolLinks } from './components/modals.js';

// ─── STATE ─────────────────────────────────────────────────────────────
let state = {
  usdBRL: 5.12,
  cur: 'BRL',
  cFilter: 'all',
  sKey: 'rankPnl',
  sDir: 1,
  KOLS: [],
  trades: [],
  allTrades: [],
  tradeCnt: 0,
  alerts: [],
  unreadAlerts: 0,
  curKol: null,
  currentPeriod: 'daily',
  pnlLoading: false,
  wsConnected: false,
  searchDebounceTimer: null,
};
const opts = () => ({ cur: state.cur, usdBRL: state.usdBRL });

// ─── DOM REFS (lazy) ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => document.querySelectorAll(sel);

// ─── FORMAT HELPERS ───────────────────────────────────────────────────
const fmtF = (v) => fmt(v, state.cur, state.usdBRL);
const fmtSubF = (v) => fmtSub(v, state.cur, state.usdBRL);
const fmtMCF = (v) => fmtMC(v, state.cur, state.usdBRL);

// ─── STATS ───────────────────────────────────────────────────────────
function renderStats() {
  const kols = state.KOLS;
  $('stW').textContent = kols.length;
  const tp = kols.reduce((s, k) => s + (k.pnl || 0), 0);
  const pe = $('stP');
  pe.textContent = (tp >= 0 ? '+' : '') + fmtF(Math.abs(tp));
  pe.className = 'sval ' + (tp >= 0 ? 'cg' : 'cr');
  $('stPs').textContent = fmtSubF(Math.abs(tp));
  $('stT').textContent = state.tradeCnt;
  $('stA').textContent = kols.filter((k) => k.alertOn).length;
  updateAlertBadge();
}

// ─── WALLETS ───────────────────────────────────────────────────────────
function getFilteredAndSortedKols() {
  let data = [...state.KOLS];
  const byPnl = [...state.KOLS].sort((a, b) => b.pnl - a.pnl || b.winRate - a.winRate);
  const byWr = [...state.KOLS].sort((a, b) => b.winRate - a.winRate || b.pnl - a.pnl);
  const rankPnlMap = new Map(byPnl.map((k, i) => [k.id, i + 1]));
  const rankWrMap = new Map(byWr.map((k, i) => [k.id, i + 1]));
  data = data.map((k) => ({
    ...k,
    rankPnl: k.rankPnl || rankPnlMap.get(k.id) || 999,
    rankWinRate: k.rankWinRate || rankWrMap.get(k.id) || 999,
  }));

  const q = ($('srch')?.value || '').toLowerCase();
  if (q) data = data.filter((k) => (k.name || '').toLowerCase().includes(q) || (k.handle || '').toLowerCase().includes(q) || (k.wallet || '').toLowerCase().includes(q));
  if (state.cFilter === 'top') data = data.filter((k) => k.rankPnl <= 10);
  else if (state.cFilter === 'wr80') data = data.filter((k) => k.winRate >= 80);
  else if (state.cFilter === 'pnlpos') data = data.filter((k) => k.pnl > 0);
  else if (state.cFilter === 'alert') data = data.filter((k) => k.alertOn);

  const va = state.sKey;
  const vb = state.sDir;
  data.sort((a, b) => {
    const x = a[va],
      y = b[va];
    if (typeof x === 'string') return vb * (x || '').localeCompare(y || '');
    return vb * ((Number(x) || 0) - (Number(y) || 0));
  });
  return data;
}

function renderW() {
  const data = getFilteredAndSortedKols();
  renderWallets($('wBody'), $('emptyW'), data, opts());
  renderStats();
}

// ─── TRADES ───────────────────────────────────────────────────────────
function addTrade(tok) {
  const enriched = {
    ...tok,
    valUsd: tok.valUsd ?? tok.valor ?? 0,
    mc: tok.mc ?? tok.marketCap ?? 0,
    ca: tok.ca ?? tok.mint,
    age: tok.age ?? 'Agora',
    holders: tok.holders ?? 0,
    taxB: tok.taxB ?? 0,
    taxS: tok.taxS ?? 0,
    renounced: tok.renounced ?? null,
    liqLocked: tok.liqLocked ?? null,
    aiAnalysis: tok.aiAnalysis ?? null,
  };
  state.allTrades.unshift(enriched);
  if (state.allTrades.length > 120) state.allTrades.pop();
  state.tradeCnt++;
  $('tBadge').textContent = state.tradeCnt;
  renderTradesFiltered();
  $('tEmpty').style.display = 'none';
  const kol = enriched.kol;
  if (kol?.alertOn) {
    pushAlert(enriched.type, kol.name, `${enriched.type === 'buy' ? 'COMPROU' : 'VENDEU'} ${enriched.name} (${enriched.symbol}) — ${fmtF(enriched.valUsd)}`, enriched);
  }
  renderStats();
}

function renderTradesFiltered() {
  const tf = $('ttFil')?.value || 'all';
  const result = renderTradesList($('tBody'), state.allTrades, tf, opts(), state.allTrades);
  $('tEmpty').style.display = result.total ? 'none' : 'block';
}

// ─── TOKEN PANEL ─────────────────────────────────────────────────────
let _currentTok = null;

async function showTokDetail(tok) {
  _currentTok = tok;
  const kolPosition = getKolPositionForToken(state.allTrades, tok.kol, tok.ca);
  const container = $('tokDetail');
  container.innerHTML = renderTokenDetail(tok, { ...opts(), kolPosition });
  attachAIBtnHandler(tok);
  enrichFromDex(tok);
}

async function enrichFromDex(tok) {
  const data = await fetchTokenData(tok.ca, 'solana');
  if (!data) return;
  tok.mc = data.mc ?? tok.mc;
  tok.liq = data.liq ?? tok.liq;
  tok.vol24h = data.vol24 ?? tok.vol24h;
  tok.change = data.change24 ?? tok.change;
  tok.buys = data.buys ?? tok.buys;
  tok.sells = data.sells ?? tok.sells;
  tok.imageUrl = data.imageUrl ?? tok.imageUrl;
  if (_currentTok?.ca === tok.ca) {
    const container = $('tokDetail');
    if (container) {
      const kolPosition = getKolPositionForToken(state.allTrades, tok.kol, tok.ca);
      container.innerHTML = renderTokenDetail(tok, { ...opts(), kolPosition });
      attachAIBtnHandler(tok);
    }
  }
}

function attachAIBtnHandler(tok) {
  const runBtn = $('aiBtn');
  const aiBody = $('aiBody');
  if (!runBtn || !aiBody) return;
  runBtn.onclick = async () => {
    if (!_currentTok) return;
    runBtn.disabled = true;
    runBtn.textContent = 'ANALISANDO...';
      aiBody.className = 'ai-body loading';
    aiBody.innerHTML = '<div class="spinner" aria-hidden="true"></div><span>GPT-4o mini analisando o token...</span>';
    const tokenPayload = {
      ca: tok.ca,
      name: tok.name,
      symbol: tok.symbol,
      mc: tok.mc,
      liquidity: tok.liq,
      volume24h: tok.vol24h || 0,
      buys: tok.buys,
      sells: tok.sells,
      change: tok.change,
    };
    const customPrompt = getCustomAIPrompt();
    const result = await analyzeTokenAI(tokenPayload, tok.kol, tok.type, customPrompt);
    runBtn.disabled = false;
    runBtn.textContent = 'RE-ANALISAR';
    if (!result) {
      aiBody.className = 'ai-body';
      aiBody.textContent = 'Erro ao analisar. Tente novamente.';
      return;
    }
      aiBody.className = 'ai-body ready';
    if (typeof result === 'object') {
      aiBody.innerHTML = formatAIBody(result);
      tok.aiAnalysis = result;
    } else {
      const upper = String(result).toUpperCase();
      let scoreClass = 'neutral',
        scoreLabel = 'NEUTRO';
      if (upper.includes('COMPRA') || upper.includes('BUY') || upper.includes('POSITIV')) {
        scoreClass = 'buy';
        scoreLabel = '✓ COMPRA';
      } else if (upper.includes('EVITAR') || upper.includes('AVOID') || upper.includes('SELL') || upper.includes('RUG')) {
        scoreClass = 'sell';
        scoreLabel = '✗ EVITAR';
      }
      aiBody.innerHTML = `<span class="ai-score ai-score--${scoreClass}">${scoreLabel}</span><br><br>${String(result).replace(/\n/g, '<br>')}`;
      tok.aiAnalysis = result;
    }
  };
}

// ─── ALERTS ───────────────────────────────────────────────────────────
function pushAlert(type, name, msg) {
  const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.alerts.unshift({ type, name, msg, t });
  if (state.alerts.length > 50) state.alerts.pop();
  state.unreadAlerts++;
  renderA();
  updateAlertBadge();
  beep(type);
}

function renderA() {
  renderAlerts($('aList'), state.alerts);
}

function updateAlertBadge() {
  const badge = $('aBadge');
  const activeTracked = state.KOLS.filter((k) => k.alertOn).length;
  const shouldShow = activeTracked > 0 && state.unreadAlerts > 0;
  badge.style.display = shouldShow ? 'inline' : 'none';
  badge.textContent = state.unreadAlerts > 9 ? '9+' : state.unreadAlerts;
}

function beep(type) {
  try {
    if ($('cfgN')?.value !== 'sound') return;
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value = type === 'buy' ? 900 : type === 'sell' ? 440 : 660;
    o.type = 'sine';
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    o.start();
    o.stop(c.currentTime + 0.35);
  } catch (e) {}
}

// ─── KOL MODAL ───────────────────────────────────────────────────────
function openKol(id) {
  const k = state.KOLS.find((kol) => kol.id === id);
  if (!k) return;
  state.curKol = k;
  $('kTitle').textContent = k.name;
  $('kSub').textContent = k.handle + ' · Solana';
  $('kStats').innerHTML = renderKolStats(k, state.cur, state.usdBRL);
  $('kLinks').innerHTML = renderKolLinks(k);
  const ab = $('kABtn');
  ab.textContent = k.alertOn ? 'DESATIVAR ALERTA' : 'ATIVAR ALERTA';
  ab.style.borderColor = k.alertOn ? 'var(--color-red)' : 'var(--color-green)';
  ab.style.color = k.alertOn ? 'var(--color-red)' : 'var(--color-green)';
  $('kolOverlay').classList.add('open');
}

function togKA() {
  if (!state.curKol) return;
  state.curKol.alertOn = !state.curKol.alertOn;
  const ab = $('kABtn');
  ab.textContent = state.curKol.alertOn ? 'DESATIVAR ALERTA' : 'ATIVAR ALERTA';
  ab.style.borderColor = state.curKol.alertOn ? 'var(--color-red)' : 'var(--color-green)';
  ab.style.color = state.curKol.alertOn ? 'var(--color-red)' : 'var(--color-green)';
  if (state.curKol.alertOn) pushAlert('watch', state.curKol.name, 'Monitoramento ativado para esta wallet');
  renderW();
  renderStats();
  updateAlertBadge();
}

function closeKol() {
  $('kolOverlay').classList.remove('open');
}

// ─── TABS ────────────────────────────────────────────────────────────
function switchTab(tab, el) {
  qsa('.tab').forEach((t) => t.classList.remove('active'));
  el?.classList.add('active');
  ['wallets', 'trades', 'alerts'].forEach((t) => {
    const el2 = $('tab-' + t);
    if (el2) el2.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'alerts') {
    state.unreadAlerts = 0;
    updateAlertBadge();
  }
}

// ─── COPY & TOAST ─────────────────────────────────────────────────────
let toastTimer = null;

function copyToClipboard(addr) {
  navigator.clipboard.writeText(addr).then(() => showToast('Copiado!')).catch(() => showToast('Falha ao copiar'));
}

function showToast(msg) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
}

function copyFeedback(el) {
  if (el.tagName === 'BUTTON') {
    const orig = el.textContent;
    el.textContent = '✓';
    setTimeout(() => {
      try {
        el.textContent = orig;
      } catch (e) {}
    }, 1300);
  } else {
    const icon = el.querySelector('.copy-btn, .cpbtn, .cpbtn2');
    if (icon) {
      const prev = icon.textContent;
      icon.textContent = '✓';
      el.classList.add('copied');
      setTimeout(() => {
        icon.textContent = prev;
        el.classList.remove('copied');
      }, 1300);
    }
  }
}

// ─── AI PROMPT ───────────────────────────────────────────────────────
function getCustomAIPrompt() {
  return (localStorage.getItem(AI_PROMPT_STORAGE_KEY) || '').trim();
}

function saveAIPrompt() {
  const input = $('aiPrompt');
  if (!input) return;
  const value = (input.value || '').trim();
  localStorage.setItem(AI_PROMPT_STORAGE_KEY, value);
  showToast(value ? 'Prompt IA salvo' : 'Prompt IA vazio');
}

function resetAIPrompt() {
  localStorage.removeItem(AI_PROMPT_STORAGE_KEY);
  const input = $('aiPrompt');
  if (input) input.value = '';
  showToast('Prompt IA resetado');
}

function loadAIPrompt() {
  const input = $('aiPrompt');
  if (input) input.value = getCustomAIPrompt();
}

function openSettingsModal() {
  loadAIPrompt();
  $('settingsOverlay').classList.add('open');
}

function closeSettingsModal() {
  $('settingsOverlay').classList.remove('open');
}

// ─── PnL PERIOD ──────────────────────────────────────────────────────
async function loadKolsWithPnL(period = 'daily') {
  const periodMap = { D: 'daily', W: 'weekly', M: 'monthly' };
  state.currentPeriod = periodMap[period] || period;
  if (state.pnlLoading) return;
  state.pnlLoading = true;
  try {
    if (state.currentPeriod !== 'daily') {
      await refreshPnL(state.currentPeriod);
    }
    const kols = await fetchKolsPnL(state.currentPeriod);
    if (kols?.length) {
      const alertOnMap = {};
      state.KOLS.forEach((k) => {
        if (k.full) alertOnMap[k.full] = k.alertOn;
      });
      state.KOLS = kols.map((k) => ({ ...k, alertOn: alertOnMap[k.full] ?? k.alertOn }));
    }
  } catch (e) {
    console.warn('[PnL] Erro:', e.message);
  }
  state.pnlLoading = false;
  renderW();
  renderStats();
}

function onPeriodChange() {
  const period = $('pFil')?.value || 'D';
  loadKolsWithPnL(period);
}

async function forceRefreshPnL() {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'ATUALIZANDO...';
  }
  try {
    const period = $('pFil')?.value || 'D';
    const periodMap = { D: 'daily', W: 'weekly', M: 'monthly' };
    const ok = await refreshPnL(periodMap[period] || 'daily');
    if (ok) await loadKolsWithPnL(period);
  } catch (e) {
    console.warn('[PnL] Erro:', e.message);
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔄 RECARREGAR WALLETS';
  }
}

// ─── CURRENCY ────────────────────────────────────────────────────────
function setCur(c) {
  state.cur = c;
  $('btnBRL').classList.toggle('active', c === 'BRL');
  $('btnUSD').classList.toggle('active', c === 'USD');
  $('brlVal').textContent = c === 'BRL' ? 'R$ ' + state.usdBRL.toFixed(2).replace('.', ',') : '$ 1.00';
  renderW();
  renderStats();
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────
let ws = null;

function connectWS() {
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      state.wsConnected = true;
      $('liveLabel').textContent = 'AO VIVO';
      $('wsDot')?.classList.add('ws-dot');
      $('wsStatus')?.setAttribute('aria-label', 'WebSocket conectado');
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'trade' && msg.data) addTrade(msg.data);
        else if (msg.type === 'pnl_update' && msg.data) handlePnLUpdate(msg.data);
      } catch (e) {}
    };
    ws.onclose = () => {
      state.wsConnected = false;
      $('liveLabel').textContent = 'RECONECTANDO...';
      $('wsDot')?.classList.remove('ws-dot');
      $('wsStatus')?.setAttribute('aria-label', 'WebSocket reconectando');
      setTimeout(connectWS, 3000);
    };
    ws.onerror = () => {
      state.wsConnected = false;
      $('liveLabel').textContent = 'ERRO WS';
      $('wsStatus')?.setAttribute('aria-label', 'Erro na conexão WebSocket');
    };
  } catch (e) {
    $('liveLabel').textContent = 'DEMO (backend offline)';
  }
}

function handlePnLUpdate(data) {
  if (!data?.kols?.length) return;
  const { kols: updatedKols, period } = data;
  if (period && state.currentPeriod !== 'daily' && period !== state.currentPeriod) return;
  const alertOnMap = {};
  state.KOLS.forEach((k) => {
    if (k.full) alertOnMap[k.full] = k.alertOn;
  });
  state.KOLS = updatedKols.map((k) => ({ ...k, alertOn: alertOnMap[k.full] ?? k.alertOn }));
  renderW();
  renderStats();
}

// ─── EVENT DELEGATION ────────────────────────────────────────────────
function setupEventDelegation() {
  document.addEventListener('click', (e) => {
    const copyEl = e.target.closest('[data-action="copy"]');
    if (copyEl) {
      const val = copyEl.dataset.value;
      if (val) {
        copyToClipboard(val);
        copyFeedback(copyEl.tagName === 'BUTTON' ? copyEl : copyEl.closest('.wpill, .tpcabox, .tca') || copyEl);
      }
      return;
    }

    const openKolEl = e.target.closest('[data-action="open-kol"]');
    if (openKolEl) {
      const id = parseInt(openKolEl.dataset.id, 10);
      if (!isNaN(id)) openKol(id);
      return;
    }

    // chips, tabs, sort: usam handlers inline (setF, sw, sb) — delegation com data-* seria redundante

    if (e.target.id === 'btnBRL') setCur('BRL');
    if (e.target.id === 'btnUSD') setCur('USD');

    if (e.target.closest('#settingsOverlay') === e.target) closeSettingsModal();
    if (e.target.closest('#kolOverlay') === e.target) closeKol();
  });

  $('srch')?.addEventListener(
    'input',
    (() => {
      let t;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(renderW, SEARCH_DEBOUNCE_MS);
      };
    })()
  );

  // pFil, ttFil, kABtn: handlers inline no HTML — não duplicar com addEventListener
}

// Delegation for trade row click (show token) - ignore clicks on copy/buttons
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="copy"]')) return;
  const showTokenEl = e.target.closest('[data-action="show-token"]');
  if (showTokenEl) {
    const row = showTokenEl.closest('.trow');
    if (row) {
      const idx = Array.from(row.parentElement?.children || []).indexOf(row);
      const tf = $('ttFil')?.value || 'all';
      const filtered = tf === 'all' ? state.allTrades : state.allTrades.filter((t) => t.type === tf);
      const tok = filtered[idx];
      if (tok) showTokDetail(tok);
    }
  }
});

// Copy em .tca já tratado pelo handler principal [data-action="copy"]

// ─── INIT ────────────────────────────────────────────────────────────
async function init() {
  console.log('[init] API_BASE:', API_BASE || '(mesmo domínio)');
  console.log('[init] WS_URL:', WS_URL);

  const lastUp = $('lastUpdate');
  if (lastUp) lastUp.textContent = 'Última atualização: ' + LAST_UPDATE;

  const rate = await fetchBRLRate();
  if (rate) {
    state.usdBRL = rate;
    $('brlVal').textContent = 'R$ ' + rate.toFixed(2).replace('.', ',');
  } else {
    $('brlVal').textContent = 'R$ —';
  }
  setInterval(async () => {
    const r = await fetchBRLRate();
    if (r) {
      state.usdBRL = r;
      $('brlVal').textContent = 'R$ ' + r.toFixed(2).replace('.', ',');
      renderW();
      renderStats();
    } else {
      $('brlVal').textContent = 'R$ —';
    }
  }, BRL_UPDATE_INTERVAL_MS);

  const apiStatus = await fetchApiStatus();
  if (!apiStatus.helius) $('banner-setup').style.display = 'block';

  renderWalletsSkeleton($('wBody'), $('emptyW'));

  let kols = await fetchKolsPnL('daily');
  if (!kols?.length) kols = await fetchKols();
  if (kols?.length) {
    state.KOLS = kols;
    console.log('[init]', state.KOLS.length, 'KOLs carregados');
  } else {
    console.warn('[init] Nenhum KOL carregado');
    $('liveLabel').textContent = 'ERRO API';
  }

  loadAIPrompt();
  setupEventDelegation();

  renderW();
  renderStats();
  renderA();
  updateAlertBadge();
  connectWS();

  setTimeout(() => {
    if (!state.wsConnected) {
      if (!state.KOLS.length) $('liveLabel').textContent = 'ERRO API';
      else if (!apiStatus.helius) $('liveLabel').textContent = '⚠️ API KEY NECESSÁRIA';
      else $('liveLabel').textContent = API_BASE ? 'API ATIVA' : 'DEMO';
    }
  }, 4000);
}

init();

// Expose for inline handlers that remain in HTML
window.openKol = openKol;
window.sw = switchTab;
window.setCur = setCur;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.closeSettingsBg = (e) => {
  if (e.target === $('settingsOverlay')) closeSettingsModal();
};
window.closeKol = closeKol;
window.togKA = togKA;
window.closeKbg = (e) => {
  if (e.target === $('kolOverlay')) closeKol();
};
window.saveAIPrompt = saveAIPrompt;
window.resetAIPrompt = resetAIPrompt;
window.forceRefreshPnL = forceRefreshPnL;
window.recarregarWallets = forceRefreshPnL;
function limparFiltros() {
  state.cFilter = 'all';
  const srch = $('srch');
  if (srch) srch.value = '';
  qsa('.chip').forEach((c) => {
    c.classList.remove('active');
    if (c.textContent.trim() === 'Todos') c.classList.add('active');
  });
  renderW();
}
window.limparFiltros = limparFiltros;
window.clearTrades = () => {
  state.allTrades = [];
  state.tradeCnt = 0;
  $('tBody').innerHTML = '';
  $('tEmpty').style.display = 'block';
  $('tokDetail').innerHTML = renderTokenEmpty();
  $('tBadge').textContent = '0';
  renderStats();
};
window.clearAlerts = () => {
  state.alerts = [];
  state.unreadAlerts = 0;
  renderA();
  updateAlertBadge();
};
window.setF = (f, el) => {
  state.cFilter = f;
  qsa('.chip').forEach((c) => c.classList.remove('active'));
  el?.classList.add('active');
  renderW();
};
window.sb = (k) => {
  if (state.sKey === k) state.sDir *= -1;
  else {
    state.sKey = k;
    state.sDir = 1;
  }
  renderW();
};
window.applyTFilter = renderTradesFiltered;
window.onPeriodChange = onPeriodChange;
