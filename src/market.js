// Market catalog and parsing helpers are intentionally framework-free so they can
// be regression tested in Node as well as used by the React workspace.
export const STOCK_CATALOG = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', color: '#8b5cf6', price: 188.32, change: 1.26 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', color: '#22d3ee', price: 420.11, change: 0.74 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Semiconductors', color: '#84cc16', price: 142.65, change: 3.86 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Semiconductors', color: '#f59e0b', price: 176.22, change: 1.92 },
  { symbol: 'ORCL', name: 'Oracle Corp.', sector: 'Technology', color: '#fb7185', price: 178.41, change: -0.24 },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', color: '#38bdf8', price: 332.64, change: 0.61 },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', color: '#ef4444', price: 412.74, change: -0.86 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication', color: '#f59e0b', price: 176.44, change: -0.38 },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication', color: '#60a5fa', price: 586.27, change: 1.44 },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication', color: '#dc2626', price: 712.81, change: 0.55 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer', color: '#fb7185', price: 201.08, change: 2.13 },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', color: '#ef4444', price: 248.98, change: -1.64 },
  { symbol: 'COST', name: 'Costco Wholesale', sector: 'Consumer', color: '#2563eb', price: 914.32, change: 0.37 },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer', color: '#38bdf8', price: 81.09, change: 0.82 },
  { symbol: 'MCD', name: "McDonald's Corp.", sector: 'Consumer', color: '#fbbf24', price: 289.42, change: -0.17 },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', color: '#2563eb', price: 223.76, change: 0.91 },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials', color: '#1d4ed8', price: 292.18, change: 0.48 },
  { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Financials', color: '#f97316', price: 516.08, change: 0.36 },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financials', color: '#a16207', price: 456.77, change: 0.12 },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', color: '#14b8a6', price: 521.84, change: -0.72 },
  { symbol: 'LLY', name: 'Eli Lilly & Co.', sector: 'Healthcare', color: '#ec4899', price: 806.14, change: 1.18 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', color: '#0ea5e9', price: 159.26, change: 0.08 },
  { symbol: 'XOM', name: 'Exxon Mobil Corp.', sector: 'Energy', color: '#f97316', price: 118.62, change: -0.43 },
  { symbol: 'CVX', name: 'Chevron Corp.', sector: 'Energy', color: '#eab308', price: 156.87, change: 0.29 },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', color: '#eab308', price: 377.25, change: 0.67 },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials', color: '#0ea5e9', price: 187.35, change: 1.05 },
  { symbol: 'BA', name: 'Boeing Co.', sector: 'Industrials', color: '#64748b', price: 174.28, change: -1.12 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'ETFs', color: '#10b981', price: 598.12, change: 0.42 },
  { symbol: 'QQQ', name: 'Invesco QQQ ETF', sector: 'ETFs', color: '#06b6d4', price: 516.38, change: 0.76 },
];

const logoMarks = {
  AAPL: 'A', MSFT: 'M', NVDA: 'N', AVGO: 'B', ORCL: 'O', CRM: 'S', ADBE: 'A',
  GOOGL: 'G', META: '∞', NFLX: 'N', AMZN: 'a', TSLA: 'T', COST: 'C', WMT: 'W',
  MCD: 'M', JPM: 'JPM', V: 'V', MA: 'MC', 'BRK.B': 'BH', UNH: 'U', LLY: 'L',
  JNJ: 'J&J', XOM: 'X', CVX: 'C', CAT: 'CAT', GE: 'GE', BA: 'B', SPY: 'S', QQQ: 'Q',
};
export const logoDomains = { AAPL: 'apple', MSFT: 'microsoft', NVDA: 'nvidia', AVGO: 'broadcom', ORCL: 'oracle', CRM: 'salesforce', ADBE: 'adobe', GOOGL: 'google', META: 'meta', NFLX: 'netflix', AMZN: 'amazon', TSLA: 'tesla', COST: 'costco', WMT: 'walmart', MCD: 'mcdonalds', JPM: 'jpmorgan', V: 'visa', MA: 'mastercard', BRK: 'berkshirehathaway', UNH: 'unitedhealthgroup', LLY: 'lilly', JNJ: 'johnsonandjohnson', XOM: 'exxonmobil', CVX: 'chevron', CAT: 'caterpillar', GE: 'generalelectric', BA: 'boeing', SPY: 'spdr', QQQ: 'invesco' };
STOCK_CATALOG.forEach((stock) => { stock.mark = logoMarks[stock.symbol] || stock.symbol.slice(0, 1); });

export const stocks = STOCK_CATALOG;
export const stockBySymbol = Object.fromEntries(STOCK_CATALOG.map((stock) => [stock.symbol, stock]));
export const MARKET_SECTORS = ['All', ...new Set(STOCK_CATALOG.map((stock) => stock.sector))];

const ADMIN_CATALOG_KEY = 'stockmark.admin.catalog';
const MARKET_OVERRIDE_KEY = 'stockmark.admin.market-override';

/** Server copy once fetched; the browser copy below is only the offline fallback. */
let serverSettings = null;

function browserStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function safeRead(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeAdminStock(stock) {
  if (!stock || typeof stock !== 'object') return null;
  const symbol = String(stock.symbol || '').trim().toUpperCase();
  const name = String(stock.name || '').trim();
  const sector = String(stock.sector || 'Other').trim() || 'Other';
  const price = Number(stock.price);
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol) || !name || !Number.isFinite(price) || price <= 0) return null;
  return {
    symbol, name, sector, price,
    change: Number.isFinite(Number(stock.change)) ? Number(stock.change) : 0,
    color: stock.color || '#8b5cf6', mark: String(stock.mark || symbol.slice(0, 1)).slice(0, 4),
  };
}

function normalizeConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  const customStocks = Array.isArray(config.customStocks)
    ? config.customStocks.map(normalizeAdminStock).filter(Boolean)
    : [];
  const removedSymbols = Array.isArray(config.removedSymbols)
    ? [...new Set(config.removedSymbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))]
    : [];
  return { customStocks, removedSymbols };
}

function cleanOverride(value) {
  return value === true || value === false ? value : null;
}

export function readAdminConfig() {
  if (serverSettings) return serverSettings.catalog;
  const area = browserStorage();
  if (!area) return { customStocks: [], removedSymbols: [] };
  return normalizeConfig(safeRead(area.getItem(ADMIN_CATALOG_KEY), {}));
}

export function readMarketOverride() {
  if (serverSettings) return serverSettings.marketOverride;
  const area = browserStorage();
  if (!area) return null;
  const raw = area.getItem(MARKET_OVERRIDE_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/** Keeps a browser copy so the app still opens with the right catalog if the API is down. */
function mirrorLocally(settings) {
  const area = browserStorage();
  if (!area) return;
  try {
    area.setItem(ADMIN_CATALOG_KEY, JSON.stringify(settings.catalog));
    if (settings.marketOverride === null) area.removeItem(MARKET_OVERRIDE_KEY);
    else area.setItem(MARKET_OVERRIDE_KEY, String(settings.marketOverride));
  } catch { /* private mode: the server copy is still authoritative */ }
}

export function applyServerSettings(settings) {
  serverSettings = {
    catalog: normalizeConfig(settings?.catalog),
    marketOverride: cleanOverride(settings?.marketOverride),
  };
  mirrorLocally(serverSettings);
  refreshMarketCatalog();
  return serverSettings;
}

/** Never throws — a missing API just leaves the app on its browser copy. */
export async function loadServerSettings(timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/settings', { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    return applyServerSettings(payload?.settings);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function sendSettings(patch) {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: patch }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || 'The settings could not be saved.');
  return applyServerSettings(payload?.settings);
}

export function saveAdminConfig(config) {
  const safe = normalizeConfig(config);
  return sendSettings({ catalog: safe }).then(() => safe);
}

export function saveMarketOverride(value) {
  return sendSettings({ marketOverride: cleanOverride(value) }).then(() => cleanOverride(value));
}

export function refreshMarketCatalog() {
  const config = readAdminConfig();
  const removed = new Set(config.removedSymbols);
  const customBySymbol = new Map(config.customStocks.map((stock) => [stock.symbol, stock]));
  const active = STOCK_CATALOG.filter((stock) => !removed.has(stock.symbol)).map((stock) => customBySymbol.get(stock.symbol) || stock);
  config.customStocks.forEach((stock) => {
    if (!removed.has(stock.symbol) && !active.some((item) => item.symbol === stock.symbol)) active.push(stock);
  });
  stocks.splice(0, stocks.length, ...active);
  Object.keys(stockBySymbol).forEach((symbol) => delete stockBySymbol[symbol]);
  active.forEach((stock) => { stockBySymbol[stock.symbol] = stock; });
  const sectors = ['All', ...new Set(active.map((stock) => stock.sector))];
  MARKET_SECTORS.splice(0, MARKET_SECTORS.length, ...sectors);
  return stocks;
}

export function fallbackQuote(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const item = stockBySymbol[normalized] || {
    symbol: normalized,
    name: `${normalized || 'Unknown'} Holdings`,
    sector: 'Market',
    price: 0,
    change: 0,
  };
  const price = Number(item.price) || 0;
  const baseChange = Number(item.change) || 0;
  // Give fallback/demo quotes a small repeatable movement when the user refreshes
  // so the paper dashboard behaves like a changing market without pretending it
  // is live data.
  const pulse = Math.sin(Math.floor(Date.now() / 30000) + normalized.length) * 0.12;
  const changePercent = baseChange + pulse;
  return {
    symbol: normalized,
    name: item.name,
    price,
    change: price * changePercent / 100,
    changePercent,
    previousClose: price ? price - (price * changePercent / 100) : 0,
    volume: 0,
    latestTradingDay: null,
    demo: true,
    unavailable: price <= 0,
    source: 'demo',
  };
}

function toFiniteNumber(value) {
  const number = Number.parseFloat(String(value ?? '').replace('%', '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

export function normalizeQuote(payload, symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const raw = payload?.data?.['Global Quote'] || payload?.['Global Quote'];
  const price = toFiniteNumber(raw?.['05. price']);
  if (!raw || price === null || price <= 0) {
    const demo = fallbackQuote(normalized);
    return {
      ...demo,
      error: payload?.error || 'A current quote is unavailable.',
      // Curated symbols remain tradable in clearly-labelled demo mode when
      // Alpha Vantage is unavailable. Unknown symbols still return price 0
      // and remain unavailable.
      unavailable: demo.unavailable,
    };
  }
  const change = toFiniteNumber(raw['09. change']) ?? 0;
  const changePercent = toFiniteNumber(raw['10. change percent']) ?? 0;
  return {
    symbol: normalized,
    name: stockBySymbol[normalized]?.name || normalized,
    price,
    change,
    changePercent,
    previousClose: toFiniteNumber(raw['08. previous close']) ?? Math.max(0, price - change),
    volume: toFiniteNumber(raw['06. volume']) ?? 0,
    latestTradingDay: raw['07. latest trading day'] || null,
    demo: Boolean(payload?.demo),
    unavailable: false,
    source: payload?.demo ? 'demo' : 'alpha-vantage',
    error: payload?.error || null,
  };
}

export function evaluateAlert(alert, quote) {
  if (!alert || !quote || !(quote.price > 0)) return false;
  if (alert.type === 'above') return quote.price >= Number(alert.threshold);
  if (alert.type === 'below') return quote.price <= Number(alert.threshold);
  return Math.abs(Number(quote.changePercent) || 0) >= Number(alert.threshold);
}

export const parseQuote = normalizeQuote;

function tradingDateBefore(base, daysBack) {
  const date = new Date(base);
  date.setHours(12, 0, 0, 0);
  let remaining = daysBack;
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() - 1);
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

export function demoHistory(symbol, count = 100, now = new Date()) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const base = (stockBySymbol[normalized]?.price || 100) * 0.91;
  let price = base;
  const total = Math.min(Math.max(count, 1), 100);
  return Array.from({ length: total }, (_, index) => {
    const date = tradingDateBefore(now, total - 1 - index);
    price *= 1 + Math.sin(index / 3.6) * 0.012 + Math.cos(index / 7) * 0.008 + ((index % 5) - 2) * 0.0017;
    return {
      date: date.toISOString().slice(5, 10),
      fullDate: date.toISOString().slice(0, 10),
      price: Number(price.toFixed(2)),
    };
  });
}

export function normalizeHistory(payload, symbol, options = {}) {
  const series = payload?.data?.['Time Series (Daily)'] || payload?.['Time Series (Daily)'];
  const parsed = series && typeof series === 'object'
    ? Object.entries(series)
      .map(([date, item]) => ({
        date: date.slice(5),
        fullDate: date,
        price: toFiniteNumber(item?.['4. close']),
      }))
      .filter((item) => item.price !== null && item.price > 0)
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
      .slice(-100)
      .map((item) => ({ ...item, price: Number(item.price.toFixed(2)) }))
    : [];
  // A provider can return a syntactically valid series containing only a zero
  // placeholder. Treat that as unavailable demo data instead of an empty chart.
  return parsed.length ? parsed : demoHistory(symbol, options.count || 100, options.now || new Date());
}

export const parseHistory = normalizeHistory;

const dayKey = (value) => String(value ?? '').slice(0, 10);

/**
 * Rebuilds the account's value on each past trading day from what is already
 * stored: the current holdings, the timestamped trades and daily closes. Every
 * day is replayed backwards from today, so the last point is the real current
 * value rather than a restatement of it.
 */
export function buildPortfolioHistory({
  holdings = {}, transactions = [], cash = 0, series = {},
  count = 100, now = new Date(), since = null, current = null,
} = {}) {
  const trades = transactions
    .filter((item) => item?.symbol && (item.type === 'buy' || item.type === 'sell'))
    .map((item) => {
      const shares = Number(item.shares) || 0;
      const total = Number(item.total) || 0;
      return {
        symbol: String(item.symbol).trim().toUpperCase(),
        day: dayKey(item.createdAt),
        deltaShares: item.type === 'buy' ? shares : -shares,
        deltaCash: item.type === 'buy' ? -total : total,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const symbols = [...new Set([
    ...Object.keys(holdings).map((symbol) => String(symbol).trim().toUpperCase()),
    ...trades.map((trade) => trade.symbol),
  ])].filter(Boolean);

  const tracks = symbols.map((symbol) => {
    const held = Number(holdings[symbol]?.shares) || 0;
    const cost = Number(holdings[symbol]?.averagePrice) || 0;
    const points = (Array.isArray(series[symbol]) ? series[symbol] : [])
      .map((point) => ({ day: dayKey(point?.fullDate || point?.date), price: Number(point?.price) }))
      .filter((point) => point.day && Number.isFinite(point.price) && point.price > 0)
      .sort((a, b) => a.day.localeCompare(b.day));
    const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
    return {
      symbol,
      held,
      // A holding with no price series keeps its cost basis, so the curve stays
      // honest instead of inventing a move.
      priceAt: (day) => {
        if (!points.length) return cost;
        let price = points[0].price;
        for (const point of points) { if (point.day <= day) price = point.price; else break; }
        return price;
      },
      totalShares: symbolTrades.reduce((sum, trade) => sum + trade.deltaShares, 0),
    };
  });

  const totalCashDelta = trades.reduce((sum, trade) => sum + trade.deltaCash, 0);
  const start = dayKey(since) || trades[0]?.day || dayKey(now.toISOString());
  const span = Math.min(Math.max(Number(count) || 1, 1), 100);

  const days = [];
  for (let back = span - 1; back >= 0; back -= 1) {
    const date = tradingDateBefore(now, back);
    const day = date.toISOString().slice(0, 10);
    if (day >= start) {
      days.push({ day, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
  }
  if (!days.length) {
    days.push({ day: dayKey(now.toISOString()), label: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
  }

  let cursor = 0;
  let consumedCash = 0;
  const consumedShares = new Map(symbols.map((symbol) => [symbol, 0]));

  const points = days.map(({ day, label }) => {
    while (cursor < trades.length && trades[cursor].day <= day) {
      consumedCash += trades[cursor].deltaCash;
      consumedShares.set(trades[cursor].symbol, (consumedShares.get(trades[cursor].symbol) || 0) + trades[cursor].deltaShares);
      cursor += 1;
    }
    const cashOnDay = Number(cash) || 0;
    let value = cashOnDay - (totalCashDelta - consumedCash);
    for (const track of tracks) {
      const heldThen = track.held - (track.totalShares - (consumedShares.get(track.symbol) || 0));
      if (heldThen > 0) value += heldThen * track.priceAt(day);
    }
    return { date: label, fullDate: day, value: Number(value.toFixed(2)) };
  });

  const anchor = Number(current);
  if (current !== null && current !== undefined && Number.isFinite(anchor)) {
    points[points.length - 1].value = anchor;
  }
  return points;
}

const marketCache = new Map();
export function getCachedMarket(kind, symbol) {
  return marketCache.get(`${kind}:${String(symbol).toUpperCase()}`) || null;
}
export function setCachedMarket(kind, symbol, value) {
  marketCache.set(`${kind}:${String(symbol).toUpperCase()}`, value);
  return value;
}
export function clearMarketCache() {
  marketCache.clear();
}

export function filterCatalog(query = '', sector = 'All') {
  const needle = String(query).trim().toLowerCase();
  return stocks.filter((stock) => (sector === 'All' || stock.sector === sector)
    && (!needle || `${stock.symbol} ${stock.name}`.toLowerCase().includes(needle)));
}

refreshMarketCatalog();
