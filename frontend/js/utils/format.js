/**
 * Funções de formatação - KOL Entry Scanner BR
 */

/**
 * Formata valor em USD ou BRL conforme moeda atual
 * @param {number} usd - Valor em USD
 * @param {string} cur - 'BRL' ou 'USD'
 * @param {number} usdBrl - Taxa USD/BRL
 */
export function fmt(usd, cur, usdBrl) {
  if (cur === 'BRL') {
    const v = usd * usdBrl;
    return 'R$\u00a0' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Formata valor alternativo (USD quando em BRL, BRL quando em USD)
 */
export function fmtSub(usd, cur, usdBrl) {
  if (cur === 'BRL') return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return 'R$\u00a0' + (usd * usdBrl).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/**
 * Formata Market Cap em formato compacto (K, M, B)
 */
export function fmtMC(usd, cur, usdBrl) {
  const v = cur === 'BRL' ? usd * usdBrl : usd;
  const s = cur === 'BRL' ? 'R$' : '$';
  if (v >= 1e9) return s + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return s + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return s + (v / 1e3).toFixed(0) + 'K';
  return s + v.toFixed(0);
}

/**
 * Timestamp relativo (ex: "há 2 min")
 */
export function timeAgo(date) {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return `há ${diffH}h`;
}
