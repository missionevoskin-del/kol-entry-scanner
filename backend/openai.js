/**
 * Análise de tokens - ChatGPT (GPT-4o-mini) via OpenAI
 */
const axios = require('axios');

const analysisCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min por CA

function buildCacheKey(ca, tradeType, customPrompt) {
  const promptKey = (customPrompt || '').trim().slice(0, 300);
  return `${ca}::${tradeType || 'buy'}::${promptKey}`;
}

function getCachedAnalysis(cacheKey) {
  const entry = analysisCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    analysisCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedAnalysis(cacheKey, data) {
  analysisCache.set(cacheKey, { data, ts: Date.now() });
}

/**
 * Análise de token via ChatGPT (GPT-4o-mini)
 * Retorna JSON: { veredito, confianca, resumo, pontos_positivos, riscos }
 */
async function analyzeToken(tokenData, kol, tradeType, customPrompt) {
  const ca = tokenData.ca || tokenData.mint;
  if (!ca) return null;

  const cacheKey = buildCacheKey(ca, tradeType, customPrompt);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  if (!apiKey || apiKey.length < 10) return null;

  const basePrompt = `Você é um analista sênior de criptoativos, especializado em memecoins e tokens emergentes na Solana. Sua análise é usada por traders brasileiros para decisões rápidas. Seja DETALHADO e COMPLETO.

## CONTEXTO DO ECOSSISTEMA SOLANA (2024-2025)
- Solana é o principal ecossistema de memecoins, com alta velocidade e custos baixos.
- Tokens nascem em: pump.fun (bonding curve), Raydium, Meteora, Orca. Migration para DEX = milestone.
- Padrões atuais: narrativas virais (AI, Político, Pets, Culture), comunidade ativa, holder concentration.
- Riscos comuns: rug pull (LP removida), honeypot, bot sniping, taxas abusivas (>10%), dev não renunciado.

## CRITÉRIOS DE ANÁLISE (priorize nesta ordem)
1. **Liquidez vs Market Cap**: Liquidez/MC > 5% é saudável. Abaixo de 2% = alto risco de slippage e rug.
2. **Ownership & Renúncia**: Dev renunciou? LP travada? Metadados imutáveis? Quanto % nos top holders?
3. **Taxas**: Compra/venda > 5% cada = bandeira vermelha. 0-3% = aceitável.
4. **Volume e Fluxo**: Compras 24h vs Vendas. Ratio > 1.5 pode indicar momentum; < 0.5 pode ser dump.
5. **KOL que operou**: Win rate > 70% e rank alto são positivos. WR < 50% ou entrada tardia = cautela. No resumo, contextualize: "KOL X (WR 72%, #3) costuma entrar em tokens com LP > $50k" ou "KOL com WR baixo entrando em token de alto risco = cautela redobrada".
6. **Idade do token**: Tokens com < 1h de vida = máximo risco. 24h+ com LP estável = mais confiável.
7. **Narrativa**: Tem story? Comunidade no X/Telegram? Ou é token genérico sem catalisador?

## REGRAS DE SEGURANÇA
- EVITAR: LP < $5k, MC > $500k com LP < $10k, taxas > 8%, dev não renunciado, honeypot suspeito.
- NEUTRO: Métricas médias, KOL mediano, pouca informação.
- COMPRA (com ressalvas): Boas métricas + KOL forte + narrativa clara. Nunca "COMPRA" sem riscos listados.

## FORMATO DA RESPOSTA
Retorne APENAS um JSON válido (sem markdown, sem \`\`\`):
{
  "veredito": "COMPRA" | "NEUTRO" | "EVITAR",
  "confianca": 1-10,
  "resumo": "4 a 5 linhas em português, análise completa com: dados do token (MC, LP, volume), perfil do KOL, principais riscos e recomendação prática (ex: 'entrar com stop', 'monitorar slippage', 'evitar por LP baixa')",
  "pontos_positivos": ["pelo menos 2-4 itens específicos baseados nos dados"],
  "riscos": ["pelo menos 2-4 itens específicos baseados nos dados"]
}`;
  const userPrompt = (customPrompt || '').trim();
  const prompt = userPrompt
    ? `${basePrompt}

Instruções personalizadas do usuário (aplique sem quebrar o formato JSON da resposta):
${userPrompt}`
    : basePrompt;

  const mc = tokenData.marketCap ?? tokenData.mc ?? 0;
  const liq = tokenData.liquidity ?? tokenData.liq ?? 0;
  const vol = tokenData.volume24h ?? tokenData.vol24h ?? 0;
  const change24 = tokenData.priceChange24h ?? tokenData.change ?? 0;
  const change1h = tokenData.priceChange1h ?? 0;
  const holders = tokenData.holders ?? 0;
  const taxB = tokenData.taxB ?? 0;
  const taxS = tokenData.taxS ?? 0;
  const age = tokenData.age ?? '?';
  const renounced = tokenData.renounced ?? null;
  const liqLocked = tokenData.liqLocked ?? null;
  const buySellRatio = (tokenData.buys || 0) / Math.max(1, tokenData.sells || 1);

  const kolContext = kol
    ? `KOL ${kol.name} (Win Rate ${kol.winRate ?? 0}%, Rank #${kol.rank ?? '?'}) — ${(kol.winRate ?? 0) >= 65 ? 'KOL forte, histórico positivo' : (kol.winRate ?? 0) < 50 ? 'KOL com WR baixo, cautela' : 'KOL mediano'}. Considere o perfil do KOL ao explicar por que ele pode ter entrado/saído.`
    : 'KOL desconhecido';

  const tokenInfo = `
Token: ${tokenData.name || '?'} (${tokenData.symbol || '?'})
Contrato: ${ca}
Chain: ${kol?.chain || 'SOL'}
Market Cap: $${Number(mc).toLocaleString()}
Liquidez: $${Number(liq).toLocaleString()}
Ratio LP/MC: ${mc > 0 ? ((liq / mc) * 100).toFixed(2) : 0}%
Volume 24h: $${Number(vol).toLocaleString()}
Compras 24h: ${tokenData.buys || 0} | Vendas 24h: ${tokenData.sells || 0}
Ratio buy/sell: ${buySellRatio.toFixed(2)} (${buySellRatio > 1.5 ? 'momentum' : buySellRatio < 0.5 ? 'dump' : 'neutro'})
Variação 1h: ${change1h}% | 24h: ${change24}%
Holders: ${holders}
Idade: ${age}
Taxa compra: ${taxB}% | Taxa venda: ${taxS}%
LP renunciada: ${renounced === true ? 'Sim' : renounced === false ? 'Não' : 'N/A'}
LP travada: ${liqLocked === true ? 'Sim' : liqLocked === false ? 'Não' : 'N/A'}
Operação: ${tradeType === 'buy' ? 'COMPRA' : 'VENDA'}

${kolContext}
`;

  try {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: tokenInfo },
        ],
        max_tokens: 650,
        temperature: 0.35,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 15000,
      }
    );

    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;

    // Extrair JSON (pode vir envolvido em markdown)
    let jsonStr = text.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];

    const parsed = JSON.parse(jsonStr);
    const result = {
      veredito: parsed.veredito || 'NEUTRO',
      confianca: Math.min(10, Math.max(1, parseInt(parsed.confianca, 10) || 5)),
      resumo: parsed.resumo || '',
      pontos_positivos: Array.isArray(parsed.pontos_positivos) ? parsed.pontos_positivos : [],
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos : [],
    };

    setCachedAnalysis(cacheKey, result);
    return result;
  } catch (e) {
    const status = e.response?.status;
    const detail = e.response?.data?.error?.message || e.message;
    console.warn('[openai] Erro na análise:', status ? `HTTP ${status}: ${detail}` : e.message);
    return null;
  }
}

module.exports = { analyzeToken, getCachedAnalysis };
