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
import { fetchTokenData, analyzeTokenAI, fetchBRLRate, fetchApiStatus, fetchKolsPnL, fetchKols, refreshPnL, fetchWalletPnL, fetchRecentTrades } from './api.js';
import { renderWallets, renderWalletsSkeleton } from './components/wallets.js';
import { renderTradesList, getKolPositionForToken } from './components/trades.js';
import { renderAlerts } from './components/alerts.js';
import { renderTokenDetail, renderTokenEmpty, formatAIBody } from './components/token-panel.js';
import { renderKolStats, renderKolLinks, renderKolLastTrades } from './components/modals.js';

// ─── STATE ─────────────────────────────────────────────────────────────
let state = {
  usdBRL: 5.12,
  solPrice: null,
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
  hasHelius: false,
  hasOpenAI: false,
  hasAnalysis: false,
  apiMode: 'checking', // 'checking', 'demo', 'real', 'error'
};
const ONBOARDING_KEY = 'kolscan_onboarding_seen';
const CUSTOM_WALLETS_KEY = 'customWallets';
const MAX_CUSTOM_WALLETS = 10;
const STORAGE_KEY_ALERTS = 'kolscan_alerts';
const STORAGE_KEY_ALERTS_INIT = 'kolscan_alerts_initialized';
const PNL_CACHE_KEY = 'kolscan_pnl_cache';
const PNL_CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4h para usar como inicial
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
const formatCurrency = (v) => fmt(Math.abs(v || 0), state.cur, state.usdBRL);

// ─── SOL PRICE (Tempo Real) ────────────────────────────────────────────
/**
 * Busca preço do SOL em tempo real via CoinGecko API (gratuita)
 */
async function fetchSolPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true');
    const data = await res.json();
    if (data?.solana?.usd) {
      state.solPrice = {
        usd: data.solana.usd,
        change24h: data.solana.usd_24h_change || 0
      };
      updateSolPriceDisplay();
      return state.solPrice;
    }
  } catch (e) {
    console.warn('[SOL] Erro ao buscar preço:', e.message);
  }
  return null;
}

function updateSolPriceDisplay() {
  const el = $('solValue');
  const container = $('solPrice');
  if (!el || !state.solPrice) return;
  
  const price = state.solPrice.usd;
  const change = state.solPrice.change24h;
  const changeStr = change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
  
  el.innerHTML = `${price.toFixed(0)} <span style="font-size:9px;color:${change >= 0 ? 'var(--green)' : 'var(--red)'}">${changeStr}</span>`;
  
  if (container) container.title = `SOL: ${price.toFixed(2)} (24h: ${changeStr})`;
}

// Atualiza preço SOL a cada 60 segundos
setInterval(fetchSolPrice, 60000);

// ─── MODE INDICATOR (DADOS REAIS vs DEMO) ────────────────────────────────
function updateModeIndicator() {
  const indicator = $('modeIndicator');
  const dot = $('modeDot');
  const label = $('modeLabel');
  
  if (!indicator || !dot || !label) return;
  
  // Remove todas as classes de modo
  indicator.classList.remove('mode-real', 'mode-demo', 'mode-error');
  
  const mode = state.apiMode;
  
  if (mode === 'real') {
    indicator.classList.add('mode-real');
    label.textContent = 'DADOS REAIS';
    indicator.title = 'Helius + OpenAI configurados - Dados em tempo real';
  } else if (mode === 'demo') {
    indicator.classList.add('mode-demo');
    label.textContent = 'MODO DEMO';
    indicator.title = 'APIs não configuradas - Exibindo dados de demonstração';
  } else if (mode === 'error') {
    indicator.classList.add('mode-error');
    label.textContent = 'ERRO API';
    indicator.title = 'Erro ao conectar com as APIs';
  } else {
    label.textContent = 'VERIFICANDO...';
    indicator.title = 'Verificando configuração das APIs...';
  }
}

// ─── PnL TOTAL STAT ───────────────────────────────────────────────────
function calcTotalPnL(wallets) {
  let total = 0;
  let count = 0;
  wallets.forEach((w) => {
    const val = w.pnl;
    if (typeof val === 'number' && !isNaN(val) && val !== null && val !== undefined) {
      total += val;
      count++;
    }
  });
  return { total, count, hasData: count > 0 };
}

