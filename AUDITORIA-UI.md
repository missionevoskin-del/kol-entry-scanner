# Auditoria UI — KOL Entry Scanner BR

## Fase 1 — Itens Auditados

### 1.1 Elementos possivelmente não funcionais

| Item | Descrição |
|------|-----------|
| **Link Rugcheck** | O link `https://rugcheck.xyz/` não inclui o endereço do token (`tok.ca`). Deveria ser `https://rugcheck.xyz/tokens/{mint}` para abrir a página do token específico. |
| **Botão cfg-btn** | Classe CSS definida (.cfg-btn) mas nenhum elemento no HTML a utiliza — provavelmente botão de configurações planejado e não implementado. |
| **Badges de chain (BSC, BASE, ETH)** | CSS define `.cbsc`, `.cbase`, `.ceth` mas o projeto é só Solana — nunca serão usados. |

### 1.2 Elementos que não fazem sentido com o propósito

| Item | Descrição |
|------|-----------|
| **Coluna CHAIN** | Projeto é exclusivo Solana — a coluna sempre mostra "SOL" e não agrega decisão. |
| **RANK PNL e RANK WR separados** | Duas colunas para rankings; o Rank por PnL é o principal. WR pode ser secundário ou unificado. |
| **Prompt IA na aba Alertas** | O Prompt IA Personalizado é usado no botão ANALISAR (detalhe do token), não no fluxo de alertas. Está em local de destaque na aba errada. |
| **Ticker TOP KOLs** | Mostra os mesmos KOLs já visíveis na tabela e nos stats — informação redundante. |
| **Modal KOL — ordem das seções** | "LINKS" e "ÚLTIMAS 4 TRADES" aparecem antes do botão "ATIVAR ALERTA", que é a ação principal. |

### 1.3 O que ocupa espaço sem necessidade

| Item | Descrição |
|------|-----------|
| **Ticker** | Barra horizontal inteira com scroll contínuo dos TOP 8 KOLs — ocupa altura relevante. |
| **6 cards de stats** | Wallets, PnL, WR, Trades, Alertas, Volume — alguns poderiam ser consolidados ou reduzidos. |
| **Coluna CHAIN** | Ocupa espaço na tabela sem valor (sempre Solana). |
| **Filtros na vista** | 5 chips (Todos, Top 10, WR≥80%, PnL+, Alerta ON) sempre visíveis — poderiam ser compactados. |
| **Prompt IA com 7 linhas** | Textarea grande na aba Alertas; é configuração, não fluxo principal. |
| **Estado vazio do token** | Lista longa com 4 bullets — poderia ser mais concisa. |
| **Banner setup** | Ocupa linha inteira; poderia ser mais compacto. |

### 1.4 Candidatos a simplificação

| Item | Decisão |
|------|---------|
| **Ticker** | Remover — informação já presente na tabela e nos stats. |
| **6 cards de stats** | Manter 4 principais: Wallets, PnL Total, Trades, Alertas. Volume 24h e WR Médio podem ser colapsados ou movidos. |
| **Coluna CHAIN** | Remover — projeto é só Solana. |
| **RANK PNL / RANK WR** | Unificar em coluna "RANK" (por PnL) — WR já aparece na coluna Win Rate. |
| **Filtros** | Manter Todos, Top 10, WR≥80%, PnL+, Alerta ON; layout mais compacto (chips menores ou em linha). |
| **Prompt IA** | Mover para painel de configurações (modal) acessível por ícone; não na aba Alertas em destaque. |
| **Modal KOL** | Priorizar: ALERTA primeiro, depois stats, links e últimas trades. |
| **Banner setup** | Manter, mas mais compacto (menos altura, fonte menor). |

---

## Fase 2 — Implementações Realizadas

Ver arquivo `MUDANCAS-UI.md` para o resumo detalhado das alterações.
