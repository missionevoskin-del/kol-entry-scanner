"""
KOLBR Analyst Demo — Space Gradio
Interface dark premium com tema Solana (verde neon)
"""
import json
import requests
import gradio as gr

KOLBR_API = "https://kolbr-entry.up.railway.app"


def fetch_recent_trades():
    """Puxa trades reais do KOLBR."""
    try:
        r = requests.get(f"{KOLBR_API}/api/trades/recent?limit=5", timeout=10)
        if r.ok:
            data = r.json()
            trades = data.get("trades", [])
            if trades:
                return json.dumps(trades[0], indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Erro ao buscar: {e}"
    return "Nenhum trade recente no KOLBR."


def trade_from_wallet(wallet: str):
    """Busca trade de um KOL pela wallet."""
    if not wallet or len(wallet) < 20:
        return "Digite uma wallet válida (ex: DXwuEuLCjq44dHJtBNc6cNGyduHrQ7YwJSZdP69VXGFH)"
    try:
        r = requests.get(f"{KOLBR_API}/api/trades/recent?limit=50", timeout=10)
        if r.ok:
            trades = r.json().get("trades", [])
            wallet_lower = wallet.strip().lower()
            for t in trades:
                kol = t.get("kol") or {}
                full = (kol.get("full") or kol.get("wallet") or "").lower()
                if wallet_lower in full or full in wallet_lower:
                    return json.dumps(t, indent=2, ensure_ascii=False)
        return "Nenhum trade encontrado para essa wallet."
    except Exception as e:
        return f"Erro: {e}"


def build_analyze_payload(trade_str: str):
    """Converte trade JSON em payload para /api/analyze."""
    try:
        t = json.loads(trade_str) if isinstance(trade_str, str) else trade_str
    except json.JSONDecodeError:
        return None, "JSON inválido."
    kol = t.get("kol") or {}
    ca = t.get("ca") or t.get("mint") or t.get("tokenMint")
    if not ca:
        return None, "Trade sem CA (contrato do token)."
    token = {
        "ca": ca,
        "name": t.get("name", "?"),
        "symbol": t.get("symbol", "?"),
        "marketCap": t.get("mc") or t.get("marketCap", 0),
        "liquidity": t.get("liq") or t.get("liquidity", 0),
        "volume24h": t.get("vol24h") or t.get("volume24h", 0),
        "buys": t.get("buys", 0),
        "sells": t.get("sells", 0),
        "priceChange24h": t.get("change") or t.get("priceChange24h", 0),
        "priceChange1h": t.get("priceChange1h", 0),
    }
    kol_payload = {
        "name": kol.get("name", "?"),
        "winRate": kol.get("winRate", 0),
        "rank": kol.get("rank", "?"),
        "chain": kol.get("chain", "SOL"),
    }
    trade_type = (t.get("type") or t.get("tradeType") or "buy").lower()
    return {"token": token, "kol": kol_payload, "tradeType": trade_type}, None


def analyze_trade(trade_str: str):
    """Chama API do KOLBR para análise."""
    payload, err = build_analyze_payload(trade_str)
    if err:
        return None, err
    try:
        r = requests.post(
            f"{KOLBR_API}/api/analyze",
            json=payload,
            timeout=30,
        )
        if r.ok:
            return r.json(), None
        return None, f"API retornou {r.status_code}"
    except Exception as e:
        return None, str(e)


def render_result(analysis, error):
    """Renderiza resultado da análise em HTML."""
    if error:
        return f"<div class='error-msg'>{error}</div>"
    if not analysis:
        return "<div class='error-msg'>Análise indisponível.</div>"
    v = (analysis.get("veredito") or "NEUTRO").upper()
    cls = "compra" if "COMPRA" in v else "evitar" if "EVITAR" in v else "neutro"
    conf = min(10, max(1, int(analysis.get("confianca", 5))))
    conf_pct = conf * 10
    risk_pct = 100 - conf_pct  # risco inverso à confiança
    resumo = (analysis.get("resumo") or "").replace("\n", "<br>")
    pos = analysis.get("pontos_positivos") or []
    riscos = analysis.get("riscos") or []
    pos_html = "<br>".join(f"• {p}" for p in pos) if pos else "—"
    riscos_html = "<br>".join(f"• {r}" for r in riscos) if riscos else "—"
    return f"""
    <div class="result-card">
        <div class="veredito veredito--{cls}">{v}</div>
        <div class="confianca-bar"><div class="confianca-fill" style="width:{conf_pct}%"></div></div>
        <div class="confianca-label">Confiança: {conf}/10</div>
        <div class="risk-bar-wrap">
            <span class="risk-label">Risco</span>
            <div class="risk-bar"><div class="risk-fill" style="width:{risk_pct}%"></div></div>
        </div>
        <div class="resumo">{resumo}</div>
        <div class="section">
            <strong>Pontos positivos</strong><br>{pos_html}
        </div>
        <div class="section">
            <strong>Riscos</strong><br>{riscos_html}
        </div>
    </div>
    """


def run_analysis(trade_str: str):
    """Pipeline: analisa e retorna HTML. Usa generator para loading shimmer."""
    loading_html = """
    <div class="result-card shimmer-loading">
        <div class="shimmer-lines">
            <div class="shimmer-line" style="width:35%"></div>
            <div class="shimmer-line" style="width:90%"></div>
            <div class="shimmer-line" style="width:65%"></div>
            <div class="shimmer-line" style="width:50%"></div>
        </div>
        <p class="shimmer-msg">KOLBR Analyst analisando...</p>
    </div>
    """
    yield loading_html
    analysis, error = analyze_trade(trade_str)
    yield render_result(analysis, error)


custom_css = """
/* Dark premium + verde neon Solana */
:root {
    --sol-green: #00ff88;
    --sol-green-dim: #00cc6a;
    --bg-dark: #0a0e12;
    --surface: #111820;
    --border: #1e2a36;
    --text: #e2e8f0;
    --muted: #64748b;
}
.gradio-container { background: var(--bg-dark) !important; }
.gr-form, .gr-box, .gr-input, .gr-textarea {
    background: var(--surface) !important;
    border-color: var(--border) !important;
    color: var(--text) !important;
}
.gr-button-primary {
    background: linear-gradient(135deg, var(--sol-green) 0%, var(--sol-green-dim) 100%) !important;
    color: #0a0e12 !important;
    border: none !important;
    font-weight: 600 !important;
}
.gr-button-secondary {
    background: rgba(0,255,136,0.15) !important;
    color: var(--sol-green) !important;
    border: 1px solid rgba(0,255,136,0.4) !important;
}
h1, .gr-label { color: var(--text) !important; }
.result-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin-top: 12px;
}
.veredito {
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
}
.veredito--compra { color: #00ff88; }
.veredito--evitar { color: #ff4757; }
.veredito--neutro { color: #ffa502; }
.confianca-bar {
    height: 8px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0;
}
.confianca-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--sol-green), #00cc6a);
    border-radius: 4px;
    transition: width 0.4s ease;
}
.confianca-label { color: var(--muted); font-size: 0.9rem; margin-bottom: 8px; }
.risk-bar-wrap { margin-bottom: 16px; }
.risk-label { font-size: 0.8rem; color: var(--muted); margin-right: 8px; }
.risk-bar { height: 6px; background: rgba(255,71,87,0.15); border-radius: 3px; overflow: hidden; display: inline-block; width: 120px; vertical-align: middle; }
.risk-fill { height: 100%; background: linear-gradient(90deg, #ff4757, #ff6b7a); border-radius: 3px; transition: width 0.4s ease; }
.resumo { margin: 16px 0; line-height: 1.6; }
.section { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--muted); }
.section strong { color: var(--text); }
.error-msg { color: #ff4757; padding: 12px; }
.shimmer-loading { min-height: 140px; display: flex; flex-direction: column; gap: 12px; }
.shimmer-lines { display: flex; flex-direction: column; gap: 10px; }
.shimmer-line {
    height: 10px; border-radius: 4px;
    background: linear-gradient(90deg, var(--border) 25%, rgba(0,255,136,0.2) 50%, var(--border) 75%);
    background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite;
}
.shimmer-msg { color: var(--muted); font-size: 0.85rem; margin-top: 8px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
"""


with gr.Blocks(
    css=custom_css,
    theme=gr.themes.Base(
        primary_hue="green",
        secondary_hue="slate",
    ).set(
        body_background_fill="#0a0e12",
        block_background_fill="#111820",
        block_border_color="#1e2a36",
        block_label_text_color="#e2e8f0",
        input_background_fill="#111820",
        button_primary_background_fill="#00ff88",
        button_primary_text_color="#0a0e12",
    ),
    title="KOLBR Analyst — Análise de Memecoins Solana",
) as demo:
    gr.HTML("""
        <div style="text-align:center;margin-bottom:8px">
            <h1 style="color:#00ff88;font-family:system-ui;font-size:1.8rem;margin:0">
                KOLBR Analyst
            </h1>
            <p style="color:#64748b;font-size:0.95rem;margin:4px 0 0 0">
                Análise de memecoins Solana em PT-BR · Smart Money KOLs BR
            </p>
        </div>
    """)

    with gr.Row():
        with gr.Column(scale=1):
            trade_input = gr.Textbox(
                label="Trade JSON",
                placeholder='Cole o JSON do trade ou use "Puxar trade real"',
                lines=12,
                max_lines=20,
            )
            with gr.Row():
                btn_fetch = gr.Button("Puxar trade real do KOLBR", variant="secondary")
                btn_wallet = gr.Button("Buscar por wallet", variant="secondary")
            wallet_input = gr.Textbox(
                label="Ou digite uma wallet KOL para buscar trade",
                placeholder="Ex: DXwuEuLCjq44dHJtBNc6cNGyduHrQ7YwJSZdP69VXGFH",
                lines=1,
            )
            btn_analyze = gr.Button("Analisar", variant="primary")

        with gr.Column(scale=1):
            output = gr.HTML(
                value="<div class='result-card'><p style='color:#64748b'>Envie um trade e clique em <strong>Analisar</strong>.</p></div>",
                label="Análise",
            )

    def on_fetch():
        return fetch_recent_trades()

    def on_wallet(wallet):
        return trade_from_wallet(wallet)

    btn_fetch.click(fn=on_fetch, outputs=trade_input)
    btn_wallet.click(fn=on_wallet, inputs=wallet_input, outputs=trade_input)
    btn_analyze.click(
        fn=run_analysis,
        inputs=trade_input,
        outputs=output,
    )

    gr.HTML("""
        <div style="text-align:center;margin-top:24px;padding:16px;border-top:1px solid #1e2a36">
            <a href="https://kolbr-entry.up.railway.app" target="_blank" style="color:#00ff88;text-decoration:none">
                Abrir KOLBR no Railway →
            </a>
            <p style="color:#64748b;font-size:0.8rem;margin:8px 0 0 0">
                Powered by KOLBR Analyst · fine-tuned on Hugging Face
            </p>
        </div>
    """)


if __name__ == "__main__":
    demo.launch()
