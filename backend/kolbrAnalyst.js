/**
 * KOLBR Analyst - Modelo fine-tuned via Hugging Face Inference API
 * Usa o modelo treinado (kolbr-analyst-7b) quando HF_KOLBR_MODEL e HF_TOKEN estão configurados.
 * Interface idêntica ao openai.js para fallback transparente.
 */
const axios = require('axios');

const HF_INFERENCE_URL = 'https://api-inference.huggingface.co/models';
const DEFAULT_TIMEOUT_MS = 20000;

function buildPrompt(tokenData, kol, tradeType) {
  const ca = tokenData.ca || tokenData.mint || '?';
  const mc = tokenData.marketCap ?? tokenData.mc ?? 0;
  const liq = tokenData.liquidity ?? tokenData.liq ?? 0;
  const vol = tokenData.volume24h ?? tokenData.vol24h ?? 0;
  const ratio = mc > 0 ? ((liq / mc) * 100).toFixed(2) : 0;

  return `Token: ${tokenData.name || '?'} (${tokenData.symbol || '?'})
Contrato: ${ca}
Chain: ${kol?.chain || 'SOL'}
Market Cap: $${Number(mc).toLocaleString()}
Liquidez: $${Number(liq).toLocaleString()}
Ratio LP/MC: ${ratio}%
Volume 24h: $${Number(vol).toLocaleString()}
Compras 24h: ${tokenData.buys ?? 0} | Vendas 24h: ${tokenData.sells ?? 0}
Variação 1h: ${tokenData.priceChange1h ?? 0}% | 24h: ${tokenData.priceChange24h ?? tokenData.change ?? 0}%
KOL: ${kol?.name || '?'} (WR: ${kol?.winRate ?? 0}%, Rank #${kol?.rank ?? '?'})
Operação: ${tradeType === 'buy' ? 'COMPRA' : 'VENDA'}`;
}

function parseJSONResponse(text) {
  if (!text || typeof text !== 'string') return null;
  let jsonStr = text.trim();
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) jsonStr = match[0];
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      veredito: parsed.veredito || 'NEUTRO',
      confianca: Math.min(10, Math.max(1, parseInt(parsed.confianca, 10) || 5)),
      resumo: parsed.resumo || '',
      pontos_positivos: Array.isArray(parsed.pontos_positivos) ? parsed.pontos_positivos : [],
      riscos: Array.isArray(parsed.riscos) ? parsed.riscos : [],
    };
  } catch {
    return null;
  }
}

/**
 * Análise via HF Inference API (modelo KOLBR Analyst)
 * Retorna { veredito, confianca, resumo, pontos_positivos, riscos } ou null em erro
 */
async function analyzeToken(tokenData, kol, tradeType, customPrompt) {
  const modelId = process.env.HF_KOLBR_MODEL;
  const token = process.env.HF_TOKEN;

  if (!modelId || !token) return null;

  const ca = tokenData.ca || tokenData.mint;
  if (!ca) return null;

  const prompt = buildPrompt(tokenData, kol, tradeType);
  const systemPrompt = `Você é o KOLBR Analyst, especialista em memecoins Solana e KOLs brasileiros. Analise o token e retorne APENAS um JSON válido (sem markdown):
{"veredito":"COMPRA|NEUTRO|EVITAR","confianca":1-10,"resumo":"...","pontos_positivos":["..."],"riscos":["..."]}`;

  const fullPrompt = customPrompt
    ? `${systemPrompt}\n\nInstruções do usuário: ${customPrompt}\n\n---\n\n${prompt}`
    : `${systemPrompt}\n\n---\n\n${prompt}`;

  const url = `${HF_INFERENCE_URL}/${modelId}`;

  try {
    const { data } = await axios.post(
      url,
      {
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.4,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: DEFAULT_TIMEOUT_MS,
      }
    );

    const raw = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
    const text = typeof raw === 'string' ? raw : raw?.toString?.() || '';
    return parseJSONResponse(text);
  } catch (e) {
    if (e.response?.status === 503) {
      console.warn('[kolbrAnalyst] Modelo carregando (503), use fallback');
    } else {
      console.warn('[kolbrAnalyst] Erro:', e.message);
    }
    return null;
  }
}

module.exports = { analyzeToken, buildPrompt, parseJSONResponse };
