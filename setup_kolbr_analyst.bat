@echo off
REM setup_kolbr_analyst.bat - Versao Windows do setup automatico
REM Uso: duplo clique ou "setup_kolbr_analyst.bat" no prompt de comando

cd /d "%~dp0"

echo ==============================================
echo   KOLBR Analyst - Setup Automatico
echo ==============================================
echo.

echo [1/6] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERRO: Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)
node -v
echo.

echo [2/6] Exportando trades...
node scripts\export_trades_for_dataset.js
echo.

echo [3/6] Verificando analises...
if exist "scripts\raw_trades_with_analyses.json" (
    echo   OK: raw_trades_with_analyses.json encontrado
    echo.
    echo [4/6] Convertendo para dataset de treino...
    node scripts\convert_to_dataset.js scripts\raw_trades_with_analyses.json --output scripts\kolbr_dataset.jsonl
    echo   OK: kolbr_dataset.jsonl criado
) else (
    echo   AVISO: raw_trades_with_analyses.json nao existe.
    echo   Envie os trades pro GPT/Claude e salve em scripts\raw_trades_with_analyses.json
    echo.
    if exist "scripts\kolbr_dataset_sample.jsonl" (
        copy scripts\kolbr_dataset_sample.jsonl scripts\kolbr_dataset.jsonl >nul
        echo   Usando sample para teste...
    )
)
echo.

echo [5/6] Verificando Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    where py >nul 2>&1
    if %errorlevel% neq 0 (
        echo   AVISO: Python nao encontrado. Instale Python 3.10+
    ) else (
        echo   OK: Python encontrado
    )
) else (
    echo   OK: Python encontrado
)
echo.

echo [6/6] Instalando dependencias Python...
if exist "scripts\requirements-train.txt" (
    pip install -q -r scripts\requirements-train.txt 2>nul
    echo   OK
)
echo.

echo ==============================================
echo   Proximos passos
echo ==============================================
echo.
echo   1. Crie raw_trades_with_analyses.json com GPT/Claude
echo   2. Treine: python scripts\train_kolbr_analyst.py
echo   3. Configure HF_TOKEN e HF_KOLBR_MODEL no Railway
echo.
echo   Tutorial: KOLBR_ANALYST_SETUP.md
echo.
pause
