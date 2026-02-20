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
        <button type="button" class="share-kol-btn w-share-btn" data-action="share-kol" data-id="${k.id}" title="Compartilhar no X">𝕏</button>
        ${k.custom ? `<button type="button" class="w-remove-btn" data-action="remove-custom-wallet" data-address="${k.full || ''}" title="Remover">🗑️</button>` : ''}
        <button type="button" class="alert-toggle-btn ${k.alertOn ? 'alert-on' : 'alert-off'}" data-action="toggle-alert" data-id="${k.id}" title="${k.alertOn ? 'Desativar alerta' : 'Ativar alerta'}">${k.alertOn ? '🔔' : '🔕'}</button>
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
      const wrColor = wr >= 70 ? '#00ff96' : wr < 50 ? '#ff4444' : '#ffd700';
      const pnlLoading = k.pnl === undefined && !k._pnlUpdated && !k._noHistory;
      const pnlNum = k.pnl ?? 0;
      const pnlArrow = !pnlLoading && !k._noHistory ? (pnlNum > 0 ? ' ▲' : pnlNum < 0 ? ' ▼' : '') : '';
      const prevVal = prevPnl[k.id];
      const pnlChanged = prevVal !== undefined && prevVal !== pnlNum && !pnlLoading && !k._noHistory;
      const flashClass = pnlChanged ? (pnlNum > prevVal ? ' flash-green' : ' flash-red') : '';
      const pnlCell = k._noHistory
        ? '<span class="pnl-no-hist">⚠️ Sem histórico</span>'
        : pnlLoading
          ? '<span class="spinner-inline"></span>—'
          : pnlNum >= 0
            ? `<span class="pv${flashClass}">+${fmt(pnlNum, cur, usdBRL)}${pnlArrow}</span>`
            : `<span class="pnv${flashClass}">-${fmt(Math.abs(pnlNum), cur, usdBRL)}${pnlArrow}</span>`;
      const wrClass = wr >= 65 ? 'wr-high' : wr >= 40 ? 'wr-mid' : 'wr-low';
      const wrCell = pnlLoading && !k._noHistory
        ? '<span class="spinner-inline"></span>—'
        : `<div class="wr-wrap ${wrClass}"><div class="wr-bar"><div class="wr-fill" style="width:${Math.min(100, wr)}%"></div></div><span class="wr-pct">${wr}%</span></div>`;
      const rankDisplay = k.rankPnl <= 3 && k.rankPnl !== 999 ? `${RANK_MEDAL[k.rankPnl] || ''} #${k.rankPnl}` : (k.rankPnl === 999 ? '—' : `#${k.rankPnl}`);
      const hasShareData = (k.winRate != null && k.winRate !== undefined) || (k.pnl != null && k.pnl !== undefined);
      const rowClass = k.rankPnl <= 3 && k.rankPnl !== 999 ? ` rank-${k.rankPnl} tr-top3` : '';
      const rankTop3Class = k.rankPnl <= 3 && k.rankPnl !== 999 ? ' rank-top3' : '';
      const twitterHandle = (k.twitter || k.handle || '').replace(/^@/, '');
      const avatarUrl = twitterHandle ? `https://unavatar.io/twitter/${twitterHandle}?fallback=https://unavatar.io/fallback.png` : null;
      const medal = k.rankPnl === 1 ? '🥇 ' : k.rankPnl === 2 ? '🥈 ' : k.rankPnl === 3 ? '🥉 ' : '';

      return `
      <tr class="w-row${rowClass}" data-action="open-kol" data-id="${k.id}" role="button" tabindex="0">
        <td style="color:var(--muted2);font-size:11px">${rankDisplay}</td>
        <td class="td-kol"><div class="kol-avatar-wrap">${avatarUrl ? `<img class="kol-avatar" src="${avatarUrl}" alt="${k.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}<div class="kol-avatar-placeholder" style="${avatarUrl ? 'display:none' : ''}">${(k.name || '?').charAt(0).toUpperCase()}</div></div><div class="kol-name-wrap"><span class="kol-name kn${rankTop3Class}">${medal}${k.name}${k.custom ? ' <span class="badge-custom">👤</span>' : ''}</span>${twitterHandle ? `<span class="kol-handle">@${twitterHandle}</span>` : ''}</div></td>
        <td>
          <div class="wpill" data-action="copy" data-value="${k.full || (k.wallet && k.wallet.length > 25 ? k.wallet : '')}">
            ${k.wallet}<button class="cpbtn2" aria-label="Copiar wallet">⎘</button>
          </div>
        </td>
        <td>
          ${pnlCell}
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted)">${pnlLoading || k._noHistory ? '' : fmtSub(Math.abs(pnlNum), cur, usdBRL)}</div>
        </td>
        <td>${wrCell}</td>
        <td style="color:var(--muted2)">${k.trades ?? '—'}</td>
        <td style="color:var(--accent)">${k.vol24 != null ? fmt(k.vol24, cur, usdBRL) : '—'}</td>
        <td data-action="stop"><div class="w-cell-actions"><button type="button" class="share-kol-btn w-share-btn" data-action="share-kol" data-id="${k.id}" title="Compartilhar no X">𝕏</button>${k.custom ? `<button type="button" class="w-remove-btn" data-action="remove-custom-wallet" data-address="${k.full || ''}" title="Remover">🗑️</button>` : ''}<button type="button" class="alert-toggle-btn ${k.alertOn ? 'alert-on' : 'alert-off'}" data-action="toggle-alert" data-id="${k.id}" title="${k.alertOn ? 'Desativar alerta' : 'Ativar alerta'}" aria-label="${k.alertOn ? 'Desativar alerta' : 'Ativar alerta'}">${k.alertOn ? '🔔' : '🔕'}</button></div></td>
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
