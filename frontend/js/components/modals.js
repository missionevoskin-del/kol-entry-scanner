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
 * @param {object} kol
 * @param {Array} allTrades
 * @param {boolean} hasHelius - se API está configurada
 */
export function renderKolLastTrades(kol, allTrades, hasHelius = true) {
  if (!hasHelius) {
    return '<div class="klt-empty"><span>📡</span><p>Configure Helius API para ver trades ao vivo</p></div>';
  }
  const full = kol.full || (kol.wallet && String(kol.wallet).length > 25 ? kol.wallet : null);
  if (!full || !allTrades?.length) return '<p class="k-no-trades">Nenhum trade registrado nesta sessão</p>';
  const kolTrades = allTrades.filter((t) => {
    const tFull = t.kol?.full || (t.kol?.wallet && String(t.kol.wallet).length > 25 ? t.kol.wallet : null);
    return tFull && (tFull === full || tFull.toLowerCase() === full.toLowerCase());
  }).slice(0, 5);
  if (kolTrades.length === 0) return '<p class="k-no-trades">Nenhum trade registrado nesta sessão</p>';
  const fmt = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0));
  return `<div class="k-last-trades">${kolTrades.map((t) => {
    const time = t._time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const val = t.valUsd ?? 0;
    return `<div class="klt-item"><span class="klt-time">${time}</span><span class="klt-token">${t.name || t.symbol || '?'}</span><span class="klt-type ${t.type === 'buy' ? 'klt-buy' : 'klt-sell'}">${t.type === 'buy' ? 'COMPRA' : 'VENDA'}</span><span class="klt-val">$${fmt(val)}</span></div>`;
  }).join('')}</div>`;
}

/**
 * Renderiza links do modal de KOL
 */
export function renderKolLinks(kol) {
  const walletAddr = kol.full || (kol.wallet && kol.wallet.length > 25 ? kol.wallet : '');
  const twitterUrl = kol.twitterUrl || (kol.twitter ? `https://x.com/${(kol.twitter || '').replace(/^@/, '')}` : '');
  const twitterLabel = kol.twitter ? `@${kol.twitter.replace(/^@/, '')}` : (kol.handle || '');
  const links = [
    { label: 'Solscan', url: `https://solscan.io/account/${walletAddr}`, icon: '🔍' },
    { label: 'GMGN', url: `https://gmgn.ai/sol/address/${walletAddr}`, icon: '📊' },
    { label: 'Birdeye', url: `https://birdeye.so/profile/${walletAddr}?chain=solana`, icon: '🦅' },
  ];
  if (twitterUrl) links.push({ label: twitterLabel || 'X', url: twitterUrl, icon: '𝕏' });
  links.push({ label: 'Copiar', url: '#', icon: '⎘', copy: walletAddr });
  return links.map((l) =>
    l.copy
      ? `<button type="button" class="mlbtn kmlink" data-action="copy" data-value="${l.copy}">${l.icon} ${l.label}</button>`
      : `<a class="mlbtn kmlink" href="${l.url}" target="_blank" rel="noopener">${l.icon} ${l.label}</a>`
  ).join('');
}

