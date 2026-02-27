# Guia KOLBR Analyst — Do Zero ao Modelo no Ar

Tutorial super simples pra quem nunca fez isso. Vamos criar um modelo de IA que fala como um analista de memecoins de verdade, em português BR.

---

## O que você vai fazer (resumão)

1. Pegar seus trades reais do app (exportar a lista)
2. Pedir pro GPT ou Claude gerar análises pra cada trade
3. Converter tudo pro formato que o treino usa
4. Treinar o modelo (na nuvem do HF ou no seu PC com GPU)
5. Configurar no Railway (KOLBR Analyst primeiro, OpenAI de backup)

---

## 1 — Pegar seus trades reais do KOLBR

**O que você precisa:** O app rodando com Helius ativado pra pegar trades em tempo real.

*(É tipo exportar a lista dos trades que o app já guardou.)*

**Como fazer:**

1. Abra o app KOLBR e deixa ele rodando por um tempo (horas ou dias) pra ele ir guardando os trades na pasta `data/`.
2. Quando tiver um monte de trades salvos, abra o terminal (ou prompt de comando) na pasta do projeto.
3. Rode este comando:

```bash
node scripts/export_trades_for_dataset.js
```

**O que acontece:**  
Você vai ver uma mensagem tipo "X trades exportados para scripts/raw_trades_for_analysis.json".  
Esse arquivo é a lista dos seus trades em formato que a IA vai entender. Pronto, primeiro passo no bolso.

**Se não tiver trades ainda:**  
O script cria 2 exemplos de mentira pra você testar. Mas o ideal é rodar o app com Helius ativado e deixar acumular trades reais.

---

## 2 — Gerar as análises com GPT ou Claude

**O que você precisa:** Conta no ChatGPT (GPT-4) ou Claude (Anthropic). Ou os dois.

**Como fazer:**

1. Abra o arquivo `scripts/raw_trades_for_analysis.json` (o que você criou no passo 1).
2. Copie o conteúdo e cola no ChatGPT ou Claude.
3. Cole também este prompt (copie tudo):

```
Você é um analista sênior de memecoins Solana. Para cada trade abaixo, gere uma análise em português BR.

Retorne APENAS um JSON válido (sem markdown) para cada trade:
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
```

4. A IA vai te devolver um JSON pra cada trade. Junte cada trade com sua análise.  
   O formato final de cada item deve ser: `{ ...trade, "analysis": { ... } }`

5. Salve tudo num arquivo chamado `scripts/raw_trades_with_analyses.json`  
   (deve ser um array: `[ { ... }, { ... }, ... ]`)

**Dica:** Se tiver muitos trades, manda em lotes de 10–20 pro GPT/Claude pra não estourar o limite.

---

## 3 — Transformar em dataset pro treino

**O que você precisa:** O arquivo `raw_trades_with_analyses.json` que você criou no passo 2.

**Como fazer:**

```bash
node scripts/convert_to_dataset.js scripts/raw_trades_with_analyses.json --output scripts/kolbr_dataset.jsonl
```

**O que acontece:**  
O script cria o arquivo `scripts/kolbr_dataset.jsonl` — esse é o "material de estudo" que o modelo vai usar no treino.

**Se der erro:**  
Confira se o arquivo tem o formato certo: cada item precisa ter `analysis` com `veredito`, `confianca`, `resumo`, `pontos_positivos` e `riscos`.

---

## 4 — Rodar o treino

Você tem duas opções: **fácil (na nuvem)** ou **no seu PC (se tiver GPU boa)**.

### Opção A — Fácil: Hugging Face Jobs (na nuvem)

**O que você precisa:** Conta no Hugging Face (grátis) + plano PRO ou créditos pra Jobs (poucos dólares).

**Como fazer:**

1. Instale o Hugging Face CLI: `pip install huggingface_hub`
2. Faça login: `huggingface-cli login` (ou `hf login`)
3. Rode:

```bash
hf jobs run --flavor "1x Nvidia L4" --timeout 4h \
  --with transformers,datasets,peft,trl,bitsandbytes,accelerate \
  scripts/train_kolbr_analyst.py
```

**O que acontece:**  
O treino roda na nuvem do Hugging Face. Quando terminar, o modelo fica salvo em `./kolbr-analyst-7b` (ou na pasta que você configurou).

**Depois:**  
Suba o modelo pro seu perfil no Hugging Face: `huggingface-cli upload seu-usuario kolbr-analyst-7b ./kolbr-analyst-7b`

### Opção B — Local (se tiver GPU com ~16GB de memória)

**O que você precisa:** PC com GPU NVIDIA (T4, L4, RTX 3080 ou melhor) e ~16GB de VRAM.

