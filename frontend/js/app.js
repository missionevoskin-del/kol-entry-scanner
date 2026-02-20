/**
 * KOL Entry Scanner BR - Aplicação principal
 */

import {
  API_BASE,
  WS_URL,
  BRL_UPDATE_INTERVAL_MS,
  SEARCH_DEBOUNCE_MS,
  AI_PROMPT_STORAGE_KEY,
} from './config.js';
import { fmt, fmtSub, fmtMC } from './utils/format.js';
import { fetchTokenData, analyzeTokenAI, fetchBRLRate, fetchApiStatus, fetchKolsPnL, fetchKols, refreshPnL, fetchWalletPnL } from './api.js';
import { renderWallets, renderWalletsSkeleton } from './components/wallets.js';
import { renderTradesList, getKolPositionForToken } from './components/trades.js';
import { renderAlerts } from './components/alerts.js';
import { renderTokenDetail, renderTokenEmpty, formatAIBody } from './components/token-panel.js';
import { renderKolStats, renderKolLinks, renderKolLastTrades } from './components/modals.js';

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
  lastFetchAt: null,
  lastWsMsgAt: null,
  hasHelius: true,
};
const ONBOARDING_KEY = 'kolscan_onboarding_seen';
const CUSTOM_WALLETS_KEY = 'customWallets';
const MAX_CUSTOM_WALLETS = 10;
const STORAGE_KEY_ALERTS = 'kolscan_alerts';
const STORAGE_KEY_ALERTS_INIT = 'kolscan_alerts_initialized';
const SITE_URL = 'https://kolbr-entry.up.railway.app';
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
  updateHeroCompactStats();
}

function updateHeroCompactStats() {
  const wEl = $('heroWallets');
  const tEl = $('heroTrades');
  const lEl = $('heroLastEntry');
  if (wEl) wEl.textContent = state.KOLS.length || '—';
  if (tEl) tEl.textContent = state.tradeCnt > 0 ? state.tradeCnt : '—';
  if (lEl) {
    const last = state.allTrades[0];
    if (last && state.lastWsMsgAt) {
      const sec = Math.floor((Date.now() - state.lastWsMsgAt) / 1000);
      if (sec < 60) lEl.textContent = `${sec}s atrás`;
      else if (sec < 3600) lEl.textContent = `${Math.floor(sec / 60)}min atrás`;
      else lEl.textContent = `${Math.floor(sec / 3600)}h atrás`;
    } else {
      lEl.textContent = '—';
    }
  }
}

// ─── ALERTAS (localStorage) ────────────────────────────────────────────
function initDefaultAlerts(wallets) {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ALERTS) || '{}');
  const isFirstVisit = !localStorage.getItem(STORAGE_KEY_ALERTS_INIT);
  const officialWallets = wallets.filter((w) => !w.custom);
  officialWallets.forEach((w) => {
    const addr = w.full || (w.wallet && String(w.wallet).length > 25 ? w.wallet : null);
    if (!addr) return;
    if (isFirstVisit) {
      saved[addr] = true;
      w.alertOn = true;
    } else {
      w.alertOn = saved[addr] ?? false;
    }
  });
  if (isFirstVisit) {
    localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(saved));
    localStorage.setItem(STORAGE_KEY_ALERTS_INIT, '1');
  }
  return { wallets, isFirstVisit };
}

function persistAlertsToStorage() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ALERTS) || '{}');
  state.KOLS.forEach((k) => {
    const addr = k.full || (k.wallet && String(k.wallet).length > 25 ? k.wallet : null);
    if (addr) saved[addr] = !!k.alertOn;
  });
  localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(saved));
}

