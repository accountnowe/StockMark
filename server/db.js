/*
 * SQLite persistence for signed-in Stockmark accounts.
 *
 * Guests keep using localStorage; everything below applies to real accounts.
 * The database file lives in data/ and is created on first run.
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));

export const STARTING_CASH = 10_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'stockmark_session';
export const ADMIN_EMAIL = 'admin@stockmark.local';

const DB_PATH = process.env.STOCKMARK_DB_PATH || join(here, '..', 'data', 'stockmark.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    cash REAL NOT NULL DEFAULT 10000,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

  CREATE TABLE IF NOT EXISTS watchlist (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS recent (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS holdings (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    shares REAL NOT NULL,
    average_price REAL NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    shares REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id, created_at);

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('above', 'below', 'percent')),
    threshold REAL NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts (user_id);

  CREATE TABLE IF NOT EXISTS budget (
    user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    income REAL NOT NULL DEFAULT 0,
    carry_in REAL NOT NULL DEFAULT 0,
    people INTEGER NOT NULL DEFAULT 1,
    rows_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

/* ---------------------------------------------------------------- passwords */

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, digest] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const candidate = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

/* -------------------------------------------------------------------- users */

const insertUser = db.prepare('INSERT INTO users (id, name, email, password_hash, cash, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.name,
    email: row.email,
    isAdmin: row.email === ADMIN_EMAIL,
    cash: row.cash,
    createdAt: row.created_at,
  };
}

export function createUser({ name, email, password }) {
  insertUser.run(randomUUID(), name, email, hashPassword(password), STARTING_CASH, new Date().toISOString());
  return publicUser(selectUserByEmail.get(email));
}

export function findUserByEmail(email) {
  return publicUser(selectUserByEmail.get(email));
}

export function findUserByEmailRecord(email) {
  return selectUserByEmail.get(email) || null;
}

/* ----------------------------------------------------------------- sessions */

const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
const selectSessionUser = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?');
const deleteSessionRow = db.prepare('DELETE FROM sessions WHERE token = ?');
const pruneSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

export function startSession(userId) {
  const token = randomBytes(32).toString('hex');
  insertSession.run(token, userId, Date.now() + SESSION_TTL_MS);
  pruneSessions.run(Date.now());
  return token;
}

export function userForToken(token) {
  if (typeof token !== 'string' || !token) return null;
  return publicUser(selectSessionUser.get(token, Date.now()));
}

export function endSession(token) {
  if (token) deleteSessionRow.run(token);
}

/* ------------------------------------------------------------ saved portfolio */

const SYMBOL = /^[A-Z0-9._-]{1,12}$/;

function cleanSymbol(value) {
  const symbol = String(value ?? '').trim().toUpperCase();
  return SYMBOL.test(symbol) ? symbol : null;
}

function amount(value, max = 1e12) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : 0;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

const BUDGET_GROUPS = new Set(['', 'need', 'want', 'saving']);

function cleanGroup(value) {
  return BUDGET_GROUPS.has(value) ? value : '';
}

function budgetRows(value) {
  return list(value).slice(0, 40).map((row) => {
    const name = String(row?.name ?? '').trim().slice(0, 48);
    return name ? { id: String(row.id ?? name).slice(0, 40), name, planned: amount(row.planned), actual: amount(row.actual), group: cleanGroup(row.group) } : null;
  }).filter(Boolean);
}

function parseRows(raw) {
  try {
    return budgetRows(JSON.parse(raw));
  } catch {
    return [];
  }
}

