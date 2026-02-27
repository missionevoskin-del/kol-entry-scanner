/**
 * Painel de detalhe do token e análise IA
 */

import { fmt, fmtMC } from '../utils/format.js';

/**
 * Formata corpo da análise IA — layout premium
 */
export function formatAIBody(ai) {
  if (!ai) return null;
  if (typeof ai === 'string') return ai.replace(/\n/g, '<br>');
  const v = (ai.veredito || 'NEUTRO').toUpperCase();
  const cls = v.includes('COMPRA') ? 'buy' : v.includes('EVITAR') ? 'sell' : 'neutral';
  const conf = Math.min(10, Math.max(1, parseInt(ai.confianca, 10) || 5));
  const confPct = conf * 10;
  const pos = ai.pontos_positivos || [];
  const riscos = ai.riscos || [];
  let html = `
    <div class="ai-veredito ai-veredito--${cls}">${v}</div>
    <div class="ai-conf-bar"><div class="ai-conf-fill" style="width:${confPct}%"></div></div>
    <div class="ai-conf-label">Confiança: ${conf}/10</div>
    <div class="ai-resumo">${(ai.resumo || '').replace(/\n/g, '<br>')}</div>
    ${pos.length ? `<div class="ai-section"><span class="ai-section-icon">✓</span><strong>Pontos positivos</strong><ul>${pos.map(p=>`<li>${p}</li>`).join('')}</ul></div>` : ''}
    ${riscos.length ? `<div class="ai-section ai-section--risks"><span class="ai-section-icon">⚠</span><strong>Riscos</strong><ul>${riscos.map(r=>`<li>${r}</li>`).join('')}</ul></div>` : ''}
  `;
  return html.trim();
}

/**
 * Renderiza conteúdo do painel de token
 * Dados reais: MC, Liq, Volume, Compras/Vendas 24h, Variação (DexScreener)
 * Ownership/Tax/Holders/Score removidos — não fornecidos pelo DexScreener
 */
