/**
 * Score de Risco para tokens (1-10, 10 = mais seguro)
 * Combina: LP/MC, liquidez absoluta, volume, KOL que operou
 * Ajuda iniciantes a evitar rugs e honeypots
 */

/**
 * Parseia idade do token para minutos aproximados
 */
function parseAgeToMinutes(age) {
  if (!age || age === '?') return 9999;
  const s = String(age).toLowerCase();
  if (s === 'agora') return 0;
  const m = s.match(/(\d+)\s*min/);
  if (m) return parseInt(m[1], 10);
  const h = s.match(/(\d+)\s*h/);
  if (h) return parseInt(h[1], 10) * 60;
  const d = s.match(/(\d+)\s*d/);
  if (d) return parseInt(d[1], 10) * 1440;
  return 9999;
}

/**
 * Calcula score de risco 1-10 (10 = mais seguro)
 * @param {object} tok - { mc, liq, vol24h, age, kol: { winRate, rank }, taxB, taxS }
 * @returns {{ score: number, label: string, cls: string }}
 */
export function calculateRiskScore(tok) {
  const mc = Number(tok.mc || tok.marketCap || 0) || 1;
  const liq = Number(tok.liq || tok.liquidity || 0) || 0;
  const vol = Number(tok.vol24h || tok.volume24h || 0) || 0;
  const ageMin = parseAgeToMinutes(tok.age);
  const wr = Number(tok.kol?.winRate || 0) || 50;
  const rank = Number(tok.kol?.rank || 999) || 999;
  const taxB = Number(tok.taxB || 0) || 0;
  const taxS = Number(tok.taxS || 0) || 0;

  let score = 5; // base neutro

  // LP/MC: < 2% = -2, 2-5% = -1, 5-10% = 0, > 10% = +1
  const lpMcRatio = mc > 0 ? (liq / mc) * 100 : 0;
  if (lpMcRatio < 2) score -= 2;
  else if (lpMcRatio < 5) score -= 1;
  else if (lpMcRatio >= 10) score += 1;

  // Liquidez absoluta: < $5k = -2, < $20k = -1, > $50k = +1
  if (liq < 5000) score -= 2;
  else if (liq < 20000) score -= 1;
  else if (liq >= 50000) score += 1;

  // Idade: < 1h = -1, < 24h = 0, > 24h = +1
  if (ageMin < 60) score -= 1;
  else if (ageMin >= 1440) score += 1;

  // KOL: WR alto + rank top = +1
  if (wr >= 65 && rank <= 10) score += 1;

  // Taxas: > 8% = -2, > 5% = -1
  const maxTax = Math.max(taxB, taxS);
  if (maxTax > 8) score -= 2;
  else if (maxTax > 5) score -= 1;

  score = Math.max(1, Math.min(10, score));

  const labels = {
    1: { label: 'Extremo', cls: 'risk-extreme' },
    2: { label: 'Extremo', cls: 'risk-extreme' },
    3: { label: 'Alto', cls: 'risk-high' },
    4: { label: 'Alto', cls: 'risk-high' },
    5: { label: 'Médio', cls: 'risk-mid' },
    6: { label: 'Médio', cls: 'risk-mid' },
    7: { label: 'Baixo', cls: 'risk-low' },
    8: { label: 'Baixo', cls: 'risk-low' },
    9: { label: 'Baixo', cls: 'risk-low' },
    10: { label: 'Baixo', cls: 'risk-low' },
  };
  const { label, cls } = labels[score] || labels[5];

  return { score, label, cls };
}
