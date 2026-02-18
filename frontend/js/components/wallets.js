/**
 * Componente de lista de KOL Wallets
 */

import { fmt, fmtSub, fmtMC } from '../utils/format.js';

/**
 * Renderiza tabela de KOLs
 * @param {HTMLElement} container - tbody
 * @param {HTMLElement} emptyEl - elemento empty state
 * @param {Array} data - KOLs filtrados
 * @param {object} options - { cur, usdBRL }
 */
export function renderWallets(container, emptyEl, data, options = {}) {
  const { cur, usdBRL } = options;
  if (!data.length) {
    container.innerHTML = '';
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

  container.innerHTML = data
    .map((k) => {
      const wr = k.winRate ?? 0;
      const wrColor = wr >= 80 ? 'var(--color-green)' : wr >= 65 ? 'var(--color-yellow)' : 'var(--color-red)';
      const pnlLoading = k.pnl === undefined && !k._pnlUpdated;
      const pnlCell = pnlLoading
        ? '<span class="spinner-inline"></span>—'
        : k.pnl >= 0
          ? `<span class="pv">+${fmt(k.pnl, cur, usdBRL)}</span>`
          : `<span class="pnv">-${fmt(Math.abs(k.pnl), cur, usdBRL)}</span>`;
      const wrCell = pnlLoading
        ? '<span class="spinner-inline"></span>—'
        : `<span style="color:${wrColor}">${wr}%</span>`;

      return `
      <tr data-action="open-kol" data-id="${k.id}" role="button" tabindex="0">
        <td style="color:var(--muted2);font-size:11px">#${k.rankPnl}</td>
        <td><div class="kn">${k.name}</div><div class="kh">${k.handle}</div></td>
        <td>
          <div class="wpill" data-action="copy" data-value="${k.full}">
            ${k.wallet}<button class="cpbtn2" aria-label="Copiar wallet">⎘</button>
          </div>
        </td>
        <td>
          ${pnlCell}
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted)">${fmtSub(Math.abs(k.pnl || 0), cur, usdBRL)}</div>
        </td>
        <td>
          <div class="wrw"><div class="wrbar"><div class="wrfill" style="width:${wr}%;background:${wrColor}"></div></div>${wrCell}</div>
        </td>
        <td style="color:var(--muted2)">${k.trades}</td>
        <td style="color:var(--accent)">${fmt(k.vol24, cur, usdBRL)}</td>
        <td data-action="no-prop"><div class="ai"><span class="adot ${k.alertOn ? 'aon' : 'aoff'}"></span><span style="color:${k.alertOn ? 'var(--green)' : 'var(--muted)'}">${k.alertOn ? 'ON' : 'OFF'}</span></div></td>
        <td data-action="no-prop"><button class="abtn" type="button" data-action="open-kol" data-id="${k.id}">VER</button></td>
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
      <td><span class="skeleton" style="width:40px"></span></td>
    </tr>`
    )
    .join('');
}
