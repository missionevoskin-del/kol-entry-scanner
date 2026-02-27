/**
 * Converte trades + análises para formato de treino SFT (JSONL).
 * Uso: node scripts/convert_to_dataset.js [input.json] [--output kolbr_dataset.jsonl]
 *
 * Input: array de { ...trade, analysis: { veredito, confianca, resumo, pontos_positivos, riscos } }
 * Output: JSONL com formato messages para SFTTrainer
 */
const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, 'raw_trades_with_analyses.json');
const OUTPUT = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : path.join(__dirname, 'kolbr_dataset.jsonl');

const SYSTEM_PROMPT = `Você é o KOLBR Analyst, especialista em memecoins Solana e KOLs brasileiros. Analise tokens e forneça veredito e recomendações em português. Retorne APENAS um JSON válido (sem markdown):
{
  "veredito": "COMPRA" | "NEUTRO" | "EVITAR",
  "confianca": 1-10,
  "resumo": "máximo 3 linhas em português",
  "pontos_positivos": ["..."],
  "riscos": ["..."]
}`;

function buildUserPrompt(t) {
  const mc = t.marketCap ?? t.mc ?? 0;
  const liq = t.liquidity ?? t.liq ?? 0;
  const vol = t.volume24h ?? t.vol24h ?? 0;
  const kol = t.kol || {};
  const ratio = mc > 0 ? ((liq / mc) * 100).toFixed(2) : 0;

  return `Token: ${t.name || '?'} (${t.symbol || '?'})
Contrato: ${t.ca || '?'}
Market Cap: $${Number(mc).toLocaleString()}
Liquidez: $${Number(liq).toLocaleString()}
Ratio LP/MC: ${ratio}%
Volume 24h: $${Number(vol).toLocaleString()}
Compras 24h: ${t.buys ?? 0} | Vendas 24h: ${t.sells ?? 0}
Variação 1h: ${t.priceChange1h ?? 0}% | 24h: ${t.priceChange24h ?? t.change ?? 0}%
KOL: ${kol.name || '?'} (WR: ${kol.winRate ?? 0}%, Rank #${kol.rank ?? '?'})
Operação: ${(t.tradeType || t.type || 'buy') === 'buy' ? 'COMPRA' : 'VENDA'}`;
}

function buildAssistantResponse(analysis) {
  const a = analysis || {};
  const obj = {
    veredito: a.veredito || 'NEUTRO',
    confianca: Math.min(10, Math.max(1, parseInt(a.confianca, 10) || 5)),
    resumo: a.resumo || '',
    pontos_positivos: Array.isArray(a.pontos_positivos) ? a.pontos_positivos : [],
    riscos: Array.isArray(a.riscos) ? a.riscos : [],
  };
  return JSON.stringify(obj);
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`[convert] Arquivo não encontrado: ${INPUT}`);
    console.log('[convert] Crie o arquivo com trades + analysis. Exemplo:');
    console.log(JSON.stringify({
      ca: 'xxx',
      name: 'PEPE2',
      symbol: 'PEPE2',
      marketCap: 150000,
      liquidity: 45000,
      volume24h: 80000,
      buys: 120,
      sells: 95,
      priceChange1h: 5,
      priceChange24h: 12,
      kol: { name: 'Santos', winRate: 72, rank: 3 },
      tradeType: 'buy',
      analysis: {
        veredito: 'NEUTRO',
        confianca: 6,
        resumo: 'LP/MC ~30% ok, KOL forte mas slippage alto.',
        pontos_positivos: ['KOL top 5', 'LP razoável'],
        riscos: ['Slippage alto', 'Volume baixo'],
      },
    }, null, 2));
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const items = Array.isArray(data) ? data : [data];

  const lines = items
    .filter((t) => t.analysis && (t.ca || t.mint))
    .map((t) => {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(t) },
        { role: 'assistant', content: buildAssistantResponse(t.analysis) },
      ];
      return JSON.stringify({ messages });
    });

  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`[convert] ${lines.length} exemplos convertidos para ${OUTPUT}`);
}

main();
