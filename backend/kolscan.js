/**
 * Integração com KOLScan Brasil - kolscanbrasil.io
 * 1. Tenta API pública
 * 2. Fallback: scraping da página com cheerio
 */
const axios = require('axios');
const cheerio = require('cheerio');

const KOLSCAN_URL = 'https://kolscanbrasil.io';
const cache = { data: null, ts: 0, period: 'daily' };
const TTL_MS = 60 * 1000;

async function fetchKolscanRanking(period = 'daily', forceRefresh = false) {
  if (!forceRefresh && cache.data && cache.period === period && Date.now() - cache.ts < TTL_MS) {
    return cache.data;
  }

  // 1. Tentar API
  const apiData = await tryApi(period);
  if (apiData?.length) {
    cache.data = apiData;
    cache.ts = Date.now();
    cache.period = period;
    return apiData;
  }

  // 2. Fallback: scraping
  const scrapedData = await scrapePage(period);
  if (scrapedData?.length) {
    cache.data = scrapedData;
    cache.ts = Date.now();
    cache.period = period;
    console.log('[kolscan] Dados via scraping:', scrapedData.length, 'KOLs');
    return scrapedData;
  }

  return null;
}

async function tryApi(period) {
  const endpoints = [
    `${KOLSCAN_URL}/api/ranking?period=${period}`,
    `${KOLSCAN_URL}/api/leaderboard?period=${period}`,
    `${KOLSCAN_URL}/api/kols`,
  ];

  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, {
        timeout: 5000,
        headers: { Accept: 'application/json', 'User-Agent': 'KOL-Entry-Scanner/1.0' },
      });

      const arr = Array.isArray(data) ? data : data?.kols || data?.data;
      if (arr?.length) {
        const kols = normalizeKolsData(arr);
        console.log('[kolscan] API:', kols.length, 'KOLs');
        return kols;
      }
    } catch (e) {}
  }
  return null;
}

async function scrapePage(period) {
  try {
    const periodMap = { daily: 'D', weekly: 'W', monthly: 'M' };
    const periodParam = periodMap[period] || 'D';
    const url = `${KOLSCAN_URL}/?period=${periodParam}`;

    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const $ = cheerio.load(html);
    const kols = [];

    // Next.js __NEXT_DATA__
    const nextData = $('script#__NEXT_DATA__').html();
    if (nextData) {
      try {
        const json = JSON.parse(nextData);
        const pageProps = json?.props?.pageProps || {};
        const list = pageProps.ranking || pageProps.kols || pageProps.leaderboard || pageProps.data || [];
        if (Array.isArray(list) && list.length) {
          return normalizeKolsData(list);
        }
      } catch (e) {}
    }

    // Tabela HTML: tr com dados de rank, nome, wallet, pnl, etc
    $('table tbody tr, .leaderboard tr, [class*="row"]').each((i, row) => {
      const $row = $(row);
      const text = $row.text();
      const links = $row.find('a[href*="solscan"], a[href*="solana"]');
      let full = '';
      links.each((_, a) => {
        const href = $(a).attr('href') || '';
        const m = href.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
        if (m) full = m[1];
      });

      const cols = $row.find('td, th');
      if (cols.length < 3) return;

      const rank = parseInt($(cols[0]).text().trim(), 10) || i + 1;
      const nameEl = $(cols[1]).find('a, span, div').first();
      const name = nameEl.text().trim() || $(cols[1]).text().trim() || `KOL #${rank}`;
      const walletMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{6}\.\.\.[1-9A-HJ-NP-Za-km-z]{4})/);
      const addrMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);

      if (!full && addrMatch) full = addrMatch[1];
      if (!full) return;

      const pnlMatch = text.match(/[\d.,]+[kKmM]?|\$[\d,]+|R\$\s*[\d,]+/);
      const pnl = parsePnL(pnlMatch ? pnlMatch[0] : '0');
      const wrMatch = text.match(/(\d{2,3})\s*%|(\d{2,3})\s*WR/);
      const winRate = wrMatch ? parseFloat(wrMatch[1] || wrMatch[2]) : 50;

      kols.push({
        id: rank,
        rank,
        name: name.slice(0, 50),
        handle: '',
        chain: 'SOL',
        wallet: walletMatch ? walletMatch[0] : shortenWallet(full),
        full,
        pnl,
        winRate,
        trades: 0,
        vol24: 0,
        alertOn: false,
      });
    });

    if (kols.length) return kols;

    // Fallback: buscar qualquer endereço Solana no HTML
    const addrRegex = /([1-9A-HJ-NP-Za-km-z]{32,44})/g;
    const matches = html.match(addrRegex) || [];
    const seen = new Set();
    matches.forEach((addr, idx) => {
      if (addr.length >= 32 && addr.length <= 44 && !seen.has(addr)) {
        seen.add(addr);
        kols.push({
          id: idx + 1,
          rank: idx + 1,
          name: `KOL #${idx + 1}`,
          handle: '',
          chain: 'SOL',
          wallet: shortenWallet(addr),
          full: addr,
          pnl: 0,
          winRate: 50,
          trades: 0,
          vol24: 0,
          alertOn: false,
        });
      }
    });

    return kols.length ? kols.slice(0, 20) : null;
  } catch (e) {
    console.warn('[kolscan] Scraping falhou:', e.message);
    return null;
  }
}

function parsePnL(str) {
  if (!str) return 0;
  const num = parseFloat(str.replace(/[$,R\s]/g, '').replace(',', '.')) || 0;
  if (/k/i.test(str)) return num * 1e3;
  if (/m/i.test(str)) return num * 1e6;
  return num;
}

function normalizeKolsData(rawData) {
  return rawData.map((item, idx) => ({
    id: item.id || idx + 1,
    rank: item.rank || idx + 1,
    name: item.name || item.username || item.handle || `KOL #${idx + 1}`,
    handle: item.handle || item.twitter || item.username || '',
    chain: item.chain || 'SOL',
    wallet: shortenWallet(item.wallet || item.address || item.full || ''),
    full: item.wallet || item.address || item.full || '',
    pnl: parseFloat(item.pnl || item.profit || 0),
    winRate: parseFloat(item.winRate || item.win_rate || item.wr || 0),
    trades: parseInt(item.trades || item.txCount || 0),
    vol24: parseFloat(item.volume24h || item.vol24 || 0),
    alertOn: false,
  }));
}

function shortenWallet(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

module.exports = { fetchKolscanRanking };
