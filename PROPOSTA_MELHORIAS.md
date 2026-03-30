# 📋 Proposta de Melhorias - KOL Entry Scanner BR

## Visão Geral do Projeto

Projeto bem estruturado para monitoramento de KOLs na Solana com:
- ✅ Backend Express + WebSocket (mesma porta)
- ✅ Frontend SPA moderno com CSS organizado
- ✅ Integração Helius (trades em tempo real)
- ✅ Análise IA com OpenAI GPT-4o mini
- ✅ Sistema de polling escalonado para PnL
- ✅ Cache em múltiplas camadas

---

## ✅ Melhorias Implementadas

As seguintes melhorias foram aplicadas neste projeto:

### 1. **Memory Leak Corrigido (helius.js)**
- **Antes:** `processedSignatures` usava `Set` sem limpeza por tempo
- **Depois:** Implementado cache baseado em tempo (`Map` com timestamp) com expiração automática de 5 minutos
- **Benefício:** Previne crescimento infinito de memória em produção

### 2. **Rate Limiting Adicionado (app.js)**
- Middleware simples implementado sem dependências extras
- Limite: 30 requisições por minuto por IP
- Resposta HTTP 429 com `retry-after` quando excedido
- Limpeza automática do store a cada minuto

### 3. **Validação de Input Reforçada (app.js)**
- Função `validateAnalyzeRequest()` para validar dados da rota `/api/analyze`
- Validações: estrutura do token, CA length (min 32 chars), kol.name, tradeType, customPrompt length
- Retorna erros detalhados para o cliente

---

## 🔴 Críticas Prioritárias Restantes

### 1. **Tratamento de Erros - Frontend**

**Problema:** `app.js` tem ~900 linhas sem tratamento adequado de erros em várias funções assíncronas.

**Exemplo crítico:**
```javascript
// Linha 72-88 - fetchSolPrice
async function fetchSolPrice() {
  try {
    const res = await fetch('...');
    const data = await res.json();
    // ...
  } catch (e) {
    console.warn('[SOL] Erro ao buscar preço:', e.message);
  }
  return null;
}
```

**Melhoria:** Adicionar retry com backoff e fallback:
```javascript
async function fetchSolPrice(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('...', { 
        signal: AbortSignal.timeout(5000) 
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.solana?.usd) {
        state.solPrice = { usd: data.solana.usd, change24h: data.solana.usd_24h_change || 0 };
        updateSolPriceDisplay();
        return state.solPrice;
      }
    } catch (e) {
      console.warn(`[SOL] Tentativa ${i+1} falhou:`, e.message);
      if (i === retries - 1) {
        showToast('⚠️ Preço SOL indisponível', 'warning');
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

### 3. **Backend - Memory Leak Potencial**

**Problema:** Em `helius.js`, o cache `processedSignatures` pode crescer indefinidamente:
```javascript
const processedSignatures = new Set();
const MAX_PROCESSED_CACHE = 1000;

// Limpeza ineficiente
if (processedSignatures.size > MAX_PROCESSED_CACHE) {
  const toDelete = Array.from(processedSignatures).slice(0, 200);
  toDelete.forEach(sig => processedSignatures.delete(sig));
}
```

**Solução:** Usar LRU Cache ou limite por tempo:
```javascript
const processedSignatures = new Map(); // signature -> timestamp
const MAX_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutos

function isSignatureProcessed(sig) {
  const ts = processedSignatures.get(sig);
  if (!ts) return false;
  if (Date.now() - ts > MAX_CACHE_AGE_MS) {
    processedSignatures.delete(sig);
    return false;
  }
  return true;
}

function markSignatureProcessed(sig) {
  processedSignatures.set(sig, Date.now());
  
  // Limpeza periódica
  if (processedSignatures.size > 2000) {
    const now = Date.now();
    for (const [key, ts] of processedSignatures.entries()) {
      if (now - ts > MAX_CACHE_AGE_MS) {
        processedSignatures.delete(key);
      }
    }
  }
}
```

### 4. **API Rate Limiting Ausente**

**Problema:** Não há rate limiting nas rotas da API, permitindo abuso.

**Solução:** Adicionar middleware simples:
```javascript
// backend/app.js - adicionar após imports
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 req/min por IP

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  
  const record = rateLimitStore.get(ip);
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return next();
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({ 
      error: 'Rate limit excedido', 
      retryAfter 
    });
  }
  
  record.count++;
  next();
}

