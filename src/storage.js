/*
 * Persistence for the paper-trading demo.
 *
 * Guests keep their portfolio in localStorage. Signed-in accounts use the
 * server-backed adapter at the bottom of this file, which caches the SQLite
 * portfolio in memory so the app can keep reading state synchronously.
 * Neither is a security boundary: localStorage values can be edited by anyone
 * using this browser, and server writes are authorised by the session cookie.
 */

const LEGACY_KEYS = {
  watchlist: 'stockmark.watchlist',
  cash: 'stockmark.cash',
  holdings: 'stockmark.holdings',
  transactions: 'stockmark.transactions',
  recent: 'stockmark.recent',
  preferences: 'stockmark.preferences',
  alerts: 'stockmark.alerts',
  budget: 'stockmark.budget',
};

const DEFAULTS = {
  watchlist: ['AAPL', 'NVDA', 'MSFT'],
  cash: 0,
  holdings: {},
  transactions: [],
  recent: [],
  preferences: { reducedMotion: false },
  alerts: [],
  budget: { income: 0, carryIn: 0, people: 1, rows: [] },
};

function getStorageArea(area) {
  if (area && typeof area.getItem === 'function' && typeof area.setItem === 'function') return area;
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function safeParse(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validSymbol(value) {
  return typeof value === 'string' && /^[A-Z0-9.\-]{1,12}$/.test(value);
}

function validateWatchlist(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.filter(validSymbol).slice(0, 100);
}

function validateCash(value, fallback) {
  return finiteNonNegative(value) ? value : fallback;
}

function validateHoldings(value, fallback) {
  if (!isPlainObject(value)) return fallback;
  const result = {};
  Object.entries(value).slice(0, 200).forEach(([symbol, item]) => {
    if (!validSymbol(symbol) || !isPlainObject(item)) return;
    const shares = Number(item.shares);
    const averagePrice = Number(item.averagePrice);
    if (finiteNonNegative(shares) && finiteNonNegative(averagePrice) && shares > 0) {
      result[symbol] = { shares, averagePrice };
    }
  });
  return result;
}

function validateTransactions(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item) => {
    if (!isPlainObject(item) || !validSymbol(item.symbol) || !['buy', 'sell'].includes(item.type)) return false;
    return finiteNonNegative(Number(item.shares)) && finiteNonNegative(Number(item.price)) && finiteNonNegative(Number(item.total));
  }).slice(0, 500);
}

function validateRecent(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.filter(validSymbol).slice(0, 50);
}

function validatePreferences(value, fallback) {
  if (!isPlainObject(value)) return fallback;
  return { reducedMotion: Boolean(value.reducedMotion) };
}

function validateAlerts(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item) => isPlainObject(item) && validSymbol(item.symbol)
    && ['above', 'below', 'percent'].includes(item.type)
    && Number.isFinite(Number(item.threshold))).map((item) => ({
    id: String(item.id || `${Date.now()}-${item.symbol}`), symbol: item.symbol.toUpperCase(),
    type: item.type, threshold: Number(item.threshold), createdAt: item.createdAt || new Date().toISOString(),
  })).slice(0, 100);
}

const BUDGET_GROUPS = ['', 'need', 'want', 'saving'];

function validateBudget(value, fallback) {
  if (!isPlainObject(value)) return fallback;
  const rows = Array.isArray(value.rows) ? value.rows.slice(0, 40).map((row) => {
    if (!isPlainObject(row)) return null;
    const name = String(row.name ?? '').trim().slice(0, 48);
    if (!name) return null;
    const planned = Number(row.planned);
    const actual = Number(row.actual);
    return {
      id: String(row.id ?? '').slice(0, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      planned: finiteNonNegative(planned) ? planned : 0,
      actual: finiteNonNegative(actual) ? actual : 0,
      group: BUDGET_GROUPS.includes(row.group) ? row.group : '',
    };
  }).filter(Boolean) : [];
  const people = Number(value.people);
  return {
    income: finiteNonNegative(Number(value.income)) ? Number(value.income) : 0,
    carryIn: finiteNonNegative(Number(value.carryIn)) ? Number(value.carryIn) : 0,
    people: finiteNonNegative(people) && people >= 1 ? Math.round(people) : 1,
    rows,
  };
}

const validators = {
  watchlist: validateWatchlist,
  cash: validateCash,
  holdings: validateHoldings,
  transactions: validateTransactions,
  recent: validateRecent,
  preferences: validatePreferences,
  alerts: validateAlerts,
  budget: validateBudget,
};

function safeScope(scope) {
  if (scope === undefined || scope === null || scope === '' || scope === 'guest') return 'guest';
  // Scope names come from stored keys, so encoding here keeps an arbitrary
  // caller-supplied scope from colliding with another workspace.
  return `account.${encodeURIComponent(String(scope)).slice(0, 160)}`;
}

function adapterFor(readValue, saveValue, scope) {
  return {
    scope,
    getWatchlist: () => readValue('watchlist'),
    saveWatchlist: (value) => saveValue('watchlist', value),
    getCash: () => readValue('cash'),
    saveCash: (value) => saveValue('cash', value),
    getHoldings: () => readValue('holdings'),
    saveHoldings: (value) => saveValue('holdings', value),
    getTransactions: () => readValue('transactions'),
    saveTransactions: (value) => saveValue('transactions', value),
    getRecent: () => readValue('recent'),
    saveRecent: (value) => saveValue('recent', value),
    getPreferences: () => readValue('preferences'),
    savePreferences: (value) => saveValue('preferences', value),
    getAlerts: (symbol) => readValue('alerts').filter((item) => !symbol || item.symbol === String(symbol).toUpperCase()),
    saveAlerts: (value) => saveValue('alerts', value),
    getBudget: () => readValue('budget'),
    saveBudget: (value) => saveValue('budget', value),
    createAlert: ({ symbol, type, threshold }) => {
      const alerts = readValue('alerts');
      const alert = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, symbol: String(symbol).toUpperCase(), type, threshold: Number(threshold), createdAt: new Date().toISOString() };
      saveValue('alerts', [...alerts, alert]);
      return alert;
    },
    deleteAlert: (id) => saveValue('alerts', readValue('alerts').filter((item) => item.id !== id)),
  };
}

