/**
 * Componente de lista de KOL Wallets
 */

import { fmt, fmtSub, fmtMC } from '../utils/format.js';

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Renderiza cards para mobile
 */
function renderWalletCards(container, data, options) {
  if (!container) return;
  const { cur, usdBRL } = options;
  container.innerHTML = data.map((k) => {
    const wr = k.winRate ?? 0;
    const pnlLoading = k.pnl === undefined && !k._pnlUpdated && !k._noHistory;
    const pnlClass = pnlLoading ? '' : (k.pnl ?? 0) >= 0 ? 'positive' : 'negative';
    const pnlVal = k._noHistory ? '⚠️ Sem histórico' : pnlLoading ? '—' : ((k.pnl ?? 0) >= 0 ? '+' : '') + fmt(Math.abs(k.pnl ?? 0), cur, usdBRL);
    const rankDisplay = k.rankPnl <= 3 && k.rankPnl !== 999 ? `${RANK_MEDAL[k.rankPnl] || ''}#${k.rankPnl}` : `#${k.rankPnl === 999 ? '—' : k.rankPnl}`;
    const hasShareData = (k.winRate != null && k.winRate !== undefined) || (k.pnl != null && k.pnl !== undefined);
    return `<div class="w-card" data-action="open-kol" data-id="${k.id}" role="button" tabindex="0">
      <div><span class="w-card-name">${k.name}</span>${k.custom ? '<span class="badge-custom">👤 Custom</span>' : ''}<span class="w-card-rank">${rankDisplay}</span></div>
      <div class="w-card-pnl ${pnlClass}">${pnlVal}</div>
      <div class="w-card-wr">WR ${wr}% · ${k.trades ?? 0} trades</div>
      <div class="w-card-actions">
        ${hasShareData ? `<button type="button" class="w-share-btn" data-action="share-kol" data-id="${k.id}" title="Compartilhar no X">𝕏</button>` : ''}
        ${k.custom ? `<button type="button" class="w-remove-btn" data-action="remove-custom-wallet" data-address="${k.full || ''}" title="Remover">🗑️</button>` : ''}
        <span class="adot ${k.alertOn ? 'aon' : 'aoff'}"></span>
      </div>
    </div>`;
  }).join('');
}

/**
 * Renderiza tabela de KOLs
 * @param {HTMLElement} container - tbody
 * @param {HTMLElement} emptyEl - elemento empty state
 * @param {Array} data - KOLs filtrados
 * @param {object} options - { cur, usdBRL }
 */
