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
  const walletAddr = kol.full || (kol.wallet && kol.wallet.length > 25 ? kol.wallet : '');
  return `
    <a class="mlbtn" href="https://solscan.io/account/${walletAddr}" target="_blank" rel="noopener">🔍 EXPLORER</a>
    <a class="mlbtn" href="https://x.com/${(kol.handle || '').replace('@', '')}" target="_blank" rel="noopener">🐦 TWITTER/X</a>
    <button type="button" class="mlbtn" data-action="copy" data-value="${walletAddr}">⎘ COPIAR WALLET</button>
    <a class="mlbtn" href="https://kolscanbrasil.io/" target="_blank" rel="noopener">📊 KOLSCAN BR</a>
  `;
}