// ─── CUSTOM WALLETS ────────────────────────────────────────────────────
function getCustomWallets() {
  try {
    const raw = localStorage.getItem(CUSTOM_WALLETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCustomWallets(arr) {
  localStorage.setItem(CUSTOM_WALLETS_KEY, JSON.stringify(arr));
}

function mergeCustomWalletsIntoKols() {
  const custom = getCustomWallets();
  const officialFull = new Set(state.KOLS.filter((k) => !k.custom).map((k) => k.full || k.wallet));
  const customKols = custom
    .filter((c) => !officialFull.has(c.address))
    .map((c) => ({
      id: `custom-${c.address.slice(0, 8)}`,
      name: c.name || 'Wallet custom',
      handle: c.twitter || '',
      twitter: c.twitter || '',
      wallet: c.address.slice(0, 4) + '…' + c.address.slice(-4),
      full: c.address,
      custom: true,
      alertOn: !!c.alertOn,
      _customRaw: c,
      pnl: c.pnl,
      winRate: c.winRate ?? 0,
      trades: c.trades ?? 0,
      vol24: c.volume ?? 0,
      rankPnl: 999,
      _noHistory: c._noHistory,
    }));
  const existingIds = new Set(state.KOLS.map((k) => k.id));
  const toAdd = customKols.filter((k) => !existingIds.has(k.id));
  const toMerge = state.KOLS.filter((k) => !k.custom);
  state.KOLS = [...toMerge, ...toAdd];
}

// ─── WALLETS ───────────────────────────────────────────────────────────
function getFilteredAndSortedKols() {
  mergeCustomWalletsIntoKols();
  let data = [...state.KOLS];
  if (state.cFilter === 'custom') {
    data = data.filter((k) => k.custom);
  }
  const byPnl = [...state.KOLS].sort((a, b) => (b.pnl ?? -1e9) - (a.pnl ?? -1e9) || (b.winRate ?? 0) - (a.winRate ?? 0));
  const byWr = [...state.KOLS].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || (b.pnl ?? -1e9) - (a.pnl ?? -1e9));
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
  else if (state.cFilter === 'wr80') data = data.filter((k) => (k.winRate ?? 0) >= 80);
  else if (state.cFilter === 'pnlpos') data = data.filter((k) => (k.pnl ?? 0) > 0);
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

const lastPnlMap = {};
function renderW() {
  const data = getFilteredAndSortedKols();
  const options = { ...opts(), prevPnl: { ...lastPnlMap } };
  renderWallets($('wBody'), $('emptyW'), data, options);
  data.forEach((k) => { if (k.pnl != null) lastPnlMap[k.id] = k.pnl; });
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
  state.lastWsMsgAt = Date.now();
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
    tok.aiAnalysis = result;
    const kolPosition = getKolPositionForToken(state.allTrades, tok.kol, tok.ca);
    $('tokDetail').innerHTML = renderTokenDetail(tok, { ...opts(), kolPosition });
    attachAIBtnHandler(tok);
    attachShareCopyHandlers(tok, result);
  };
}

function attachShareCopyHandlers(tok, analysis) {
  const shareBtn = $('aiShareBtn');
  const copyBtn = $('aiCopyBtn');
  const aiBody = $('aiBody');
  if (!aiBody) return;
  const fullText = aiBody.innerText || '';
  const sentences = fullText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstTwo = sentences.slice(0, 2).join(' ').trim() || fullText.slice(0, 200);
  const shareText = `${firstTwo}\n\n${SITE_URL} via @WeedzinxD #SolanaBR #CryptoBR`;
  if (shareBtn) {
    shareBtn.onclick = () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('Abrindo X...');
    };
  }
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(fullText).then(() => showToast('✅ Análise copiada!')).catch(() => showToast('Falha ao copiar'));
    };
  }
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
  const k = state.KOLS.find((kol) => String(kol.id) === String(id) || kol.full === id);
  if (!k) return;
  state.curKol = k;
  $('kTitle').textContent = k.name;
  $('kSub').textContent = (k.handle || k.twitter || '') + ' · Solana';
  $('kStats').innerHTML = renderKolStats(k, state.cur, state.usdBRL);
  $('kLinks').innerHTML = renderKolLinks(k);
  const lastTradesEl = $('kLastTrades');
  if (lastTradesEl) lastTradesEl.innerHTML = renderKolLastTrades(k, state.allTrades, state.hasHelius);
  const shareBtn = $('kShareBtn');
  if (shareBtn) {
    const hasData = (k.winRate != null && k.winRate !== undefined) || (k.pnl != null && k.pnl !== undefined);
    shareBtn.disabled = !hasData;
    shareBtn.title = hasData ? 'Compartilhar no X' : 'Aguardando dados reais';
  }
  const ab = $('kABtn');
  ab.textContent = k.alertOn ? 'DESATIVAR ALERTA' : 'ATIVAR ALERTA';
  ab.classList.toggle('bg', !k.alertOn);
  ab.classList.toggle('br', k.alertOn);
  $('kolOverlay').classList.add('open');
}

