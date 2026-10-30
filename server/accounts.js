/*
 * Account and portfolio-state routes backed by SQLite.
 *
 * The session token is an HttpOnly cookie, so the browser keeps it and page
 * scripts cannot read it. Only the signed-in user's own row is ever returned.
 */

import { Router, json as jsonBody } from 'express';
import {
  SESSION_COOKIE, SESSION_TTL_MS, createUser, endSession, findUserByEmail,
  findUserByEmailRecord, loadSettings, loadState, saveSettings, saveState, startSession,
  userForToken, verifyPassword,
} from './db.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 80;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

function readCookie(header, name) {
  const pair = String(header || '').split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return null;
  }
}

function cookieValue(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function cleanName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= MAX_NAME ? name : null;
}

function cleanPassword(value) {
  const password = String(value ?? '');
  return password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD ? password : null;
}

export const accountRouter = Router();

accountRouter.use(jsonBody({ limit: '256kb' }));

function authenticate(req, _res, next) {
  req.user = userForToken(readCookie(req.headers.cookie, SESSION_COOKIE));
  next();
}

accountRouter.use(authenticate);

function requireAccount(req, res) {
  if (req.user) return true;
  res.status(401).json({ error: 'Log in to use this.' });
  return false;
}

accountRouter.post('/auth/signup', (req, res) => {
  const name = cleanName(req.body?.displayName ?? req.body?.name);
  const email = cleanEmail(req.body?.email);
  const password = cleanPassword(req.body?.password);
  if (!name) return res.status(400).json({ error: 'Enter a display name between 2 and 80 characters.' });
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password) return res.status(400).json({ error: `Choose a password of at least ${MIN_PASSWORD} characters.` });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'That email already has an account. Log in instead.' });

  let user;
  try {
    user = createUser({ name, email, password });
  } catch {
    return res.status(500).json({ error: 'The account could not be created. Try again.' });
  }
  const token = startSession(user.id);
  res.setHeader('Set-Cookie', cookieValue(token, Math.floor(SESSION_TTL_MS / 1000)));
  // Returning the state here saves a second round-trip before the app can render.
  return res.status(201).json({ user, state: loadState(user.id) });
});

accountRouter.post('/auth/login', (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });
  const record = findUserByEmailRecord(email);
  // One message for both branches so the endpoint does not confirm which emails exist.
  if (!record || !verifyPassword(password, record.password_hash)) {
    return res.status(401).json({ error: 'Email or password is wrong.' });
  }
  const token = startSession(record.id);
  res.setHeader('Set-Cookie', cookieValue(token, Math.floor(SESSION_TTL_MS / 1000)));
  return res.json({ user: userForToken(token), state: loadState(record.id) });
});

accountRouter.post('/auth/logout', (req, res) => {
  endSession(readCookie(req.headers.cookie, SESSION_COOKIE));
  res.setHeader('Set-Cookie', cookieValue('', 0));
  res.json({ user: null });
});

accountRouter.get('/auth/session', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user, state: loadState(req.user.id) });
});

accountRouter.get('/state', (req, res) => {
  if (!requireAccount(req, res)) return undefined;
  res.json({ state: loadState(req.user.id) });
});

accountRouter.put('/state', (req, res) => {
  if (!requireAccount(req, res)) return undefined;
  try {
    saveState(req.user.id, req.body?.state ?? req.body);
    res.json({ state: loadState(req.user.id) });
  } catch {
    res.status(500).json({ error: 'The portfolio could not be saved.' });
  }
});

/* ------------------------------------------------------------------- settings
 * Read by every visitor, signed in or not, because the stock catalog and the
 * paper-market state shape the whole app. Only an admin may write them.
 */

accountRouter.get('/settings', (_req, res) => {
  res.json({ settings: loadSettings() });
});

accountRouter.put('/settings', (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Only an admin can change shared settings.' });
  const patch = req.body?.settings ?? req.body ?? {};
  if (!('catalog' in patch) && !('marketOverride' in patch)) {
    return res.status(400).json({ error: 'Nothing to save was supplied.' });
  }
  try {
    res.json({ settings: saveSettings(patch) });
  } catch {
    res.status(500).json({ error: 'The settings could not be saved.' });
  }
});
