# KOLBR Analyst - Scripts de Fine-tuning

Scripts para criar e treinar o modelo especialista KOLBR Analyst.

## Fluxo

1. **Exportar trades** → `node export_trades_for_dataset.js`
2. **Gerar análises** → Use o prompt em `prompt_for_human_analysis.md` com GPT/Claude
3. **Converter para treino** → `node convert_to_dataset.js raw_trades_with_analyses.json`
4. **Treinar** → `python train_kolbr_analyst.py`
5. **Converter para GGUF** → `python convert_to_gguf.py` (opcional, para Railway)

## Uso Rápido

```bash
# 1. Exportar trades do app
node scripts/export_trades_for_dataset.js

# 2. Gerar análises (manual ou via GPT) e salvar em raw_trades_with_analyses.json
# Formato: [{ ...trade, analysis: { veredito, confianca, resumo, pontos_positivos, riscos } }]

# 3. Converter para formato de treino
node scripts/convert_to_dataset.js raw_trades_with_analyses.json --output scripts/kolbr_dataset.jsonl

# 4. Treinar (requer GPU com ~16GB VRAM ou HF Jobs)
pip install -r scripts/requirements-train.txt
python scripts/train_kolbr_analyst.py --dataset scripts/kolbr_dataset.jsonl

# 5. Publicar no Hugging Face e configurar no .env:
# HF_TOKEN=hf_xxx
# HF_KOLBR_MODEL=seu-user/kolbr-analyst-7b
```

## HF Jobs

```bash
hf jobs run --flavor "1x Nvidia L4" --timeout 4h \
  --with transformers,datasets,peft,trl,bitsandbytes,accelerate \
  scripts/train_kolbr_analyst.py
```

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `export_trades_for_dataset.js` | Exporta trades de data/trades.json |
| `prompt_for_human_analysis.md` | Prompt para gerar análises com GPT |
| `convert_to_dataset.js` | Converte trades+análises → JSONL |
| `kolbr_dataset_sample.jsonl` | Amostra para teste |
| `train_kolbr_analyst.py` | SFT + QLoRA com Qwen2.5-7B |
| `convert_to_gguf.py` | Merge LoRA + salva (GGUF via llama.cpp) |
| `requirements-train.txt` | Dependências Python para treino |
