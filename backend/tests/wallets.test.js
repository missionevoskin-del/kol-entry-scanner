/**
 * Testes básicos para o módulo wallets.js
 */
import { test } from 'node:test';
import assert from 'node:assert';

// Importar módulos do backend
const { getKols, getKolByWallet, getSolanaWallets } = await import('../wallets.js');

test('getKols retorna array não vazio', () => {
  const kols = getKols();
  assert(Array.isArray(kols), 'getKols deve retornar um array');
  assert(kols.length > 0, 'Deve haver pelo menos um KOL cadastrado');
});

test('getKols retorna KOLs com propriedades básicas', () => {
  const kols = getKols();
  if (kols.length > 0) {
    const kol = kols[0];
    assert(kol.id, 'KOL deve ter id');
    assert(kol.name, 'KOL deve ter name');
    assert(kol.wallet || kol.full, 'KOL deve ter wallet ou full');
  }
});

test('getSolanaWallets retorna array de wallets', () => {
  const wallets = getSolanaWallets();
  assert(Array.isArray(wallets), 'getSolanaWallets deve retornar um array');
});

test('getKolByWallet encontra wallet existente', () => {
  const kols = getKols();
  if (kols.length > 0 && kols[0].wallet) {
    const kol = getKolByWallet(kols[0].wallet);
    assert.strictEqual(kol?.id, kols[0].id, 'Deve encontrar o KOL pela wallet');
  }
});

test('getKolByWallet retorna undefined para wallet inexistente', () => {
  const kol = getKolByWallet('wallet_inexistente_123456789');
  assert.strictEqual(kol, undefined, 'Deve retornar undefined para wallet não encontrada');
});

console.log('✅ Todos os testes de wallets executados!');