// Aplicar globalmente
app.use(rateLimitMiddleware);
```

### 5. **Validação de Dados de Entrada**

**Problema:** Múltiplas rotas aceitam dados sem validação adequada.

**Exemplo em `/api/analyze`:**
```javascript
app.post('/api/analyze', async (req, res) => {
  const { token, kol, tradeType, customPrompt } = req.body;
  if (!token?.ca || !kol) return res.status(400).json({ error: 'token e kol obrigatórios' });
  // ...
});
```

**Melhoria:** Validar estrutura completa:
```javascript
function validateAnalyzeRequest(body) {
  const errors = [];
  
  if (!body.token || typeof body.token !== 'object') {
    errors.push('token é obrigatório e deve ser um objeto');
  } else if (!body.token.ca || typeof body.token.ca !== 'string') {
    errors.push('token.ca (contract address) é obrigatório');
  } else if (body.token.ca.length < 32) {
    errors.push('token.ca parece inválido (muito curto para Solana)');
  }
  
  if (!body.kol || typeof body.kol !== 'object') {
    errors.push('kol é obrigatório e deve ser um objeto');
  } else if (!body.kol.name) {
    errors.push('kol.name é obrigatório');
  }
  
  if (body.tradeType && !['buy', 'sell'].includes(body.tradeType)) {
    errors.push('tradeType deve ser "buy" ou "sell"');
  }
  
  if (body.customPrompt && typeof body.customPrompt !== 'string') {
    errors.push('customPrompt deve ser uma string');
  } else if (body.customPrompt && body.customPrompt.length > 1000) {
    errors.push('customPrompt muito longo (máx 1000 caracteres)');
  }
  
  return errors;
}

// Uso na rota:
app.post('/api/analyze', async (req, res) => {
  const errors = validateAnalyzeRequest(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Dados inválidos', details: errors });
  }
  // ...
});
```

---

## 🟡 Melhorias de Código

### 6. **Organização - Separar Configuração**

**Problema:** `config.js` exporta constantes mas poderia ter validação centralizada.

**Solução:** Criar módulo de configuração:
```javascript
// backend/config.js
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  helius: {
    enabled: process.env.HELIUS_ENABLED === '1' || process.env.HELIUS_ENABLED === 'true',
    apiKey: process.env.HELIUS_API_KEY || '',
    rpcKey: process.env.HELIUS_RPC_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '',
  },
  solPrice: parseFloat(process.env.SOL_PRICE) || 150,
};

// Validação no startup
function validateConfig() {
  const errors = [];
  if (config.helius.enabled && !config.helius.apiKey) {
    errors.push('HELIUS_ENABLED=1 mas HELIUS_API_KEY não configurada');
  }
  if (!config.openai.apiKey) {
    console.warn('⚠️  OPENAI_API_KEY não configurada - análise IA desativada');
  }
  return errors;
}

module.exports = { config, validateConfig };
```

### 7. **Logging Estruturado**

**Problema:** Logs usam `console.log` sem nível ou contexto.

**Solução:** Criar logger simples:
```javascript
// backend/logger.js
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

function log(level, module, message, data = null) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${module}]`;
  
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

module.exports = {
  debug: (module, msg, data) => log('DEBUG', module, msg, data),
  info: (module, msg, data) => log('INFO', module, msg, data),
  warn: (module, msg, data) => log('WARN', module, msg, data),
  error: (module, msg, data) => log('ERROR', module, msg, data),
};
```

### 8. **Health Check Mais Completo**

**Problema:** `/health` retorna apenas `{ ok: true }`.

**Solução:** Endpoint detalhado:
```javascript
app.get('/health', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    helius: {
      configured: !!process.env.HELIUS_API_KEY,
      enabled: process.env.HELIUS_ENABLED === '1',
    },
    openai: {
      configured: !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
    },
    kols: getKols().length,
    trades: getTrades().length,
  };
  
  const allHealthy = Object.values(checks).every(v => 
    typeof v === 'boolean' ? v : true
  );
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});
```

---

## 🟢 Melhorias de UX/Funcionalidade

### 9. **Fallback para Dados Demo**

**Problema:** Quando APIs não estão configuradas, usuário vê dados vazios.

**Solução:** Implementar modo demo com dados mockados (já parcialmente implementado no frontend, mas pode ser melhorado):
```javascript
// backend/demoData.js
const DEMO_KOLS = [
  { name: 'Demo Trader 1', pnl: 1500, winRate: 72, trades: 45, /* ... */ },
  { name: 'Demo Trader 2', pnl: -300, winRate: 45, trades: 23, /* ... */ },
];

const DEMO_TRADES = [
  { ca: 'DemoToken1', type: 'buy', valUsd: 500, age: '2min', /* ... */ },
];

function getDemoKols() { return DEMO_KOLS; }
function getDemoTrades() { return DEMO_TRADES; }

module.exports = { getDemoKols, getDemoTrades };
```

### 10. **Cache Persistente para PnL**

**Problema:** Cache PnL perde ao reiniciar servidor.

**Solução:** Persistir em arquivo:
```javascript
// backend/pnlCache.js - adicionar persistência
const fs = require('fs');
const path = require('path');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'pnl-cache.json');

function loadPersistentCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      // Validar se não expirou
      if (Date.now() - data.cachedAt < 4 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {
    console.warn('[pnlCache] Erro ao carregar cache persistente:', e.message);
  }
  return null;
}

function savePersistentCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[pnlCache] Erro ao salvar cache:', e.message);
  }
}
```

### 11. **WebSocket Reconnection com Feedback**

**Problema:** Reconexão WebSocket acontece silenciosamente.