function updatePnLStat(wallets, period) {
  const periodKey = period === 'daily' ? 'D' : period === 'weekly' ? 'W' : 'M';
  const { total, count, hasData } = calcTotalPnL(wallets);
  const el = $('stP');
  const elSub = $('stPs');
  const card = el?.closest('.stat');
  const periodLabel = { D: 'Diário', W: 'Semanal', M: 'Mensal' }[periodKey];

  const badge = $('pnlPeriodBadge');
  if (badge) badge.textContent = periodLabel?.toUpperCase() || 'DIÁRIO';

  if (!hasData) {
    if (el) el.textContent = '—';
    if (el) el.className = 'sval';
    if (elSub) elSub.textContent = 'Aguardando dados...';
    if (card) card.classList.remove('pnl-positive', 'pnl-negative');
    if (card) card.title = '';
    return;
  }

  const prevText = el?.textContent || '';
  const prevTotal = parseFloat(el?.dataset?.rawValue || '0');

  const formatted = formatCurrency(total);
  if (el) {
    el.textContent = (total >= 0 ? '▲ ' : '▼ ') + formatted;
    el.dataset.rawValue = total;
  }
  if (elSub) elSub.textContent = `${periodLabel} · ${count} wallets`;

  if (card) card.title = `PnL ${periodLabel}: soma real de ${count} wallets\nPositivo = verde 🌿  Negativo = queimado 🔥`;

  if (el) {
    if (total > 0) {
      el.className = 'sval pnl-positive';
      if (card) { card.classList.add('pnl-positive'); card.classList.remove('pnl-negative'); }
    } else if (total < 0) {
      el.className = 'sval pnl-negative';
      if (card) { card.classList.add('pnl-negative'); card.classList.remove('pnl-positive'); }
    } else {
      el.className = 'sval';
      if (card) card.classList.remove('pnl-positive', 'pnl-negative');
    }
  }

  if (prevText !== '—' && total !== prevTotal && card) {
    flashPnLCard(card, total > prevTotal ? 'up' : 'down');
  }
}

function flashPnLCard(card, direction) {
  const cls = direction === 'up' ? 'flash-pnl-up' : 'flash-pnl-down';
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), 800);
}

// ─── STATS ───────────────────────────────────────────────────────────
function renderStats() {
  const kols = state.KOLS;
  animateStatValue($('stW'), kols.length);
  const periodKey = state.currentPeriod === 'daily' ? 'D' : state.currentPeriod === 'weekly' ? 'W' : 'M';
  updatePnLStat(kols, state.currentPeriod);
  animateStatValue($('stT'), state.tradeCnt);
  animateStatValue($('stA'), kols.filter((k) => k.alertOn).length);
  updateAlertBadge();
  updateHeroCompactStats();
}

function animateStatValue(el, value) {
  if (!el) return;
  const prev = el.dataset.prevVal;
  el.textContent = value;
  el.dataset.prevVal = value;
  if (prev !== undefined && String(prev) !== String(value)) {
    el.classList.add('count-up');
    setTimeout(() => el.classList.remove('count-up'), 500);
  }
}

