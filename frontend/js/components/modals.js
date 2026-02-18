/**
 * Modais - Configurações e KOL
 */

import { fmt, fmtSub } from '../utils/format.js';

/**
 * Renderiza grid de stats do modal de KOL
 */
export function renderKolStats(kol, cur, usdBRL) {
  const stats = [
    { l: 'PnL Total', v: (kol.pnl >= 0 ? '+' : '') + fmt(Math.abs(kol.pnl), cur, usdBRL), c: kol.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)' },
    { l: `PnL (${cur === 'BRL' ? 'USD' : 'BRL'})`, v: fmtSub(Math.abs(kol.pnl), cur, usdBRL), c: 'var(--color-text-muted-2)' },
    { l: 'Win Rate', v: kol.winRate + '%', c: kol.winRate >= 75 ? 'var(--color-green)' : 'var(--color-yellow)' },
    { l: 'Trades', v: kol.trades, c: 'var(--color-text)' },
    { l: 'Volume 24h', v: fmt(kol.vol24, cur, usdBRL), c: 'var(--color-accent)' },
    { l: 'Ranking', v: '#' + kol.rank, c: 'var(--color-accent)' },
  ];
  return stats.map((s) => `<div class="ms"><div class="mslbl">${s.l}</div><div class="msval" style="color:${s.c}">${s.v}</div></div>`).join('');
}

/**
 * Renderiza links do modal de KOL
 */
export function renderKolLinks(kol) {
  return `
    <a class="mlbtn" href="https://solscan.io/account/${kol.full}" target="_blank" rel="noopener">🔍 EXPLORER</a>
    <a class="mlbtn" href="https://x.com/${kol.handle.replace('@', '')}" target="_blank" rel="noopener">🐦 TWITTER/X</a>
    <button type="button" class="mlbtn" data-action="copy" data-value="${kol.full}">⎘ COPIAR WALLET</button>
    <a class="mlbtn" href="https://kolscanbrasil.io/" target="_blank" rel="noopener">📊 KOLSCAN BR</a>
  `;
}

/**
 * Renderiza últimas trades do KOL no modal
 */
export function renderKolLastTrades(lastTrades, fmtFn) {
  if (!lastTrades.length) {
    return '<div class="kt-empty">Nenhum trade recente</div>';
  }
  return lastTrades
    .map(
      (t) => `
    <div class="kt-mini ${t.type}">
      <span class="ttag ${t.type}-tag" style="font-size:9px">${t.type === 'buy' ? 'COMPRA' : 'VENDA'}</span>
      <div>
        <div style="font-weight:700;font-size:11px">${t.name || '?'} (${t.symbol || '?'})</div>
        <div style="font-size:10px;color:var(--muted2)">${fmtFn(t.valUsd || 0)}</div>
      </div>
      <div style="font-size:9px;color:var(--muted)">${t._time || '—'}</div>
    </div>`
    )
    .join('');
}