**Solução:** Notificar frontend:
```javascript
// frontend/js/app.js - melhorar feedback
function setupWebSocket() {
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    state.wsConnected = true;
    state.apiMode = state.hasHelius ? 'real' : 'demo';
    updateWsStatus(true);
    updateModeIndicator();
    showToast('🔌 Conectado ao servidor', 'success');
  };
  
  ws.onclose = () => {
    state.wsConnected = false;
    updateWsStatus(false);
    updateModeIndicator();
    
    // Tentar reconectar com backoff
    const retryDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    showToast(`⚠️ Desconectado. Reconectando em ${retryDelay/1000}s...`, 'warning');
    setTimeout(setupWebSocket, retryDelay);
    reconnectAttempts++;
  };
}
```

---

## 📊 Testes e Qualidade

### 12. **Adicionar Testes Básicos**

**Solução:** Criar estrutura de testes:
```json
// package.json - adicionar scripts
{
  "scripts": {
    "test": "node --test backend/tests/*.test.js",
    "test:coverage": "node --test --experimental-test-coverage backend/tests/*.test.js"
  }
}
```

```javascript
// backend/tests/wallets.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { getKols, getKolByWallet } from '../wallets.js';

test('getKols retorna array não vazio', () => {
  const kols = getKols();
  assert(Array.isArray(kols));
  assert(kols.length > 0);
});

test('getKolByWallet encontra wallet existente', () => {
  const kols = getKols();
  if (kols.length > 0) {
    const kol = getKolByWallet(kols[0].full);
    assert.strictEqual(kol?.id, kols[0].id);
  }
});
```

### 13. **ESLint/Prettier**

**Solução:** Adicionar linting:
```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

```javascript
// .eslintrc.json
{
  "env": {
    "node": true,
    "es2022": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off"
  }
}
```

---

## 🚀 Performance

### 14. **Otimizar Carregamento Inicial**

**Problema:** `loadRecentTradesForAllWallets` faz requests sequenciais com delay de 550ms.

**Solução:** Parallelizar com limite:
```javascript
async function loadRecentTradesForAllWallets(onTrade, existingSignatures = new Set()) {
  const wallets = getSolanaWallets();
  if (!wallets.length) return [];
  
  const CONCURRENCY_LIMIT = 3;
  const loaded = [];
  
  async function processWithConcurrency(walletAddr) {
    try {
      const txs = await fetchAddressSwaps(walletAddr, 5);
      // ... processar trades
      return trades;
    } catch (e) {
      console.warn('[helius] Erro:', walletAddr, e.message);
      return [];
    }
  }
  
  // Processar em batches
  for (let i = 0; i < wallets.length; i += CONCURRENCY_LIMIT) {
    const batch = wallets.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(batch.map(processWithConcurrency));
    loaded.push(...results.flat());
    
    // Delay entre batches
    if (i + CONCURRENCY_LIMIT < wallets.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  return loaded;
}
```

### 15. **Compression HTTP**

**Solução:** Adicionar compressão:
```bash
npm install compression
```

```javascript
// backend/app.js
const compression = require('compression');
app.use(compression());
```

---

## 📝 Documentação

### 16. **Melhorar README**

Adicionar seções:
- Troubleshooting comum
- Exemplos de configuração Railway
- Guia de contribuição
- Changelog linkado

### 17. **Comentários em Inglês ou Português Consistente**

**Problema:** Mistura de comentários em PT-BR e EN.

**Recomendação:** Padronizar para PT-BR (público-alvo brasileiro) ou EN (projeto open-source internacional).

---

## 🔐 Segurança Avançada

### 18. **Helmet.js para Headers de Segurança**

```bash
npm install helmet
```

```javascript
// backend/app.js
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Desativar para SPA com inline scripts se necessário
  crossOriginEmbedderPolicy: false,
}));
```

### 19. **Sanitização de Input**

Para prevenir XSS via customPrompt:
```javascript
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // Remover tags HTML
    .slice(0, 1000); // Limite de tamanho
}
```

---

## Resumo das Prioridades

| Prioridade | Item | Status | Impacto | Esforço |
|------------|------|--------|---------|---------|
| 🔴 Alta | Memory Leak (processedSignatures) | ✅ Implementado | Estabilidade | Baixo |
| 🔴 Alta | Rate Limiting | ✅ Implementado | Segurança | Baixo |
| 🔴 Alta | Validação de Input | ✅ Implementado | Segurança | Médio |
| 🟡 Média | Logging Estruturado | Pendente | Debug | Baixo |
| 🟡 Média | Health Check Completo | Pendente | Monitoramento | Baixo |
| 🟡 Média | Testes Automatizados | Pendente | Qualidade | Médio |
| 🟢 Baixa | Compression HTTP | Pendente | Performance | Baixo |
| 🟢 Baixa | ESLint/Prettier | Pendente | Qualidade | Baixo |

---

## Próximos Passos Recomendados

1. **✅ Concluído:** Corrigir memory leak no cache de signatures
2. **✅ Concluído:** Implementar rate limiting middleware
3. **✅ Concluído:** Adicionar validação de input para `/api/analyze`
4. **Pendente:** Adicionar testes automatizados básicos
5. **Pendente:** Implementar logging estruturado
6. **Pendente:** Otimizações de performance (compression, parallelização)