function togKA() {
  if (!state.curKol) return;
  state.curKol.alertOn = !state.curKol.alertOn;
  if (state.curKol.custom) {
    const custom = getCustomWallets();
    const idx = custom.findIndex((c) => c.address === state.curKol.full);
    if (idx >= 0) {
      custom[idx] = { ...custom[idx], alertOn: state.curKol.alertOn };
      saveCustomWallets(custom);
    }
  }
  persistAlertsToStorage();
  const ab = $('kABtn');
  ab.textContent = state.curKol.alertOn ? 'DESATIVAR ALERTA' : 'ATIVAR ALERTA';
  ab.classList.toggle('bg', !state.curKol.alertOn);
  ab.classList.toggle('br', state.curKol.alertOn);
  if (state.curKol.alertOn) pushAlert('watch', state.curKol.name, 'Monitoramento ativado para esta wallet');
  renderW();
  renderStats();
  updateAlertBadge();
}

function closeKol() {
  $('kolOverlay').classList.remove('open');
}

function shareKOL(kol) {
  let line1 = `📊 ${kol.name || 'KOL'} — KOL Solana BR`;
  const stats = [];
  if (kol.winRate != null && kol.winRate !== undefined) stats.push(`Win Rate: ${kol.winRate}%`);
  if (kol.pnl != null && kol.pnl !== undefined) stats.push(`PnL: ${fmt(kol.pnl, 'BRL', state.usdBRL)}`);
  if (stats.length) line1 += '\n' + stats.join(' | ');
  const text = line1 + '\n\nMonitore os KOLs BR em tempo real 👇\n' + SITE_URL + '\nvia @WeedzinxD #SolanaBR #CryptoBR';
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  showToast('Abrindo X...');
}

function shareKOLFromModal() {
  if (!state.curKol) return;
  shareKOL(state.curKol);
}

// ─── ADD WALLET MODAL ───────────────────────────────────────────────────
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isValidSolanaAddress(addr) {
  return addr && typeof addr === 'string' && BASE58.test(addr.trim());
}

function openAddWalletModal() {
  const custom = getCustomWallets();
  const overlay = $('addWalletOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  $('awAddress').value = '';
  $('awName').value = '';
  $('awTwitter').value = '';
  $('awAlert').checked = true;
  $('awAddressErr').style.display = 'none';
  $('awLimitMsg').style.display = custom.length >= MAX_CUSTOM_WALLETS ? 'block' : 'none';
  $('awAddress').focus();
}

function closeAddWalletModal() {
  const overlay = $('addWalletOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function closeAddWalletBg(e) {
  if (e.target === $('addWalletOverlay')) closeAddWalletModal();
}

async function saveAddWallet() {
  const custom = getCustomWallets();
  if (custom.length >= MAX_CUSTOM_WALLETS) {
    showToast('Limite de 10 wallets atingido');
    return;
  }
  const addr = ($('awAddress')?.value || '').trim();
  if (!isValidSolanaAddress(addr)) {
    $('awAddressErr').style.display = 'block';
    return;
  }
  $('awAddressErr').style.display = 'none';
  const name = ($('awName')?.value || '').trim().slice(0, 20) || 'Wallet custom';
  const twitter = ($('awTwitter')?.value || '').trim();
  const alertOn = $('awAlert')?.checked ?? true;
  const newW = { address: addr, name, twitter, alertOn, addedAt: Date.now(), custom: true };
  custom.push(newW);
  saveCustomWallets(custom);
  closeAddWalletModal();
  showToast(`✅ Wallet ${name} adicionada!`);
  const periodMap = { D: 'daily', W: 'weekly', M: 'monthly' };
  const period = periodMap[($('pFil')?.value || 'D')] || 'daily';
  const pnlData = await fetchWalletPnL(addr, period);
  if (pnlData) {
    const idx = custom.findIndex((c) => c.address === addr);
    if (idx >= 0) {
      custom[idx] = { ...custom[idx], pnl: pnlData.pnl, winRate: pnlData.winRate, trades: pnlData.trades, volume: pnlData.volume };
      saveCustomWallets(custom);
    }
  } else {
    const idx = custom.findIndex((c) => c.address === addr);
    if (idx >= 0) {
      custom[idx]._noHistory = true;
      saveCustomWallets(custom);
    }
  }
  updateCustomWCount();
  renderW();
  renderStats();
}

function removeCustomWallet(address) {
  const name = getCustomWallets().find((c) => c.address === address)?.name || 'Wallet';
  if (!confirm(`Remover ${name}?`)) return;
  const custom = getCustomWallets().filter((c) => c.address !== address);
  saveCustomWallets(custom);
  state.KOLS = state.KOLS.filter((k) => k.full !== address);
  updateCustomWCount();
  renderW();
  renderStats();
  showToast('Wallet removida');
}

function updateCustomWCount() {
  const el = $('customWCount');
  if (!el) return;
  const n = getCustomWallets().length;
  el.style.display = n > 0 ? 'block' : 'none';
  el.textContent = `${n}/${MAX_CUSTOM_WALLETS} wallets customizadas`;
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

function showToast(msg, durationMs = 1400) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), durationMs);
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
      state.lastFetchAt = Date.now();
      const alertOnMap = {};
      state.KOLS.forEach((k) => {
        if (k.full) alertOnMap[k.full] = k.alertOn;
      });
      state.KOLS = kols.map((k) => ({ ...k, alertOn: alertOnMap[k.full] ?? k.alertOn }));
      initDefaultAlerts(state.KOLS);
    }
  } catch (e) {
    console.warn('[PnL] Erro:', e.message);
  }
  state.pnlLoading = false;
  renderW();
  renderStats();
  updateLastUpdateEl();
}

