---
title: KOLBR Analyst Demo
emoji: 🌿
colorFrom: green
colorTo: blue
sdk: gradio
app_file: app.py
pinned: false
---

# KOLBR Analyst — Demo

Interface para testar o **KOLBR Analyst**, modelo especialista em análise de memecoins Solana e KOLs brasileiros.

## Como usar

1. **Cole um trade JSON** — Cole o JSON de um trade (formato do KOLBR)
2. **Puxar trade real** — Clique para buscar o último trade do app KOLBR em tempo real
3. **Buscar por wallet** — Digite uma wallet de KOL e clique em "Buscar por wallet" para encontrar um trade
4. **Analisar** — Clique para enviar ao KOLBR Analyst e ver a análise em PT-BR

## Links

- **App principal:** [KOLBR no Railway](https://kolbr-entry.up.railway.app)
- **Dataset:** [kolbr/solana-kol-trades-br](https://hf.co/datasets/kolbr/solana-kol-trades-br) (quando publicado)
- **Modelo:** [weedzin/kolbr-analyst-7b](https://hf.co/weedzin/kolbr-analyst-7b) (quando publicado)

## Deploy do Space

**Via web:** [hf.co/new-space](https://huggingface.co/new-space) → SDK Gradio → subir pasta `space/`

**Via CLI:**
```bash
huggingface-cli upload weedzin/kolbr-analyst-demo ./space --repo-type space
```

## Powered by

KOLBR Analyst — fine-tuned on Hugging Face