export function renderTokenDetail(tok, options = {}) {
  const { cur, usdBRL, kolPosition, hasAnalysis = true } = options;
  const chg = parseFloat(tok.change) || 0;
  const chgC = chg >= 0 ? 'var(--color-green)' : 'var(--color-red)';
  const logoHtml = tok.imageUrl
    ? `<img src="${tok.imageUrl}" alt="${tok.name}" loading="lazy" onerror="this.parentElement.textContent='${tok.emoji || '●'}'">`
    : tok.emoji || '●';

  let kolPnlHtml = '';
  if (kolPosition) {
    let pnlDisplay = '';
    if (kolPosition.pnl != null) {
      const pnlColor = kolPosition.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
      const pnlSign = kolPosition.pnl >= 0 ? '+' : '';
      const pnlLabel = kolPosition.isOut ? '(real.)' : '(não real.)';
      pnlDisplay = `<span style="color:${pnlColor};font-weight:700">${pnlSign}${fmt(kolPosition.pnl, cur, usdBRL)} ${pnlLabel}</span>`;
    } else {
      pnlDisplay = kolPosition.insufficientData
        ? '<span style="color:var(--muted2)">— (compra não registrada)</span>'
        : '<span style="color:var(--muted2)">—</span>';
    }
    kolPnlHtml = `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px">
        <span style="color:var(--muted2)">Posição</span>
        <span>${kolPosition.isOut ? 'Zerou' : `Segura ${fmt(kolPosition.holding, cur, usdBRL)}`}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px">
        <span style="color:var(--muted2)">PnL neste token</span>
        ${pnlDisplay}
      </div>`;
  }

  return `
    <div class="tptokhead">
      <div class="tplogo" style="background:${tok.type === 'buy' ? 'rgba(0,255,135,.1)' : 'rgba(255,59,92,.1)'}">${logoHtml}</div>
      <div>
        <div class="tptnm">${tok.name}</div>
        <div class="tptsym">${tok.symbol} · ${tok.desc || 'Token'}</div>
        <span class="cbadge csol" style="margin-top:4px;display:inline-block">SOL</span>
      </div>
    </div>
    <div class="tpgrid">
      <div class="tps"><div class="tpslbl">Market Cap</div><div class="tpsval ca">${fmtMC(tok.mc, cur, usdBRL)}</div></div>
      <div class="tps"><div class="tpslbl">Liquidez</div><div class="tpsval cy">${fmtMC(tok.liq, cur, usdBRL)}</div></div>
      <div class="tps"><div class="tpslbl">Idade</div><div class="tpsval" style="color:var(--muted2)">${tok.age}</div></div>
      <div class="tps"><div class="tpslbl">Compras 24h</div><div class="tpsval cg">${tok.buys || 0}</div></div>
      <div class="tps"><div class="tpslbl">Vendas 24h</div><div class="tpsval cr">${tok.sells || 0}</div></div>
      <div class="tps"><div class="tpslbl">Volume 24h</div><div class="tpsval cp">${fmtMC(tok.vol24h || 0, cur, usdBRL)}</div></div>
      <div class="tps"><div class="tpslbl">Variação 24h</div><div class="tpsval" style="color:${chgC}">${chg >= 0 ? '+' : ''}${chg}%</div></div>
    </div>
    <div class="tpca">
      <div class="tpcalbl">Contrato (CA)</div>
      <div class="tpcabox"><div class="tpcaaddr" title="${tok.ca}">${tok.ca}</div><button class="cpbtn" type="button" data-action="copy" data-value="${tok.ca}" aria-label="Copiar CA">⎘</button></div>
    </div>
    <div class="tplinks">
      <a class="tplnk" href="https://solscan.io/token/${tok.ca}" target="_blank" rel="noopener">🔍 EXPLORER</a>
      <a class="tplnk" href="https://dexscreener.com/solana/${tok.ca}" target="_blank" rel="noopener">📊 DEXSCREENER</a>
      <a class="tplnk" href="https://rugcheck.xyz/tokens/${tok.ca}" target="_blank" rel="noopener">🛡 RUGCHECK</a>
      <a class="tplnk" href="https://birdeye.so/token/${tok.ca}" target="_blank" rel="noopener">🦅 BIRDEYE</a>
    </div>
    <div style="padding:0 13px;margin-bottom:6px">
      <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--yellow);margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)">⚡ KOL QUE OPEROU</div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px"><span style="font-weight:700">${tok.kol?.name || '?'}</span><span style="color:${tok.type === 'buy' ? 'var(--green)' : 'var(--red)'}">${tok.type === 'buy' ? 'COMPROU' : 'VENDEU'} ${fmt(tok.valUsd, cur, usdBRL)}</span></div>
      ${kolPnlHtml}
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px"><span style="color:var(--muted2)">Win Rate</span><span style="color:var(--accent)">${tok.kol?.winRate || 0}%</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-family:var(--mono);font-size:11px"><span style="color:var(--muted2)">Ranking</span><span style="color:var(--accent)">#${tok.kol?.rank || 0}</span></div>
    </div>
    <div class="ai-box" id="aiBox">
      <div class="ai-hdr">
        <div class="ai-title">🤖 Análise com ChatGPT</div>
        <button type="button" class="btn bp neon bsm" id="aiBtn">${tok.aiAnalysis ? 'RE-ANALISAR' : '🤖 ANALISAR'}</button>
      </div>
      <div class="ai-body ${tok.aiAnalysis ? 'ready' : ''}" id="aiBody">${formatAIBody(tok.aiAnalysis) || (hasAnalysis ? 'Clique em ANALISAR para gerar análise com ChatGPT' : '<div class="ai-error-msg">Configure <strong>OPENAI_API_KEY</strong> no Railway (Variáveis) e faça redeploy. Se já configurou, verifique os logs do serviço ao clicar em ANALISAR.</div>')}</div>
      ${tok.aiAnalysis ? '<div class="analysis-actions"><button type="button" class="btn bsm" id="aiShareBtn" title="Compartilhar no X">𝕏 Compartilhar</button><button type="button" class="btn bsm" id="aiCopyBtn" title="Copiar">📋 Copiar</button></div>' : ''}
      ${tok.aiAnalysis ? '<small class="ai-watermark">Análise com ChatGPT</small>' : ''}
    </div>`;
}

/**
 * HTML do empty state do painel
 */
export function renderTokenEmpty() {
  return `
    <div class="tpempty detail-empty" id="tokDetailEmpty">
      <div class="ei" aria-hidden="true">📡</div>
      <h3>Aguardando trades</h3>
      <p>Clique em um trade no feed para ver market cap, liquidez e análise IA.</p>
      <small>Configure sua API Key para receber trades em tempo real.</small>
    </div>`;
}