function onPeriodChange() {
  const period = $('pFil')?.value || 'D';
  loadKolsWithPnL(period);
}

async function forceRefreshPnL() {
  const btn = event?.target || $('reloadWalletsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'ATUALIZANDO...';
    btn.classList.add('loading');
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
    btn.classList.remove('loading');
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
      state.lastWsMsgAt = state.lastWsMsgAt || Date.now();
      state.lastFetchAt = state.lastFetchAt || Date.now();
      $('liveLabel').textContent = 'AO VIVO';
      $('wsDot')?.setAttribute('data-status', 'connected');
      $('wsDot')?.classList.add('ws-dot');
      updateWsTooltip();
    };
    ws.onmessage = (ev) => {
      state.lastWsMsgAt = Date.now();
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'trade' && msg.data) addTrade(msg.data);
        else if (msg.type === 'pnl_update' && msg.data) handlePnLUpdate(msg.data);
      } catch (e) {}
    };
    ws.onclose = () => {
      state.wsConnected = false;
      $('liveLabel').textContent = 'RECONECTANDO...';
      $('wsDot')?.setAttribute('data-status', 'connecting');
      $('wsDot')?.classList.remove('ws-dot');
      updateWsTooltip();
      setTimeout(connectWS, 3000);
    };
    ws.onerror = () => {
      state.wsConnected = false;
      $('liveLabel').textContent = 'ERRO WS';
      $('wsDot')?.setAttribute('data-status', 'error');
      updateWsTooltip();
    };
  } catch (e) {
    $('liveLabel').textContent = 'DEMO (backend offline)';
  }
}

function handlePnLUpdate(data) {
  if (!data?.kols?.length) return;
  state.lastWsMsgAt = Date.now();
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

    const removeEl = e.target.closest('[data-action="remove-custom-wallet"]');
    if (removeEl) {
      e.stopPropagation();
      const addr = removeEl.dataset.address;
      if (addr) removeCustomWallet(addr);
      return;
    }

    const shareKolEl = e.target.closest('[data-action="share-kol"]');
    if (shareKolEl) {
      e.stopPropagation();
      const id = shareKolEl.dataset.id;
      const k = state.KOLS.find((kol) => String(kol.id) === id);
      if (k) shareKOL(k);
      return;
    }

    const toggleAlertEl = e.target.closest('[data-action="toggle-alert"]');
    if (toggleAlertEl) {
      e.stopPropagation();
      const id = toggleAlertEl.dataset.id;
      const k = state.KOLS.find((kol) => String(kol.id) === id || kol.full === id);
      if (k) {
        k.alertOn = !k.alertOn;
        if (k.custom) {
          const custom = getCustomWallets();
          const idx = custom.findIndex((c) => c.address === k.full);
          if (idx >= 0) {
            custom[idx] = { ...custom[idx], alertOn: k.alertOn };
            saveCustomWallets(custom);
          }
        }
        persistAlertsToStorage();
        renderW();
        renderStats();
        updateAlertBadge();
      }
      return;
    }

    const openKolEl = e.target.closest('[data-action="open-kol"]');
    if (openKolEl && !e.target.closest('[data-action="share-kol"]') && !e.target.closest('[data-action="remove-custom-wallet"]') && !e.target.closest('[data-action="toggle-alert"]')) {
      const id = openKolEl.dataset.id;
      const k = state.KOLS.find((kol) => String(kol.id) === id || kol.full === id);
      if (k) openKol(k.id);
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

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if ($('addWalletOverlay')?.classList.contains('open')) closeAddWalletModal();
      else if ($('settingsOverlay')?.classList.contains('open')) closeSettingsModal();
      else if ($('kolOverlay')?.classList.contains('open')) closeKol();
      else if ($('onboardingOverlay')?.style.display === 'flex') closeOnboarding();
    }
  });
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

