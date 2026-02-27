# Prompt para Gerar Análises Humanas (Dataset KOLBR Analyst)

Use este prompt com GPT-4 ou Claude para gerar análises a partir dos trades exportados por `export_trades_for_dataset.js`.

## Instruções

1. Execute `node scripts/export_trades_for_dataset.js` para gerar `raw_trades_for_analysis.json`
2. Para cada trade (ou em batch), envie o JSON do trade + o prompt abaixo
3. Colete as respostas em um arquivo onde cada linha tenha: `{...trade, "analysis": {...}}`
4. Use `convert_to_dataset.js` para converter para o formato de treino

## Prompt

```
Você é um analista sênior de memecoins Solana. Gerando exemplos de análise para treino de um modelo.

Para cada entrada de trade abaixo, gere uma análise em português BR no formato JSON exato:

{
  "veredito": "COMPRA" | "NEUTRO" | "EVITAR",
  "confianca": 1-10,
  "resumo": "máximo 3 linhas, direto ao ponto",
  "pontos_positivos": ["...", "..."],
  "riscos": ["...", "..."]
}

Inclua análises específicas como:
- "Esse KOL costuma entrar em memecoins de liquidez < $200k com risco médio-alto"
- "Padrão de entrada igual a 3 pumps anteriores, recomendação: monitorar slippage alto"
- "LP/MC muito baixo, histórico de rug deste token"
- "KOL top 5 com WR alto, LP razoável, mas volume baixo"

Regras:
- LP/MC < 5% = alto risco
- KOL WR > 70% e rank top 5 = positivo
- Taxas > 8% = EVITAR
- Retorne APENAS o JSON, sem markdown
```

## Exemplo de entrada (trade)

```json
{
  "ca": "xxx",
  "name": "PEPE2",
  "symbol": "PEPE2",
  "marketCap": 150000,
  "liquidity": 45000,
  "volume24h": 80000,
  "buys": 120,
  "sells": 95,
  "priceChange1h": 5,
  "priceChange24h": 12,
  "kol": { "name": "Santos", "winRate": 72, "rank": 3 },
  "tradeType": "buy"
}
```

## Exemplo de saída esperada

```json
{
  "veredito": "NEUTRO",
  "confianca": 6,
  "resumo": "LP/MC ~30% ok, KOL forte mas slippage alto em tokens pequenos. Monitorar entrada.",
  "pontos_positivos": ["KOL top 5", "LP razoável"],
  "riscos": ["Slippage alto", "Volume baixo"]
}
```
