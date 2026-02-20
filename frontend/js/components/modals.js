/**
 * Modais - Configurações e KOL
 */

import { fmt, fmtSub } from '../utils/format.js';

/**
 * Renderiza grid de stats do modal de KOL
 */
export function renderKolStats(kol, cur, usdBRL) {
  const pnl = kol.pnl ?? null;
  const wr = kol.winRate ?? null;
  const stats = [
    { l: 'PnL Total', v: pnl != null ? ((pnl >= 0 ? '+' : '') + fmt(Math.abs(pnl), cur, usdBRL)) : '—', c: pnl != null ? (pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)') : 'var(--color-text-muted-2)' },
    { l: `PnL (${cur === 'BRL' ? 'USD' : 'BRL'})`, v: pnl != null ? fmtSub(Math.abs(pnl), cur, usdBRL) : '—', c: 'var(--color-text-muted-2)' },
    { l: 'Win Rate', v: wr != null ? wr + '%' : '—', c: wr != null ? (wr >= 75 ? 'var(--color-green)' : 'var(--color-yellow)') : 'var(--color-text-muted-2)' },
    { l: 'Trades', v: kol.trades ?? '—', c: 'var(--color-text)' },
    { l: 'Volume 24h', v: kol.vol24 != null ? fmt(kol.vol24, cur, usdBRL) : '—', c: 'var(--color-accent)' },
    { l: 'Ranking', v: kol.rank != null ? '#' + kol.rank : '—', c: 'var(--color-accent)' },
  ];
  return stats.map((s) => `<div class="ms"><div class="mslbl">${s.l}</div><div class="msval" style="color:${s.c}">${s.v}</div></div>`).join('');
}

/**
 * Renderiza últimos trades reais do KOL (da sessão em memória)
 */
export function renderKolLastTrades(kol, allTrades) {
  const full = kol.full || (kol.wallet && String(kol.wallet).length > 25 ? kol.wallet : null);
  if (!full || !allTrades?.length) return '<p class="k-no-trades">Nenhum trade registrado nesta sessão</p>';
  const kolTrades = allTrades.filter((t) => {
    const tFull = t.kol?.full || (t.kol?.wallet && String(t.kol.wallet).length > 25 ? t.kol.wallet : null);
    return tFull && (tFull === full || tFull.toLowerCase() === full.toLowerCase());
  }).slice(0, 5);
  if (kolTrades.length === 0) return '<p class="k-no-trades">Nenhum trade registrado nesta sessão</p>';
  return `<ul class="k-trades-list">${kolTrades.map((t) => `<li>${t.type === 'buy' ? '🟢' : '🔴'} ${t.name || t.symbol || '?'} — $${(t.valUsd ?? 0).toLocaleString()}</li>`).join('')}</ul>`;
}

/**
 * Renderiza links do modal de KOL
 */
export function renderKolLinks(kol) {
  const walletAddr = kol.full || (kol.wallet && kol.wallet.length > 25 ? kol.wallet : '');
  const twitterHandle = (kol.twitter || kol.handle || '').replace(/^@/, '');
  return `
    <a class="mlbtn" href="https://solscan.io/account/${walletAddr}" target="_blank" rel="noopener">🔍 EXPLORER</a>
    ${twitterHandle ? `<a class="mlbtn" href="https://x.com/${twitterHandle}" target="_blank" rel="noopener">🐦 TWITTER/X</a>` : ''}
    <button type="button" class="mlbtn" data-action="copy" data-value="${walletAddr}">⎘ COPIAR WALLET</button>
    <a class="mlbtn" href="https://kolscanbrasil.io/" target="_blank" rel="noopener">📊 KOLSCAN BR</a>
  `;
}