export function renderWallets(container, emptyEl, data, options = {}) {
  const { cur, usdBRL, prevPnl = {} } = options;
  const cardsEl = document.getElementById('wCards');
  if (!data.length) {
    container.innerHTML = '';
    if (cardsEl) cardsEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.hidden = false;
      emptyEl.setAttribute('aria-hidden', 'false');
    }
    return;
  }
  if (emptyEl) {
    emptyEl.style.display = 'none';
    emptyEl.hidden = true;
    emptyEl.setAttribute('aria-hidden', 'true');
  }

  renderWalletCards(cardsEl, data, options);

  container.innerHTML = data
    .map((k) => {
      const wr = k.winRate ?? 0;
      const wrColor = wr >= 80 ? 'var(--color-green)' : wr >= 65 ? 'var(--color-yellow)' : 'var(--color-red)';
      const pnlLoading = k.pnl === undefined && !k._pnlUpdated && !k._noHistory;
      const pnlNum = k.pnl ?? 0;
      const pnlArrow = !pnlLoading && !k._noHistory ? (pnlNum > 0 ? ' ▲' : pnlNum < 0 ? ' ▼' : '') : '';
      const pnlChanged = prevPnl[k.id] !== undefined && prevPnl[k.id] !== pnlNum && !pnlLoading && !k._noHistory;
      const flashClass = pnlChanged ? ' flash' : '';
      const pnlCell = k._noHistory
        ? '<span class="pnl-no-hist">⚠️ Sem histórico</span>'
        : pnlLoading
          ? '<span class="spinner-inline"></span>—'
          : pnlNum >= 0
            ? `<span class="pv${flashClass}">+${fmt(pnlNum, cur, usdBRL)}${pnlArrow}</span>`
            : `<span class="pnv${flashClass}">-${fmt(Math.abs(pnlNum), cur, usdBRL)}${pnlArrow}</span>`;
      const wrCell = pnlLoading && !k._noHistory
        ? '<span class="spinner-inline"></span>—'
        : `<span style="color:${wrColor}">${wr}%</span>`;
      const rankDisplay = k.rankPnl <= 3 && k.rankPnl !== 999 ? `${RANK_MEDAL[k.rankPnl] || ''} #${k.rankPnl}` : (k.rankPnl === 999 ? '—' : `#${k.rankPnl}`);
      const hasShareData = (k.winRate != null && k.winRate !== undefined) || (k.pnl != null && k.pnl !== undefined);
      const rowClass = k.rankPnl <= 3 && k.rankPnl !== 999 ? ` rank-${k.rankPnl}` : '';

      return `
      <tr class="w-row${rowClass}" data-action="open-kol" data-id="${k.id}" role="button" tabindex="0">
        <td style="color:var(--muted2);font-size:11px">${rankDisplay}</td>
        <td><div class="kn">${k.name}${k.custom ? ' <span class="badge-custom">👤</span>' : ''}</div><div class="kh">${k.handle || k.twitter || ''}</div></td>
        <td>
          <div class="wpill" data-action="copy" data-value="${k.full || (k.wallet && k.wallet.length > 25 ? k.wallet : '')}">
            ${k.wallet}<button class="cpbtn2" aria-label="Copiar wallet">⎘</button>
          </div>
        </td>
        <td>
          ${pnlCell}
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted)">${pnlLoading || k._noHistory ? '' : fmtSub(Math.abs(pnlNum), cur, usdBRL)}</div>
        </td>
        <td>
          <div class="wrw"><div class="wrbar"><div class="wrfill" style="width:${Math.min(100, wr)}%;background:${wrColor}"></div></div>${wrCell}</div>
        </td>
        <td style="color:var(--muted2)">${k.trades ?? '—'}</td>
        <td style="color:var(--accent)">${k.vol24 != null ? fmt(k.vol24, cur, usdBRL) : '—'}</td>
        <td data-action="no-prop"><div class="w-cell-actions"><button type="button" class="w-share-btn" data-action="share-kol" data-id="${k.id}" title="Compartilhar no X" ${!hasShareData ? 'disabled' : ''}>𝕏</button>${k.custom ? `<button type="button" class="w-remove-btn" data-action="remove-custom-wallet" data-address="${k.full || ''}" title="Remover">🗑️</button>` : ''}<span class="adot ${k.alertOn ? 'aon' : 'aoff'}"></span><span style="color:${k.alertOn ? 'var(--green)' : 'var(--muted)'}">${k.alertOn ? 'ON' : 'OFF'}</span></div></td>
      </tr>`;
    })
    .join('');
}

/**
 * Renderiza skeleton de loading para lista de KOLs
 */
export function renderWalletsSkeleton(container, emptyEl, count = 8) {
  if (emptyEl) {
    emptyEl.style.display = 'none';
    emptyEl.hidden = true;
  }
  container.innerHTML = Array(count)
    .fill(0)
    .map(
      () => `
    <tr class="skeleton-row">
      <td><span class="skeleton" style="width:24px"></span></td>
      <td>
        <span class="skeleton" style="width:80px"></span>
        <span class="skeleton" style="width:60px;margin-top:4px"></span>
      </td>
      <td><span class="skeleton" style="width:100px"></span></td>
      <td><span class="skeleton" style="width:60px"></span></td>
      <td><span class="skeleton" style="width:50px"></span></td>
      <td><span class="skeleton" style="width:30px"></span></td>
      <td><span class="skeleton" style="width:50px"></span></td>
      <td><span class="skeleton" style="width:40px"></span></td>
    </tr>`
    )
    .join('');
}
