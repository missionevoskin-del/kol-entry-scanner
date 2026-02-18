/**
 * OpenAI GPT-4o-mini - análise automática com cache por CA
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
 * Análise de token via GPT-4o-mini - disponível quando usuário solicitar
 * Retorna JSON: { veredito, confianca, resumo, pontos_positivos, riscos }
 */
async function analyzeToken(tokenData, kol, tradeType, customPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const ca = tokenData.ca || tokenData.mint;
  if (!ca) return null;

  const cacheKey = buildCacheKey(ca, tradeType, customPrompt);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  const basePrompt = `Você é um analista de crypto especialista em memecoins e tokens DeFi na blockchain Solana.
Analise o token abaixo de forma objetiva e direta para traders brasileiros.
Considere: market cap, liquidez, ratio compras/vendas, holders, ownership renunciado e liquidez travada.
Avalie também o histórico do KOL que operou (win rate, ranking).
Retorne APENAS um JSON válido no formato (sem markdown, sem \`\`\`):
{
  "veredito": "COMPRA" | "NEUTRO" | "EVITAR",
  "confianca": 1-10,
  "resumo": "máximo 3 linhas em português",
  "pontos_positivos": ["...", "..."],
  "riscos": ["...", "..."]
}`;
  const userPrompt = (customPrompt || '').trim();
  const prompt = userPrompt
    ? `${basePrompt}

Instruções personalizadas do usuário (aplique sem quebrar o formato JSON da resposta):
${userPrompt}`
    : basePrompt;

  const tokenInfo = `
Token: ${tokenData.name || '?'} (${tokenData.symbol || '?'})
Contrato: ${ca}
Chain: ${kol.chain}
Market Cap: $${(tokenData.marketCap || 0).toLocaleString()}
Liquidez: $${(tokenData.liquidity || 0).toLocaleString()}
Volume 24h: $${(tokenData.volume24h || 0).toLocaleString()}
Compras 24h: ${tokenData.buys || 0} | Vendas 24h: ${tokenData.sells || 0}
Variação 1h: ${tokenData.priceChange1h || 0}% | 24h: ${tokenData.priceChange24h || 0}%
KOL: ${kol.name} (WR: ${kol.winRate}%, Rank #${kol.rank})
Operação: ${tradeType === 'buy' ? 'COMPRA' : 'VENDA'}
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
        max_tokens: 400,
        temperature: 0.4,
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
    console.warn('[openai] Erro na análise:', e.message);
    return null;
  }
}

module.exports = { analyzeToken, getCachedAnalysis };
