# Deploy do KOLBR Analyst Demo no Hugging Face

## Passo a passo (copiar e colar)

### 1. Instale o Hugging Face CLI (se ainda não tiver)

```bash
pip install huggingface_hub
```

### 2. Faça login no Hugging Face

```bash
huggingface-cli login
```

Cole seu token quando solicitado (crie em https://huggingface.co/settings/tokens).

### 3. Suba o Space

Na pasta raiz do projeto (onde está a pasta `space/`):

```bash
huggingface-cli upload weedzin/kolbr-analyst-demo ./space --repo-type space
```

### 4. Acesse o Space

https://huggingface.co/spaces/weedzin/kolbr-analyst-demo

---

## Alternativa: via interface web

1. Acesse https://huggingface.co/new-space
2. Nome: `weedzin/kolbr-analyst-demo`
3. SDK: **Gradio**
4. Selecione a pasta `space/` e arraste os arquivos:
   - `app.py`
   - `requirements.txt`
   - `README.md`