**Como fazer:**

1. Instale as dependências: `pip install -r scripts/requirements-train.txt`
2. Rode: `python scripts/train_kolbr_analyst.py`
3. Aguarde (pode levar 1–3 horas dependendo da GPU)

---

## 5 — Quanto mais ou menos vai custar?

| Onde treina | Custo aproximado |
|-------------|------------------|
| **HF Jobs (T4)** | ~$1.00 a $1.50 por treino |
| **HF Jobs (L4)** | ~$1.00 a $1.60 por treino |
| **HF Jobs (A10G)** | ~$1.00 por treino |
| **Seu PC** | Só a conta de luz (e o tempo do PC) |

**Resumo:** Com uns 500–2000 exemplos, o treino na nuvem sai por volta de **1 a 2 dólares**.

---

## 6 — Colocar o modelo no site no Railway com fallback pro OpenAI

**O que você precisa:** O modelo já treinado e publicado no Hugging Face (ex: `seu-usuario/kolbr-analyst-7b`).

**Como fazer:**

1. Crie um token no Hugging Face: https://huggingface.co/settings/tokens  
   (precisa ter permissão de leitura)

2. No Railway, abra as variáveis de ambiente do seu projeto.

3. Adicione:

```
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx
HF_KOLBR_MODEL=seu-usuario/kolbr-analyst-7b
```

4. Mantenha também o `OPENAI_API_KEY` configurado (é o fallback).

5. Faça deploy de novo.

**O que acontece:**  
Quando alguém clicar em "Analisar" no site:

- Primeiro o app tenta usar o **KOLBR Analyst** (seu modelo treinado).
- Se der erro (modelo carregando, timeout, etc.), ele usa o **OpenAI** automaticamente.

**Resumo:** KOLBR Analyst tem prioridade. OpenAI fica de backup.

---

## 7 — Script automático (quase tudo no automático)

A gente criou um script que faz o máximo possível sozinho pra você não ter que digitar tudo.

**Como usar:**

1. **No Windows:** dê duplo clique em `setup_kolbr_analyst.bat` ou rode no prompt de comando:

```cmd
setup_kolbr_analyst.bat
```

2. **No Mac ou Linux:** abra o terminal na pasta do projeto e rode:

```bash
chmod +x setup_kolbr_analyst.sh
./setup_kolbr_analyst.sh
```

O script vai:

- Verificar se Node e Python estão instalados
- Exportar os trades
- Verificar se o arquivo de análises existe
- Converter pro formato de treino
- Instalar dependências (se pedir)
- Mostrar os próximos passos (treino e deploy)

**Importante:** O script **não** gera as análises automaticamente (isso precisa de GPT/Claude). Ele só automatiza o que dá pra fazer sem IA.

---

## Resumo rápido

| Passo | O que fazer |
|-------|-------------|
| 1 | Rodar o app, coletar trades, depois `node scripts/export_trades_for_dataset.js` |
| 2 | Enviar trades pro GPT/Claude com o prompt e salvar em `raw_trades_with_analyses.json` |
| 3 | `node scripts/convert_to_dataset.js scripts/raw_trades_with_analyses.json --output scripts/kolbr_dataset.jsonl` |
| 4 | Treinar (HF Jobs ou local) com `python scripts/train_kolbr_analyst.py` |
| 5 | Custo: ~$1–2 por treino na nuvem |
| 6 | No Railway: `HF_TOKEN` + `HF_KOLBR_MODEL` no .env. OpenAI fica de fallback. |
| 7 | `./setup_kolbr_analyst.sh` pra automatizar o que der |

---

## Dúvidas comuns

**"Quantos trades preciso?"**  
O ideal é 500 a 2000. Menos que isso o modelo pode não aprender direito. Mais que isso é melhor, mas o treino fica mais caro.

**"Posso usar só o sample de treino?"**  
O `kolbr_dataset_sample.jsonl` tem só 3 exemplos. Serve pra testar se o treino roda, mas o modelo não vai ficar bom. Treina com dados reais.

**"O modelo demora pra carregar no Hugging Face"**  
A primeira vez que alguém usa, o modelo pode estar "dormindo" e levar 20–30 segundos. Depois fica rápido. O fallback pro OpenAI cobre isso.

**"Preciso de GPU no Railway?"**  
Não. O modelo roda na Inference API do Hugging Face. O Railway só chama a API. Se quiser rodar o modelo no Railway (sem API), aí sim precisa de máquina com GPU.

---

## Tudo pronto

O arquivo está pronto. É só seguir o tutorial do começo ao fim. Qualquer dúvida, relê o passo que travou. Boa sorte.