/**
 * Create a localStorage adapter, scoped per guest or per legacy demo profile.
 * The optional second argument is useful for tests and non-browser hosts.
 * Save methods return false when storage is unavailable/full rather than throw.
 */
export function createStorage(scope = 'guest', area) {
  const storageArea = getStorageArea(area);
  const prefix = safeScope(scope) === 'guest' ? '' : `${safeScope(scope)}.`;
  const keys = Object.fromEntries(Object.entries(LEGACY_KEYS).map(([name, key]) => [
    name,
    prefix ? `stockmark.${prefix}${name}` : key,
  ]));

  const readValue = (name) => {
    const fallback = DEFAULTS[name];
    let value = fallback;
    try {
      value = storageArea ? safeParse(storageArea.getItem(keys[name]), fallback) : fallback;
    } catch {
      value = fallback;
    }
    return validators[name](value, fallback);
  };

  const saveValue = (name, value) => {
    const fallback = DEFAULTS[name];
    const valid = validators[name](value, fallback);
    if (name === 'cash' && !finiteNonNegative(value)) return false;
    if (!storageArea) return false;
    try {
      storageArea.setItem(keys[name], JSON.stringify(valid));
      return true;
    } catch {
      return false;
    }
  };

  return adapterFor(readValue, saveValue, safeScope(scope) === 'guest' ? 'guest' : String(scope));
}

/*
 * Server-backed store for signed-in accounts.
 *
 * Getters stay synchronous because the app reads them during render; the whole
 * portfolio is loaded once before this adapter exists. Writes update the cached
 * snapshot immediately and then persist the portfolio to SQLite in the background.
 */
export const SNAPSHOT_FIELDS = Object.keys(DEFAULTS);

export function normalizeSnapshot(snapshot) {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((name) => {
    const fallback = DEFAULTS[name];
    const value = snapshot && typeof snapshot === 'object' ? snapshot[name] : undefined;
    return [name, validators[name](value, fallback)];
  }));
}

export function createServerStore(snapshot, persist, options = {}) {
  const values = normalizeSnapshot(snapshot);
  const delay = Number.isFinite(options.debounceMs) ? options.debounceMs : 450;
  let timer = null;
  let dirty = false;
  let closed = false;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return null;
    dirty = false;
    return Promise.resolve(persist?.({ ...values })).catch(() => null);
  };

  const saveValue = (name, value) => {
    if (closed) return false;
    const next = validators[name](value, DEFAULTS[name]);
    if (name === 'cash' && !finiteNonNegative(value)) return false;
    values[name] = next;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
    return true;
  };

  // A trade written moments before the tab closes would otherwise never reach
  // the debounce window, so flush on the last signal the browser gives us.
  const hide = () => flush();
  const events = ['pagehide', 'visibilitychange'];
  if (typeof window !== 'undefined') events.forEach((event) => window.addEventListener(event, hide));

  const store = adapterFor((name) => values[name], saveValue, 'server');
  store.flush = () => (timer ? flush() : null);
  store.dispose = () => {
    closed = true;
    const pending = flush();
    if (timer) clearTimeout(timer);
    if (typeof window !== 'undefined') events.forEach((event) => window.removeEventListener(event, hide));
    return pending;
  };
  return store;
}

// Keep the original guest keys and API for the existing dashboard.
export const storage = createStorage('guest');

export function formatCurrency(value, options = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2, ...options,
  }).format(Number(value) || 0);
}

export function formatCompactCurrency(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount);
}

export function formatPercent(value) {
  const amount = Number(value) || 0;
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)}%`;
}

export function formatTime(value = new Date()) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
