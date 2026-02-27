#!/bin/bash
# setup_kolbr_analyst.sh — automatiza o máximo possível do setup do KOLBR Analyst
# Uso: chmod +x setup_kolbr_analyst.sh && ./setup_kolbr_analyst.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  KOLBR Analyst — Setup Automático"
echo "=============================================="
echo ""

# 1. Verificar Node.js
echo "[1/6] Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "  ERRO: Node.js não encontrado. Instale em https://nodejs.org"
    exit 1
fi
echo "  OK: Node $(node -v)"
echo ""

# 2. Exportar trades
echo "[2/6] Exportando trades..."
node scripts/export_trades_for_dataset.js
echo ""

# 3. Verificar se existe arquivo de análises
echo "[3/6] Verificando análises..."
ANALYSES_FILE="scripts/raw_trades_with_analyses.json"
if [ -f "$ANALYSES_FILE" ]; then
    echo "  OK: $ANALYSES_FILE encontrado"
    echo ""
    echo "[4/6] Convertendo para dataset de treino..."
    node scripts/convert_to_dataset.js "$ANALYSES_FILE" --output scripts/kolbr_dataset.jsonl
    echo "  OK: scripts/kolbr_dataset.jsonl criado"
else
    echo "  AVISO: $ANALYSES_FILE não existe."
    echo "  Você precisa:"
    echo "    1. Abrir scripts/raw_trades_for_analysis.json"
    echo "    2. Enviar pro GPT/Claude com o prompt em scripts/prompt_for_human_analysis.md"
    echo "    3. Salvar a resposta em $ANALYSES_FILE (formato: [{...trade, \"analysis\": {...}}, ...])"
    echo ""
    echo "  Usando sample para teste (kolbr_dataset_sample.jsonl)..."
    if [ -f "scripts/kolbr_dataset_sample.jsonl" ]; then
        cp scripts/kolbr_dataset_sample.jsonl scripts/kolbr_dataset.jsonl
        echo "  OK: kolbr_dataset.jsonl criado a partir do sample"
    fi
fi
echo ""

# 4. Verificar Python
echo "[5/6] Verificando Python..."
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "  ERRO: Python não encontrado. Instale Python 3.10+"
    exit 1
fi
PYTHON_CMD="python3"
command -v python3 &> /dev/null || PYTHON_CMD="python"
echo "  OK: $($PYTHON_CMD --version)"
echo ""

# 5. Verificar/instalar dependências Python
echo "[6/6] Verificando dependências Python..."
REQ_FILE="scripts/requirements-train.txt"
if [ -f "$REQ_FILE" ]; then
    echo "  Instalando dependências (pode demorar)..."
    $PYTHON_CMD -m pip install -q -r "$REQ_FILE" 2>/dev/null || {
        echo "  AVISO: pip install falhou. Rode manualmente: pip install -r $REQ_FILE"
    }
    echo "  OK: Dependências prontas"
else
    echo "  AVISO: $REQ_FILE não encontrado"
fi
echo ""

# Resumo e próximos passos
echo "=============================================="
echo "  Próximos passos"
echo "=============================================="
echo ""
echo "  1. Se ainda não fez: crie raw_trades_with_analyses.json com GPT/Claude"
echo "     (veja KOLBR_ANALYST_SETUP.md passo 2)"
echo ""
echo "  2. Treinar o modelo:"
echo "     Opção A (nuvem):"
echo "       hf jobs run --flavor \"1x Nvidia L4\" --timeout 4h \\"
echo "         --with transformers,datasets,peft,trl,bitsandbytes,accelerate \\"
echo "         scripts/train_kolbr_analyst.py"
echo ""
echo "     Opção B (local, com GPU):"
echo "       python scripts/train_kolbr_analyst.py"
echo ""
echo "  3. Publicar no Hugging Face e configurar no Railway:"
echo "     HF_TOKEN=hf_xxx"
echo "     HF_KOLBR_MODEL=seu-usuario/kolbr-analyst-7b"
echo ""
echo "  Tutorial completo: KOLBR_ANALYST_SETUP.md"
echo ""
