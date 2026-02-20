/**
 * Componente de feed de trades em tempo real
 */

import { fmt, fmtMC, timeAgo } from '../utils/format.js';
import { MAX_TRADES_RENDERED } from '../config.js';

/**
 * Formata badge de análise IA
 */
function formatAIBadge(tok) {
  if (!tok.aiAnalysis) return '';
  const v = (typeof tok.aiAnalysis === 'object' ? tok.aiAnalysis.veredito : tok.aiAnalysis) || '';
  const s = v.toString().toUpperCase();
  const cls = s.includes('COMPRA') ? 'buy' : s.includes('EVITAR') ? 'sell' : 'neutral';
  return `<span class="ai-score ${cls}" style="font-size:9px;margin-left:4px" title="Análise IA">IA</span>`;
}

/**
 * Obtém posição e PnL do KOL no token (agregado de todos os trades)
 * @param {Array} allTrades - todos os trades
 * @param {object} kol - KOL do trade
 * @param {string} ca - contract address do token
 * @returns {object|null} { holding, pnl, isOut } ou null
 */
export function getKolPositionForToken(allTrades, kol, ca) {
  if (!kol || !ca) return null;
  const kolFull = kol.full || (kol.wallet && String(kol.wallet).length > 25 ? kol.wallet : null);
  if (!kolFull) return null;

  const kolTrades = allTrades.filter((t) => {
    if (t.ca !== ca || !t.kol) return false;
    const tFull = t.kol.full || (t.kol.wallet && String(t.kol.wallet).length > 25 ? t.kol.wallet : null);
    return tFull && (tFull === kolFull || tFull.toLowerCase() === kolFull.toLowerCase());
  });
  if (kolTrades.length < 1) return null;

  let totalBuy = 0;
  let totalSell = 0;
  let mcAtFirstBuy = 0;
  let currentMc = 0;
  for (const t of kolTrades) {
    const v = t.valUsd ?? t.valor ?? 0;
    if (t.type === 'buy') {
      totalBuy += v;
      if (!mcAtFirstBuy) mcAtFirstBuy = t.mc ?? t.marketCap ?? 0;
    } else {
      totalSell += v;
    }
    currentMc = t.mc ?? t.marketCap ?? currentMc;
  }

  const remainingCost = totalBuy - totalSell;
  if (remainingCost <= 0) {
    const realizedPnl = totalBuy > 0 ? totalSell - totalBuy : null;
    return { holding: 0, pnl: realizedPnl, isOut: true, insufficientData: totalBuy === 0 };
  }
  if (remainingCost > 0) {
    let pnl = 0;
    if (mcAtFirstBuy > 0 && currentMc > 0) {
      const priceMult = currentMc / mcAtFirstBuy;
      const currentValue = remainingCost * priceMult;
      pnl = currentValue - remainingCost;
    }
    return { holding: remainingCost, pnl, isOut: false };
  }
  return null;
}

/**
 * Renderiza uma linha de trade
 * @param {object} tok
 * @param {object} options - { cur, usdBRL, kolPosition }
 */
export function renderTradeRow(tok, options = {}) {
  const { cur, usdBRL, kolPosition } = options;
  const now = tok._time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  tok._time = now;
  const vc = tok.type === 'buy' ? 'var(--color-green)' : 'var(--color-red)';
  const aiBadge = formatAIBadge(tok);

  let posHtml = '';
  if (kolPosition) {
    let pnlText = '';
    if (kolPosition.pnl != null) {
      const pnlColor = kolPosition.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
      const pnlSign = kolPosition.pnl >= 0 ? '+' : '';
      pnlText = kolPosition.isOut
        ? `Zerou · PnL ${pnlSign}${fmt(kolPosition.pnl, cur, usdBRL)} (real.)`
        : `Segura ${fmt(kolPosition.holding, cur, usdBRL)} · PnL <span style="color:${pnlColor}">${pnlSign}${fmt(kolPosition.pnl, cur, usdBRL)}</span>`;
    } else {
      pnlText = kolPosition.insufficientData
        ? 'Zerou · PnL — (compra não registrada)'
        : 'Zerou · PnL —';
    }
    posHtml = `<div class="tkolpos" title="${kolPosition.isOut ? 'PnL realizado' : 'Posição atual'}">${pnlText}</div>`;
  }

  return `
  <div class="trow ${tok.type}-row" data-action="show-token" role="button" tabindex="0">
    <div class="tt">${now}</div>
    <div>
      <div class="ttn">${tok.emoji || '●'} ${tok.name}${aiBadge}</div>
      <div class="tsym">${tok.symbol}</div>
      <div class="tca" data-action="copy" data-value="${tok.ca}">${(tok.ca || '').slice(0, 8)}...${(tok.ca || '').slice(-6)}<span style="margin-left:3px">⎘</span></div>
    </div>
    <div style="display:flex;align-items:center"><span class="ttag ${tok.type}-tag">${tok.type === 'buy' ? 'COMPRA' : 'VENDA'}</span></div>
    <div style="display:flex;align-items:center;font-family:var(--mono);font-weight:700;color:${vc}">${fmt(tok.valUsd, cur, usdBRL)}</div>
    <div class="tmc"><div class="mcv">${fmtMC(tok.mc, cur, usdBRL)}</div><div class="mclbl">Market Cap</div></div>
    <div class="tkol">
      <div>${tok.kol?.name || '?'}</div>
      ${posHtml}
    </div>
    <div class="tage">${tok.age}</div>
  </div>`;
}

/**
 * Renderiza lista de trades (com virtualização - máx 60 itens)
 * @param {HTMLElement} container
 * @param {Array} trades - trades filtrados
 * @param {string} filter - 'all' | 'buy' | 'sell'
 * @param {object} options - { cur, usdBRL }
 * @param {Array} allTrades - todos os trades (para calcular posição KOL)
 */
export function renderTradesList(container, trades, filter, options = {}, allTrades = []) {
  const filtered = filter === 'all' ? trades : trades.filter((t) => t.type === filter);
  const toRender = filtered.slice(0, MAX_TRADES_RENDERED);
  const opts = { ...options };
  container.innerHTML = toRender
    .map((t) => {
      opts.kolPosition = getKolPositionForToken(allTrades, t.kol, t.ca);
      return renderTradeRow(t, opts);
    })
    .join('');
  return { total: filtered.length, rendered: toRender.length };
}
