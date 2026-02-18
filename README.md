# KOL Entry Scanner BR

App web para traders brasileiros acompanharem operações de KOLs na Solana em tempo real. Stack: Express + WebSocket (backend), HTML/CSS/JS SPA (frontend), Helius, DexScreener, OpenAI GPT-4o mini.

## Setup

```bash
npm install
npm start
```

Servidor sobe em `http://localhost:3001`. Deploy no Railway: `npm start` (porta via `PORT`).

### Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `HELIUS_API_KEY` ou `HELIUS_RPC_KEY` | WebSocket + Enhanced Transactions |
| `OPENAI_API_KEY` | Análise sob demanda (botão ANALISAR) |

## Estrutura do Projeto

```
├── frontend/
│   ├── index.html          # Shell mínimo (meta, favicon, script)
│   ├── css/
│   │   ├── design-tokens.css  # Variáveis CSS (cores, espaçamentos)
│   │   ├── main.css           # Reset, globais, utilitários
│   │   └── components.css     # Componentes (tabelas, modals, trades)
│   └── js/
│       ├── config.js          # API_BASE, WS_URL, intervalos
│       ├── api.js             # fetch (token, analyze, BRL, KOLs)
│       ├── app.js             # Estado global, init, event delegation
│       ├── utils/
│       │   └── format.js      # fmt, fmtMC, fmtSub, timeAgo
│       └── components/
│           ├── wallets.js     # Lista KOLs, skeleton
│           ├── trades.js      # Feed de trades
│           ├── alerts.js       # Feed de alertas
│           ├── token-panel.js  # Painel do token + IA
│           └── modals.js       # Modal KOL
├── backend/
│   ├── server.js             # HTTP + WebSocket
│   ├── app.js                # Rotas Express
│   ├── helius.js             # WebSocket Helius, Enhanced Tx
│   ├── dexscreener.js        # Token data, cache 5min
│   ├── openai.js             # Análise GPT-4o mini, cache 30min
│   ├── pnlTracker.js         # Polling escalonado 10/20/30min
│   └── ...
└── data/
    ├── kols.json
    └── token_cache.json
```

## APIs (sem aumentar uso)

- **Helius**: WebSocket (trades) + Enhanced Transactions (1 por trade) + Address History (PnL). ~40k req/mês.
- **DexScreener**: Token por CA, cache 5 min.
- **OpenAI**: Análise sob demanda (botão ANALISAR), cache 30 min.
- **economia.awesomeapi**: USD/BRL a cada 5 min.

## Funcionalidades

- Lista de KOLs com PnL, Win Rate, filtros e busca (debounce 400ms)
- Trades em tempo real via WebSocket
- Painel do token com análise IA sob demanda
- Alertas visuais/sonoros para wallets monitoradas
- Toggle BRL/USD
- Período PnL: Diário, Semanal, Mensal