function updateWsTooltip() {
  const el = $('wsStatus');
  if (!el) return;
  const stateNames = { 0: 'conectando', 1: 'aberto', 2: 'fechando', 3: 'fechado' };
  const wsState = ws?.readyState ?? 3;
  const timeStr = state.lastWsMsgAt
    ? `Última msg: ${Math.floor((Date.now() - state.lastWsMsgAt) / 1000)}s atrás`
    : 'Nenhuma mensagem ainda';
  el.title = `WebSocket: ${stateNames[wsState] || 'desconhecido'} | ${timeStr}`;
  el.setAttribute('aria-label', `Status: ${$('liveLabel')?.textContent || ''}`);
}

function updateLastUpdateEl() {
  const el = $('lastUpdate');
  if (!el) return;
  const ts = state.lastWsMsgAt ?? state.lastFetchAt;
  if (!ts) {
    el.textContent = '—';
    el.classList.remove('last-update-stale');
    return;
  }
  const sec = Math.floor((Date.now() - ts) / 1000);
  const min = Math.floor(sec / 60);
  el.textContent = sec < 60 ? `${sec}s atrás` : `${min}min atrás`;
  el.classList.toggle('last-update-stale', sec > 300);
}

function maybeShowOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY)) return;
  const overlay = $('onboardingOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function closeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, '1');
  const overlay = $('onboardingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// ─── INIT ────────────────────────────────────────────────────────────
async function init() {
  console.log('[init] API_BASE:', API_BASE || '(mesmo domínio)');
  console.log('[init] WS_URL:', WS_URL);

  const lastUp = $('lastUpdate');
  if (lastUp) lastUp.textContent = 'carregando...';

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
  state.hasHelius = !!apiStatus.helius;
  if (!apiStatus.helius) $('banner-setup').style.display = 'block';

  renderWalletsSkeleton($('wBody'), $('emptyW'));
  const tEmptyMsg = $('tEmptyMsg');
  const tEmptySub = $('tEmptySub');
  if (tEmptyMsg) tEmptyMsg.textContent = 'Buscando as 22 wallets dos KOLs... isso leva ~5s';

  let kols = await fetchKolsPnL('daily');
  if (!kols?.length) kols = await fetchKols();
  if (kols?.length) {
    state.KOLS = kols;
    const { isFirstVisit } = initDefaultAlerts(state.KOLS);
    state.lastFetchAt = Date.now();
    console.log('[init]', state.KOLS.length, 'KOLs carregados');
    if (isFirstVisit) {
      showToast('🔔 Alertas ativados para todas as 22 wallets — você será notificado a cada trade!', 4000);
    }
  } else {
    console.warn('[init] Nenhum KOL carregado');
    $('liveLabel').textContent = 'ERRO API';
    $('wsDot')?.setAttribute('data-status', 'error');
  }

  if (tEmptyMsg) tEmptyMsg.textContent = 'Aguardando trades dos KOLs...';
  if (tEmptySub) tEmptySub.textContent = '';

  loadAIPrompt();
  setupEventDelegation();
  maybeShowOnboarding();

  updateCustomWCount();
  renderW();
  renderStats();
  renderA();
  updateAlertBadge();
  connectWS();
  updateLastUpdateEl();
  setInterval(() => {
    updateLastUpdateEl();
    updateWsTooltip();
    updateHeroCompactStats();
  }, 1000);

  setTimeout(() => {
    const dot = $('wsDot');
    if (!state.wsConnected) {
      if (!state.KOLS.length) {
        $('liveLabel').textContent = 'ERRO API';
        dot?.setAttribute('data-status', 'error');
      } else       if (!apiStatus.helius) {
        $('liveLabel').textContent = 'API KEY NECESSÁRIA';
        dot?.setAttribute('data-status', 'error');
      } else {
        $('liveLabel').textContent = API_BASE ? 'API ATIVA' : 'DEMO';
        dot?.setAttribute('data-status', 'demo');
      }
    } else {
      dot?.setAttribute('data-status', 'connected');
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
window.openAddWalletModal = openAddWalletModal;
window.closeAddWalletModal = closeAddWalletModal;
window.closeAddWalletBg = closeAddWalletBg;
window.saveAddWallet = saveAddWallet;
window.shareKOL = shareKOL;
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
    const t = c.textContent.trim();
    if (t === 'Todos') c.classList.add('active');
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
window.closeOnboarding = closeOnboarding;
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
