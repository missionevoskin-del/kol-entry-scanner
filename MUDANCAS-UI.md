# Resumo das Mudanças de UI — KOL Entry Scanner BR

## O que foi removido

| Item | Motivo |
|------|--------|
| **Ticker "TOP KOLs"** | Informação redundante — mesmos dados da tabela e stats. Liberou espaço vertical. |
| **Coluna CHAIN** | Projeto é só Solana — coluna sempre mostrava "SOL". |
| **Coluna RANK WR** | Unificada com RANK (por PnL). Win Rate já aparece em coluna própria. |
| **2 cards de stats** | Win Rate Médio e Volume 24h — menos críticos. Mantidos: Wallets, PnL Total, Trades ao Vivo, Alertas Ativos. |
| **Chain badge no feed de trades** | Sempre Solana; badge removido para reduzir ruído. |
| **Prompt IA na aba Alertas** | Movido para modal de configurações — não faz parte do fluxo de alertas. |

## O que foi simplificado

| Item | Antes | Depois |
|------|-------|--------|
| **Stats** | 6 cards | 4 cards (Wallets, PnL, Trades, Alertas) |
| **Tabela Wallets** | 11 colunas (RANK PNL, RANK WR, KOL, WALLET, CHAIN, PnL, WR, TRADES, VOL 24H, ALERTA, VER) | 9 colunas (RANK, KOL, WALLET, PnL, WR, TRADES, VOL 24H, ALERTA, VER) |
| **Estado vazio do token** | 4 bullets + texto longo | Texto curto e objetivo |
| **Banner setup** | 2 linhas, padding maior | 1 linha compacta |
| **Modal KOL** | Links e Últimas Trades antes do botão Alerta | Botão ALERTA em primeiro lugar (ação principal) |

## O que foi corrigido

| Item | Correção |
|------|----------|
| **Link Rugcheck** | Antes: `https://rugcheck.xyz/` (genérico). Agora: `https://rugcheck.xyz/tokens/${tok.ca}` (token específico). |
| **Botão de configurações** | Adicionado botão ⚙ na topbar — antes só existia CSS, sem elemento no HTML. |

## O que foi adicionado

| Item | Descrição |
|------|-----------|
| **Modal de Configurações** | Acessível pelo botão ⚙ na topbar e na aba Alertas. Contém: Prompt IA Personalizado, Salvar, Resetar. |
| **Prompt IA centralizado** | Configuração agora em um único local, não mais na aba Alertas em destaque. |

## Layout e responsividade

- **Stats**: 4 colunas no desktop; 2 em tablets; 1 em mobile
- **Banner**: Layout inline mais compacto
- **Modal KOL**: Seção de alerta prioritária no topo

## APIs preservadas

Todas as chamadas existentes foram mantidas:
- `/api/kols`, `/api/kols/pnl`, `/api/kols/refresh-pnl`
- `/api/token/:ca`, `/api/analyze`, `/api/status`
- WebSocket `/ws`

## Funcionalidades mantidas

- Lista de KOLs com PnL, Win Rate, trades, botão de alerta
- Feed de trades em tempo real
- Detalhe do token (market cap, liquidez, links, botão ANALISAR)
- Alertas quando wallet monitorada operar
- Cotação BRL/USD dinâmica
- Status de conexão (AO VIVO / API KEY NECESSÁRIA)
