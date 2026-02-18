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
 * Renderiza uma linha de trade
 * @param {object} tok
 * @param {object} options - { cur, usdBRL }
 */
export function renderTradeRow(tok, options = {}) {
  const { cur, usdBRL } = options;
  const now = tok._time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  tok._time = now;
  const vc = tok.type === 'buy' ? 'var(--color-green)' : 'var(--color-red)';
  const aiBadge = formatAIBadge(tok);

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
    <div class="tkol">${tok.kol?.name || '?'}</div>
    <div class="tage">${tok.age}</div>
  </div>`;
}

/**
 * Renderiza lista de trades (com virtualização - máx 60 itens)
 */
export function renderTradesList(container, trades, filter, options = {}) {
  const filtered = filter === 'all' ? trades : trades.filter((t) => t.type === filter);
  const toRender = filtered.slice(0, MAX_TRADES_RENDERED);
  container.innerHTML = toRender.map((t) => renderTradeRow(t, options)).join('');
  return { total: filtered.length, rendered: toRender.length };
}
