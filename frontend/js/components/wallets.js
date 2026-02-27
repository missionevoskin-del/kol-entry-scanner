/**
 * Componente de lista de KOL Wallets
 */

import { fmt, fmtSub, fmtMC } from '../utils/format.js';

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Renderiza cards premium (grid responsivo — desktop + mobile)
 */
function renderWalletCards(container, data, options) {
  if (!container) return;
  const { cur, usdBRL } = options;
  const twitterHandle = (k) => (k.twitter || k.handle || '').replace(/^@/, '');
  const avatarUrl = (k) => {
    const h = twitterHandle(k);
    return h ? `https://unavatar.io/twitter/${h}?fallback=https://unavatar.io/fallback.png` : null;
  };
  container.innerHTML = data.map((k, i) => {
    const wr = k.winRate ?? 0;
    const wrClass = wr >= 65 ? 'wr-high' : wr >= 40 ? 'wr-mid' : 'wr-low';
    const pnlLoading = k.pnl === undefined && !k._pnlUpdated && !k._noHistory;
    const pnlClass = pnlLoading ? '' : (k.pnl ?? 0) >= 0 ? 'positive' : 'negative';
    const pnlVal = k._noHistory ? '⚠️ Sem histórico' : pnlLoading ? '—' : ((k.pnl ?? 0) >= 0 ? '+' : '') + fmt(Math.abs(k.pnl ?? 0), cur, usdBRL);
    const rankDisplay = k.rankPnl <= 3 && k.rankPnl !== 999 ? `${RANK_MEDAL[k.rankPnl] || ''}#${k.rankPnl}` : `#${k.rankPnl === 999 ? '—' : k.rankPnl}`;
    const av = avatarUrl(k);
    const th = twitterHandle(k);
    const delay = Math.min(i * 30, 300);
    return `<div class="w-card w-card-premium" data-action="open-kol" data-id="${k.id}" role="button" tabindex="0" style="animation-delay:${delay}ms">
      <div class="w-card-top">
        <div class="w-card-avatar-wrap">${av ? `<img class="w-card-avatar" src="${av}" alt="${k.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}<div class="w-card-avatar-placeholder" style="${av ? 'display:none' : ''}">${(k.name || '?').charAt(0).toUpperCase()}</div></div>
        <div class="w-card-info">
          <span class="w-card-name">${k.name}</span>${k.custom ? '<span class="badge-custom">👤</span>' : ''}
          ${th ? `<span class="w-card-handle">@${th}</span>` : ''}
        </div>
        <span class="w-card-rank-badge ${wrClass}">${rankDisplay} · WR ${wr}%</span>
      </div>
      <div class="w-card-pnl ${pnlClass}">${pnlVal}</div>
      <div class="w-card-meta">${k.trades ?? 0} trades · ${k.vol24 != null ? fmt(k.vol24, cur, usdBRL) : '—'} vol</div>
      <div class="w-card-actions">
        <button type="button" class="share-kol-btn w-share-btn" data-action="share-kol" data-id="${k.id}" title="Compartilhar">𝕏</button>
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
  const cardsEl = container || document.getElementById('wCards');
  if (!data.length) {
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
}

/**
 * Renderiza skeleton de loading para cards
 */
export function renderWalletsSkeleton(container, emptyEl, count = 12) {
  const cardsEl = container || document.getElementById('wCards');
  if (emptyEl) {
    emptyEl.style.display = 'none';
    emptyEl.hidden = true;
  }
  if (!cardsEl) return;
  cardsEl.innerHTML = Array(count)
    .fill(0)
    .map(
      () => `
    <div class="w-card-skeleton">
      <div class="w-card-skeleton-avatar"></div>
      <div class="w-card-skeleton-body">
        <div class="skeleton" style="width:70%;height:14px"></div>
        <div class="skeleton" style="width:50%;height:10px;margin-top:8px"></div>
        <div class="skeleton" style="width:60%;height:18px;margin-top:12px"></div>
      </div>
    </div>`
    )
    .join('');
}
