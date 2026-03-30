/**
 * Testes básicos para o módulo logger.js
 */
import { test } from 'node:test';
import assert from 'node:assert';

// Logger usa CommonJS, então precisamos importar diferente
const loggerModule = await import('../logger.js');
const logger = loggerModule.default || loggerModule;

test('logger exporta funções básicas', () => {
  assert(typeof logger.debug === 'function', 'debug deve ser função');
  assert(typeof logger.info === 'function', 'info deve ser função');
  assert(typeof logger.warn === 'function', 'warn deve ser função');
  assert(typeof logger.error === 'function', 'error deve ser função');
});

test('logger.info executa sem erros', () => {
  assert.doesNotThrow(() => {
    logger.info('test', 'Mensagem de teste');
  });
});

test('logger.error executa sem erros com dados', () => {
  assert.doesNotThrow(() => {
    logger.error('test', 'Erro de teste', { error: 'detalhes', code: 500 });
  });
});

console.log('✅ Todos os testes de logger executados!');