const selectCash = db.prepare('SELECT cash FROM users WHERE id = ?');
const updateCash = db.prepare('UPDATE users SET cash = ? WHERE id = ?');
const clearWatchlist = db.prepare('DELETE FROM watchlist WHERE user_id = ?');
const insertWatch = db.prepare('INSERT INTO watchlist (user_id, symbol, position) VALUES (?, ?, ?)');
const clearRecent = db.prepare('DELETE FROM recent WHERE user_id = ?');
const insertRecent = db.prepare('INSERT INTO recent (user_id, symbol, position) VALUES (?, ?, ?)');
const clearHoldings = db.prepare('DELETE FROM holdings WHERE user_id = ?');
const insertHolding = db.prepare('INSERT INTO holdings (user_id, symbol, shares, average_price) VALUES (?, ?, ?, ?)');
const clearTransactions = db.prepare('DELETE FROM transactions WHERE user_id = ?');
const insertTransaction = db.prepare('INSERT INTO transactions (id, user_id, symbol, type, shares, price, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const clearAlerts = db.prepare('DELETE FROM alerts WHERE user_id = ?');
const insertAlert = db.prepare('INSERT INTO alerts (id, user_id, symbol, type, threshold, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const upsertBudget = db.prepare(`
  INSERT INTO budget (user_id, income, carry_in, people, rows_json) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id) DO UPDATE SET income = excluded.income, carry_in = excluded.carry_in, people = excluded.people, rows_json = excluded.rows_json
`);

const selectWatchlist = db.prepare('SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY position');
const selectRecent = db.prepare('SELECT symbol FROM recent WHERE user_id = ? ORDER BY position');
const selectHoldings = db.prepare('SELECT symbol, shares, average_price FROM holdings WHERE user_id = ?');
const selectTransactions = db.prepare('SELECT id, symbol, type, shares, price, total, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 500');
const selectAlerts = db.prepare('SELECT id, symbol, type, threshold, created_at FROM alerts WHERE user_id = ? ORDER BY created_at');
const selectBudget = db.prepare('SELECT income, carry_in, people, rows_json FROM budget WHERE user_id = ?');

export function loadState(userId) {
  if (!selectUserById.get(userId)) return null;
  const budget = selectBudget.get(userId);
  return {
    cash: amount(selectCash.get(userId)?.cash),
    watchlist: selectWatchlist.all(userId).map((row) => row.symbol),
    recent: selectRecent.all(userId).map((row) => row.symbol),
    holdings: Object.fromEntries(selectHoldings.all(userId).map((row) => [row.symbol, { shares: row.shares, averagePrice: row.average_price }])),
    transactions: selectTransactions.all(userId).map((row) => ({
      id: row.id, symbol: row.symbol, type: row.type, shares: row.shares, price: row.price, total: row.total, createdAt: row.created_at,
    })),
    alerts: selectAlerts.all(userId).map((row) => ({
      id: row.id, symbol: row.symbol, type: row.type, threshold: row.threshold, createdAt: row.created_at,
    })),
    budget: budget
      ? { income: amount(budget.income), carryIn: amount(budget.carry_in), people: Math.max(1, Number(budget.people) || 1), rows: parseRows(budget.rows_json) }
      : null,
  };
}

/** Replaces the whole snapshot in one transaction so a partial save is impossible. */
export function saveState(userId, state) {
  if (!selectUserById.get(userId)) return false;
  const source = state && typeof state === 'object' ? state : {};

  db.exec('BEGIN IMMEDIATE');
  try {
    updateCash.run(amount(source.cash), userId);

    clearWatchlist.run(userId);
    const watched = [...new Set(list(source.watchlist).map(cleanSymbol))].filter(Boolean).slice(0, 100);
    watched.forEach((symbol, index) => insertWatch.run(userId, symbol, index));

    clearRecent.run(userId);
    const seen = [...new Set(list(source.recent).map(cleanSymbol))].filter(Boolean).slice(0, 50);
    seen.forEach((symbol, index) => insertRecent.run(userId, symbol, index));

    clearHoldings.run(userId);
    Object.entries(source.holdings && typeof source.holdings === 'object' ? source.holdings : {}).slice(0, 200).forEach(([key, item]) => {
      const symbol = cleanSymbol(key);
      const shares = amount(item?.shares);
      if (!symbol || shares <= 0) return;
      insertHolding.run(userId, symbol, shares, amount(item?.averagePrice));
    });

    clearTransactions.run(userId);
    list(source.transactions).slice(0, 500).forEach((item) => {
      const symbol = cleanSymbol(item?.symbol);
      const type = item?.type === 'buy' || item?.type === 'sell' ? item.type : null;
      if (!symbol || !type) return;
      insertTransaction.run(
        String(item.id || randomUUID()).slice(0, 40), userId, symbol, type,
        amount(item.shares), amount(item.price), amount(item.total),
        typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      );
    });

    clearAlerts.run(userId);
    list(source.alerts).slice(0, 100).forEach((item) => {
      const symbol = cleanSymbol(item?.symbol);
      const type = ['above', 'below', 'percent'].includes(item?.type) ? item.type : null;
      if (!symbol || !type || !Number.isFinite(Number(item.threshold))) return;
      insertAlert.run(
        String(item.id || randomUUID()).slice(0, 40), userId, symbol, type, Number(item.threshold),
        typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      );
    });

    const budget = source.budget && typeof source.budget === 'object' ? source.budget : {};
    const rows = budgetRows(budget.rows);
    upsertBudget.run(userId, amount(budget.income), amount(budget.carryIn), Math.max(1, Math.round(amount(budget.people)) || 1), JSON.stringify(rows));

    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* ---------------------------------------------------------- shared settings
 * The stock catalog and the paper-market state are global: every browser that
 * loads the app reads the same row, so an admin change is seen by everyone.
 */

const CATALOG_SYMBOL = /^[A-Z]{1,5}(\.[A-Z])?$/;
const CATALOG_ROW = 'catalog';
const MARKET_ROW = 'market_override';

const selectSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const writeSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

function readJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function cleanCatalogStock(value) {
  const stock = value && typeof value === 'object' ? value : {};
  const symbol = String(stock.symbol ?? '').trim().toUpperCase();
  const name = String(stock.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const price = Number(stock.price);
  if (!CATALOG_SYMBOL.test(symbol) || !name || !Number.isFinite(price) || price <= 0 || price > 1e9) return null;
  const change = Number(stock.change);
  const color = String(stock.color ?? '');
  return {
    symbol,
    name,
    sector: String(stock.sector ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Other',
    price: Number(price.toFixed(2)),
    change: Number.isFinite(change) ? Number(Math.max(-99, Math.min(99, change)).toFixed(2)) : 0,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#8b5cf6',
    mark: String(stock.mark ?? symbol.slice(0, 1)).trim().slice(0, 7),
  };
}

function normalizeCatalog(value) {
  const source = value && typeof value === 'object' ? value : {};
  const customStocks = [...new Map(
    list(source.customStocks).map(cleanCatalogStock).filter(Boolean).map((stock) => [stock.symbol, stock]),
  ).values()].slice(0, 200);
  const removedSymbols = [...new Set(
    list(source.removedSymbols).map((symbol) => String(symbol).trim().toUpperCase()).filter((symbol) => CATALOG_SYMBOL.test(symbol)),
  )].slice(0, 200);
  return { customStocks, removedSymbols };
}

export function loadSettings() {
  const override = readJson(selectSetting.get(MARKET_ROW)?.value ?? 'null', null);
  return {
    catalog: normalizeCatalog(readJson(selectSetting.get(CATALOG_ROW)?.value ?? 'null', {})),
    marketOverride: override === true || override === false ? override : null,
  };
}

/** Writes only the halves the caller sent, then returns the full stored result. */
export function saveSettings(patch) {
  const source = patch && typeof patch === 'object' ? patch : {};
  const stamp = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if ('catalog' in source) writeSetting.run(CATALOG_ROW, JSON.stringify(normalizeCatalog(source.catalog)), stamp);
    if ('marketOverride' in source) {
      const value = source.marketOverride;
      writeSetting.run(MARKET_ROW, JSON.stringify(value === true || value === false ? value : null), stamp);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadSettings();
}

export const DB_FILE = DB_PATH;
