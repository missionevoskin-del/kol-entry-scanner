# Changelog - Mega Atualização Profissional

## Resumo

Refatoração do KOL Entry Scanner BR para aparência e organização de produto profissional, **sem aumentar** o consumo de APIs. Foco em UI/UX, código organizado, tratamento de erros e performance no cliente.

---

## Auditoria e Correções (2025-02)

### Handlers duplicados

- **pFil, ttFil, kABtn**: Removidos `addEventListener` duplicados; mantidos apenas handlers inline no HTML para evitar execução dupla.

### Event delegation vs inline

- **Chips, tabs, sort**: Delegation verificava `data-filter`, `data-tab`, `data-sort` que os elementos não possuem. Código morto removido; chips/tabs/sort continuam via inline (`setF`, `sw`, `sb`).

### Código morto

- **appendTradeRow**: Função removida; nunca era chamada. Fluxo usa `addTrade` → `renderTradesFiltered` → `renderTradesList`.

### Dados KOL incompletos

- **wallet vs full**: Backend (`app.js`) normaliza `full` quando ausente (fallback: `wallet` se length > 25).
- **wallets.js, modals.js**: Fallback `k.full || (k.wallet se longo)` para copy e links.
- **openKol lastTrades**: Filtro usa `kolFull` e `tFull` com fallback para KOLs sem `full`.

### Copy-to-clipboard

- **copyFeedback**: Suporte a `.cpbtn` e `.cpbtn2` além de `.copy-btn` para feedback visual em wallet pills e token panel.
- Removido handler duplicado de copy em `.tca`; já tratado pelo handler principal.

### APIs e erros

- **fetchBRLRate**: Exibe "R$ —" no `setInterval` quando fetch falha (antes só na init).
- **fetchApiStatus, fetchKols, fetchKolsPnL, refreshPnL**: Uso seguro de `API_BASE || ''` para URLs relativas em produção.
- **fetchKols**: Trata `{ kols }` e array direto via `data?.kols ?? (Array.isArray(data) ? data : [])`.

---

## Fase 1 — Refatoração de Código

### Frontend modular

- **`index.html`**: Shell mínimo (meta, SEO, links CSS, script module)
- **`css/design-tokens.css`**: Variáveis CSS (cores, fontes, espaçamentos, transições)
- **`css/main.css`**: Reset, globais, skeleton loaders, utilitários
- **`css/components.css`**: Tabelas, modais, trades, token panel, alertas
- **`js/config.js`**: API_BASE, WS_URL, SEARCH_DEBOUNCE_MS, MAX_TRADES_RENDERED
- **`js/api.js`**: Centralização de fetch (token, analyze, BRL, KOLs, refresh PnL)
- **`js/app.js`**: Estado global, init, event delegation
- **`js/utils/format.js`**: fmt, fmtSub, fmtMC, timeAgo
- **`js/components/wallets.js`**: renderWallets, renderWalletsSkeleton
- **`js/components/trades.js`**: renderTradeRow, renderTradesList (virtualização 60 itens)
- **`js/components/alerts.js`**: renderAlerts
- **`js/components/token-panel.js`**: renderTokenDetail, formatAIBody, renderTokenEmpty
- **`js/components/modals.js`**: renderKolStats, renderKolLinks, renderKolLastTrades

### Padrões

- `type="module"` para imports ES6
- Constantes em config
- Event delegation para handlers dinâmicos
- Funções puras em format e components

---

## Fase 2 — UI/UX

- Design tokens em variáveis (`--color-*`, `--space-*`, `--transition-*`)
- Aliases para compatibilidade com estilos existentes
- Skeleton loaders em vez de spinners genéricos
- Toast para feedback de ações (copiar, salvar)
- Indicador WebSocket (CONECTANDO, AO VIVO, RECONECTANDO, ERRO)

---

## Fase 3 — Estados e Erros

- Skeleton para lista de KOLs durante carregamento
- Estado loading no botão ANALISAR (desabilitado, "ANALISANDO...")
- Mensagens amigáveis (sem stack traces)
- Banner quando Helius não configurado

---

## Fase 4 — Performance (cliente)

- **Virtualização**: até 60 trades renderizados no feed
- **Debounce**: busca de KOLs 400ms
- **Lazy load**: `loading="lazy"` em imagens do token
- Mantidos: cache DexScreener 5min, OpenAI 30min

---

## Fase 5 — Acessibilidade e SEO

- `aria-label` em inputs e botões
- `aria-live="polite"` em feed de trades e alertas
- `role="status"` e `role="button"` onde apropriado
- Meta tags: description, keywords
- Preconnect para fonts
- Estrutura semântica preservada

---

## Restrições Respeitadas

- Nenhuma nova chamada às APIs externas
- Polling PnL: 10/20/30 min inalterados
- TTL DexScreener 5min, OpenAI 30min
- WebSocket continua canal principal de trades
- Análise IA sob demanda (botão ANALISAR)
- fetchBRLRate a cada 5 min

---

## Decisões Técnicas

1. **Deploy estático**: Sem bundler; `type="module"` com imports relativos
2. **Compatibilidade**: CSS mantém classes originais; design tokens como camada adicional
3. **Event delegation**: Handlers em document para elementos dinâmicos (trades, copy)
4. **Handlers inline**: Alguns permanecem (setCur, sw, openSettingsModal) por simplicidade
