/**
 * Configuração centralizada - KOL Entry Scanner BR
 * Auto-detecta ambiente (produção vs local)
 */

const IS_PRODUCTION = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_BASE = IS_PRODUCTION ? '' : 'http://localhost:3001';
const WS_URL = IS_PRODUCTION
  ? `wss://${window.location.host}/ws`
  : 'ws://localhost:3001/ws';

/** Intervalo de atualização do USD/BRL (5 min) */
const BRL_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

/** Debounce da busca de KOLs (ms) */
const SEARCH_DEBOUNCE_MS = 400;

/** Máximo de trades renderizados (virtualização) */
const MAX_TRADES_RENDERED = 60;

/** Chave localStorage para prompt IA */
const AI_PROMPT_STORAGE_KEY = 'kolscan_ai_prompt';

/** Última atualização do app (exibida no rodapé) */
const LAST_UPDATE = '2026-02-27';

export {
  IS_PRODUCTION,
  API_BASE,
  WS_URL,
  BRL_UPDATE_INTERVAL_MS,
  SEARCH_DEBOUNCE_MS,
  MAX_TRADES_RENDERED,
  AI_PROMPT_STORAGE_KEY,
  LAST_UPDATE,
};
