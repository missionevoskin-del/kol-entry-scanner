/**
 * Cache in-memory de PnL por período
 * Reduz variação entre refreshes e entre usuários simultâneos
 */
const TTL_MS = {
  daily: 5 * 60 * 1000,    // 5 min
  weekly: 10 * 60 * 1000,  // 10 min
  monthly: 15 * 60 * 1000, // 15 min
};

const cache = {};

function get(period) {
  const key = period || 'daily';
  const c = cache[key];
  if (!c) return null;
  const ttl = TTL_MS[key] || TTL_MS.daily;
  if (Date.now() - c.ts > ttl) return null;
  return c.data;
}

function set(period, data) {
  const key = period || 'daily';
  const payload = { ...data };
  if (!payload.updatedAt) payload.updatedAt = new Date().toISOString();
  cache[key] = { data: payload, ts: Date.now() };
}

function invalidate(period) {
  if (period) delete cache[period];
  else Object.keys(cache).forEach((k) => delete cache[k]);
}

module.exports = { get, set, invalidate };
