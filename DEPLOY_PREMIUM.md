# KOLBR Premium — Instruções de Deploy

## Transformação aplicada

O dashboard foi atualizado para um visual **Solana neon premium 2026**:

- **Fundo dark profundo** `#0a0e12`
- **Acentos verde neon** `#00ff88`
- **Glassmorphism** em cards, tabelas e painéis
- **Animações** (fade-in, hover lift, shimmer loading)
- **Footer** "Powered by KOLBR Analyst — fine-tuned on Hugging Face"
- **Botão Analisar** com destaque neon

---

## Como aplicar (git)

```bash
# Adicionar tudo
git add frontend/ frontend/css/ frontend/js/ frontend/index.html

# Commit
git commit -m "feat: premium Solana neon UI — glassmorphism, shimmer, count animation"

# Push
git push origin main
```

---

## Como testar localmente

### Opção 1: servidor estático (só frontend)

```bash
cd frontend
npx serve .
# ou
python -m http.server 8080
```

Acesse: http://localhost:8080 (ou 3000)

### Opção 2: full stack (backend + frontend)

```bash
# Terminal 1 — backend
cd backend
npm start

# Terminal 2 — frontend
cd frontend
npx serve . -p 3000
```

Configure `.env` com `FRONTEND_URL=http://localhost:3000` se necessário.

### Opção 3: Railway (produção)

O deploy no Railway usa o frontend estático. Após o push, o Railway faz o deploy automaticamente.

---

## Estimativa de tempo

- **Visual "uau"**: ~2–5 segundos (carregamento do primeiro frame)
- **Skeleton shimmer**: visível durante loading de dados
- **Animações** (count-up, hover): imediatas após interação

---

## Referências usadas (HF MCP)

- [Gradio Theming Guide](https://gradio.app/guides/theming-guide) — glass theme, custom CSS
- [Crypto Signal Bot](https://hf.co/spaces/0vergeared/crypto_signal_bot) — trading dashboard
- [neontrack-dashboard](https://hf.co/spaces/uilame/neontrack-dashboard) — neon UI
- [institutional-trading-dashboard-ui](https://hf.co/spaces/hiya31/institutional-trading-dashboard-ui-q2tal) — trading UI