function updateHeroCompactStats() {
  const wEl = $('heroWallets');
  const tEl = $('heroTrades');
  const lEl = $('heroLastEntry');
  const wVal = state.KOLS.length || '—';
  const tVal = state.tradeCnt > 0 ? state.tradeCnt : '—';
  if (wEl) { wEl.textContent = wVal; }
  if (tEl) { tEl.textContent = tVal; }
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
    showToast('🔔 Alertas ativados para todas as 22 wallets!', 'info');
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

// ─── PnL CACHE (localStorage) ───────────────────────────────────────────
function getPnlCache(period = 'daily') {
  try {
    const raw = localStorage.getItem(PNL_CACHE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const entry = all[period];
    if (!entry?.kols?.length) return null;
    const age = Date.now() - (entry.cachedAt || 0);
    if (age > PNL_CACHE_MAX_AGE_MS) return null;
    return { kols: entry.kols, cachedAt: entry.cachedAt };
  } catch (e) {
    return null;
  }
}

function savePnlCache(period, kols) {
  if (!kols?.length) return;
  try {
    const all = JSON.parse(localStorage.getItem(PNL_CACHE_KEY) || '{}');
    all[period] = { kols, cachedAt: Date.now() };
    localStorage.setItem(PNL_CACHE_KEY, JSON.stringify(all));
  } catch (e) {}
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
  // Mostra só KOLs com Twitter (exceto wallets custom do usuário)
  let data = state.KOLS.filter((k) => k.custom || k.twitter || k.twitterUrl);
  if (state.cFilter === 'custom') {
    data = data.filter((k) => k.custom);
  }
  // Ordenação: positivos, negativos, sem histórico (evita lacunas)
  const byPnl = [...data].sort((a, b) => (b.pnl ?? -1e9) - (a.pnl ?? -1e9) || (b.winRate ?? 0) - (a.winRate ?? 0));
  const byWr = [...data].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || (b.pnl ?? -1e9) - (a.pnl ?? -1e9));
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
  else if (state.cFilter === 'pnlpos') data = data.filter((k) => (k.pnl ?? 0) > 0);
  else if (state.cFilter === 'alert') data = data.filter((k) => k.alertOn);

  // Ordenar: positivos (desc), negativos (menos negativo primeiro), sem histórico por último
  data.sort((a, b) => {
    const pa = a.pnl;
    const pb = b.pnl;
    const noHistA = a._noHistory || (pa === undefined || pa === null);
    const noHistB = b._noHistory || (pb === undefined || pb === null);
    if (noHistA && noHistB) return (a.name || '').localeCompare(b.name || '');
    if (noHistA) return 1;
    if (noHistB) return -1;
    if (pa > 0 && pb > 0) return pb - pa;
    if (pa < 0 && pb < 0) return pb - pa;
    if (pa > 0 && pb <= 0) return -1;
    if (pa <= 0 && pb > 0) return 1;
    return (pb ?? -1e9) - (pa ?? -1e9);
  });
  return data;
}

const lastPnlMap = {};
function renderW() {
  const data = getFilteredAndSortedKols();
  const options = { ...opts(), prevPnl: { ...lastPnlMap } };
  renderWallets($('wCards'), $('emptyW'), data, options);
  data.forEach((k) => { if (k.pnl != null) lastPnlMap[k.id] = k.pnl; });
  renderStats();
}

// ─── TRADES ───────────────────────────────────────────────────────────
function handleBootstrapTrades(trades) {
  const existingSigs = new Set(state.allTrades.map((t) => t.signature).filter(Boolean));
  let added = 0;
  trades.forEach((t) => {
    if (!t.signature || existingSigs.has(t.signature)) return;
    existingSigs.add(t.signature);
    const enriched = {
      ...t,
      valUsd: t.valUsd ?? t.valor ?? 0,
      mc: t.mc ?? t.marketCap ?? 0,
      ca: t.ca ?? t.mint,
      age: t.age ?? 'Agora',
      holders: t.holders ?? 0,
      taxB: t.taxB ?? 0,
      taxS: t.taxS ?? 0,
      renounced: t.renounced ?? null,
      liqLocked: t.liqLocked ?? null,
      aiAnalysis: t.aiAnalysis ?? null,
    };
    state.allTrades.unshift(enriched);
    added++;
  });
  if (state.allTrades.length > 120) state.allTrades.length = 120;
  state.tradeCnt = state.allTrades.length;
  $('tBadge').textContent = state.tradeCnt;
  state.lastWsMsgAt = Date.now();
  if (added > 0) {
    renderTradesFiltered();
    $('tEmpty').style.display = 'none';
    renderStats();
    updateHeroCompactStats();
  }
}

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
  container.innerHTML = renderTokenDetail(tok, { ...opts(), kolPosition, hasAnalysis: state.hasAnalysis });
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
      container.innerHTML = renderTokenDetail(tok, { ...opts(), kolPosition, hasAnalysis: state.hasAnalysis });
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
    runBtn.textContent = '⏳ Analisando...';
    aiBody.className = 'ai-body loading';
    aiBody.innerHTML = '<div class="ai-skeleton ai-skeleton-premium"><div class="ai-skeleton-line"></div><div class="ai-skeleton-line"></div><div class="ai-skeleton-line"></div><div class="ai-skeleton-line"></div></div><span class="ai-loading-msg">Analisando com ChatGPT...</span>';
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
    const customPrompt = getFullAIPrompt();
    const result = await analyzeTokenAI(tokenPayload, tok.kol, tok.type, customPrompt);
    runBtn.disabled = false;
    runBtn.textContent = (tok.aiAnalysis ? 'RE-ANALISAR' : '🤖 ANALISAR');
    if (!result) {
      aiBody.className = 'ai-body ready';
      aiBody.innerHTML = '<div class="ai-error-msg">Erro ao analisar. Verifique se <strong>OPENAI_API_KEY</strong> está configurado no backend.</div>';
      return;
    }
    const isFallback = result.confianca === 0 && (result.resumo || '').includes('Análise indisponível');
    if (isFallback) {
      aiBody.className = 'ai-body ready';
      aiBody.innerHTML = '<div class="ai-error-msg">Análise indisponível. Configure <strong>OPENAI_API_KEY</strong> no backend (.env) para ativar análise com ChatGPT.</div>';
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
function pushAlert(type, name, msg, data) {
  const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.alerts.unshift({ type, name, msg, t, data });
  if (state.alerts.length > 50) state.alerts.pop();
  state.unreadAlerts++;
  renderA();
  updateAlertBadge();
  playAlertSound();
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

function playAlertSound() {
  const cfgNotif = $('cfgNotif');
  if (cfgNotif && !cfgNotif.checked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
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
  $('kolOverlay').setAttribute('aria-hidden', 'false');
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
  $('kolOverlay')?.setAttribute('aria-hidden', 'true');
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

function showToast(msg, typeOrDuration = 'info') {
  const toast = $('toast');
  if (!toast) return;
  const durationMs = typeof typeOrDuration === 'number' ? typeOrDuration : 3500;
  const type = typeof typeOrDuration === 'string' ? typeOrDuration : 'info';
  const colors = { info: '#6abf7b', error: '#e05540', warn: '#c8a84b' };
  toast.style.borderLeft = `3px solid ${colors[type] || colors.info}`;
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

// ─── NOTIF TOGGLE ────────────────────────────────────────────────────
function setupNotifToggle() {
  const cfgNotif = $('cfgNotif');
  if (!cfgNotif) return;
  cfgNotif.checked = localStorage.getItem('kolbr_sound') !== 'false';
  updateNotifLabel();
  cfgNotif.addEventListener('change', () => {
    localStorage.setItem('kolbr_sound', String(cfgNotif.checked));
    updateNotifLabel();
  });
}

function updateNotifLabel() {
  const cfgNotif = $('cfgNotif');
  const el = $('cfgNotifLabel');
  if (!cfgNotif || !el) return;
  el.textContent = cfgNotif.checked ? '🔊 Som ativo' : '🔇 Mudo';
  el.style.color = cfgNotif.checked ? 'rgba(106,191,123,0.7)' : 'rgba(255,255,255,0.2)';
}

// ─── AI PROMPT ───────────────────────────────────────────────────────
const DEFAULT_AI_PROMPT = `Você é um trader profissional especializado em memecoins de Solana com mais de 3 anos de experiência operando narrativas de mercado cripto. Seu papel é analisar entradas de KOLs brasileiros e fornecer análises rápidas, diretas e acionáveis.

Ao analisar um trade, siga esta estrutura obrigatória:

**1. NARRATIVA DO TOKEN**
- Qual é o tema/narrativa por trás deste token? (meme, AI, político, animal, cultural)
- Essa narrativa está em alta, emergindo ou esfriando no mercado atual?
- Existe um catalisador recente que explica a movimentação?

**2. FORÇA DA ENTRADA**
- O market cap atual indica early entry ou entrada tardia?
- O volume e liquidez suportam a movimentação ou é thin?
- O KOL que entrou tem histórico relevante neste tipo de token?

**3. GESTÃO DE RISCO**
- Quais são os principais red flags nesta operação?
- Qual seria um stop loss lógico baseado no market cap?
- Existe risco de rug, honeypot ou concentração de supply?

**4. CENÁRIOS POSSÍVEIS**
- Cenário otimista: o que precisaria acontecer para o token multiplicar?
- Cenário pessimista: quais sinais indicariam saída imediata?

**5. NOTA GERAL**
- Avaliação de 1 a 10 para esta entrada específica
- Uma frase de conclusão direta: ENTRAR / OBSERVAR / EVITAR

Responda sempre em português brasileiro. Seja direto, técnico e sem rodeios.
Não use linguagem de hype. Trate o usuário como trader experiente que quer análise real.`;

function getStoredUserPrompt() {
  return (localStorage.getItem(AI_PROMPT_STORAGE_KEY) || '').trim();
}

function getFullAIPrompt() {
  const userPrompt = getStoredUserPrompt();
  return userPrompt ? DEFAULT_AI_PROMPT + '\n\nInstruções adicionais:\n' + userPrompt : DEFAULT_AI_PROMPT;
}

function togglePromptPreview() {
  const el = $('promptPreview');
  if (!el) return;
  if (el.style.display === 'none') {
    el.textContent = DEFAULT_AI_PROMPT;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
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
  if (input) input.value = getStoredUserPrompt();
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
      savePnlCache(state.currentPeriod, kols);
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
    showToast(e.message || 'Erro ao atualizar PnL', 'warn');
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
let wsReconnectAttempts = 0;
const WS_BASE_DELAY = 2000;
const WS_MAX_DELAY = 60000;

function connectWS() {
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      wsReconnectAttempts = 0;
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
        else if (msg.type === 'bootstrap' && msg.data?.trades?.length) handleBootstrapTrades(msg.data.trades);
      } catch (e) {}
    };
    ws.onclose = () => {
      state.wsConnected = false;
      $('liveLabel').textContent = 'RECONECTANDO...';
      $('wsDot')?.setAttribute('data-status', 'connecting');
      $('wsDot')?.classList.remove('ws-dot');
      updateWsTooltip();
      const delay = Math.min(WS_BASE_DELAY * Math.pow(2, wsReconnectAttempts), WS_MAX_DELAY);
      wsReconnectAttempts++;
      setTimeout(connectWS, delay);
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
  const byFull = new Map(state.KOLS.map((k) => [k.full || k.wallet, { ...k }]));
  updatedKols.forEach((k) => {
    const key = k.full || k.wallet;
    const prev = byFull.get(key) || {};
    byFull.set(key, {
      ...k,
      alertOn: prev.alertOn ?? k.alertOn,
      custom: prev.custom ?? k.custom,
    });
  });
  state.KOLS = Array.from(byFull.values());
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

  // Atualiza indicador de modo
  updateModeIndicator();

  // Busca preço do SOL em tempo real
  await fetchSolPrice();

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
  state.hasOpenAI = !!apiStatus.openai;
  state.hasAnalysis = !!apiStatus.hasAnalysis;
  
  // Usa o preço do SOL do backend se disponível, caso contrário busca via CoinGecko
  if (apiStatus.solPrice) {
    state.solPrice = { usd: apiStatus.solPrice, change24h: 0 };
    updateSolPriceDisplay();
  } else {
    // Busca preço do SOL via CoinGecko
    await fetchSolPrice();
  }
  
  // Determina o modo da API
  // Modo REAL: Helius configurado E habilitado E OpenAI configurado
  if (apiStatus.helius && apiStatus.helixEnabled !== false && apiStatus.openai) {
    state.apiMode = 'real';
  } else if (apiStatus.helius || apiStatus.openai) {
    state.apiMode = 'demo'; // Parcialmente configurado
  } else {
    state.apiMode = 'demo'; // Nenhuma API configurada
  }
  
  updateModeIndicator();
  
  if (!apiStatus.helius) $('banner-setup').style.display = 'block';

  const tEmptyMsg = $('tEmptyMsg');
  const tEmptySub = $('tEmptySub');
  const cached = getPnlCache('daily');
  if (cached?.kols?.length) {
    state.KOLS = cached.kols;
    state.lastFetchAt = cached.cachedAt || Date.now();
    initDefaultAlerts(state.KOLS);
    renderW();
    renderStats();
    if (tEmptyMsg) tEmptyMsg.textContent = 'Atualizando dados...';
  } else {
    renderWalletsSkeleton($('wCards'), $('emptyW'));
    if (tEmptyMsg) tEmptyMsg.textContent = 'Buscando as 22 wallets dos KOLs... isso leva ~5s';
  }

  let kols = await fetchKolsPnL('daily');
  if (!kols?.length) kols = await fetchKols();
  if (kols?.length) {
    const alertOnMap = {};
    state.KOLS.forEach((k) => { if (k.full) alertOnMap[k.full] = k.alertOn; });
    state.KOLS = kols.map((k) => ({ ...k, alertOn: alertOnMap[k.full] ?? k.alertOn }));
    initDefaultAlerts(state.KOLS);
    state.lastFetchAt = Date.now();
    savePnlCache('daily', kols);
    console.log('[init]', state.KOLS.length, 'KOLs carregados');
  } else if (!cached?.kols?.length) {
    console.warn('[init] Nenhum KOL carregado');
    $('liveLabel').textContent = 'ERRO API';
    $('wsDot')?.setAttribute('data-status', 'error');
  }

  if (tEmptyMsg) tEmptyMsg.textContent = 'Carregando trades recentes...';
  if (tEmptySub) tEmptySub.textContent = '';

  const recentTrades = await fetchRecentTrades(120);
  if (recentTrades?.length) {
    state.allTrades = recentTrades.map((t) => ({
      ...t,
      _time: t._time || new Date(t._ts || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }));
    state.tradeCnt = state.allTrades.length;
    $('tBadge').textContent = state.tradeCnt;
    renderTradesFiltered();
    $('tEmpty').style.display = 'none';
    renderStats();
    updateHeroCompactStats();
  }
  if (tEmptyMsg) tEmptyMsg.textContent = recentTrades?.length ? 'Trades recentes carregados · aguardando novos em tempo real' : 'Aguardando trades dos KOLs...';

  loadAIPrompt();
  setupNotifToggle();
  setupEventDelegation();
  maybeShowOnboarding();

  const footerVer = $('footerVersion');
  if (footerVer && LAST_UPDATE) footerVer.textContent = `v${LAST_UPDATE}`;

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
    const liveLabel = $('liveLabel');
    
    if (!state.wsConnected) {
      if (!state.KOLS.length) {
        if (liveLabel) liveLabel.textContent = 'ERRO API';
        dot?.setAttribute('data-status', 'error');
        state.apiMode = 'error';
      } else if (!state.hasHelius) {
        if (liveLabel) liveLabel.textContent = 'API KEY NECESSÁRIA';
        dot?.setAttribute('data-status', 'error');
        state.apiMode = 'demo';
      } else {
        // Helius configurado mas WebSocket não conectou
        if (liveLabel) liveLabel.textContent = state.hasOpenAI ? 'API ATIVA' : 'SEM OPENAI';
        dot?.setAttribute('data-status', 'demo');
        // Mantém modo demo se OpenAI não está configurado
        if (!state.hasOpenAI) state.apiMode = 'demo';
      }
    } else {
      // WebSocket conectado com sucesso
      dot?.setAttribute('data-status', 'connected');
      if (liveLabel) liveLabel.textContent = 'AO VIVO';
      
      // Se WebSocket conectado E Helius E OpenAI configurados → modo real
      if (state.hasHelius && state.hasOpenAI) {
        state.apiMode = 'real';
      } else if (state.hasHelius) {
        state.apiMode = 'demo'; // Só Helius, sem OpenAI
      }
    }
    updateModeIndicator();
  }, 4000);
}

init();

// Expose for inline handlers that remain in HTML
window.openKol = openKol;
window.sw = switchTab;
window.openTradeFromAlert = (alertIndex) => {
  const a = state.alerts[alertIndex];
  if (!a?.data) return;
  const tabs = qsa('.tab');
  const tradesTab = tabs?.[1];
  if (tradesTab) switchTab('trades', tradesTab);
  showTokDetail(a.data);
};
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
window.togglePromptPreview = togglePromptPreview;
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
