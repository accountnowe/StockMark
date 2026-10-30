/*
 * Client for the account and portfolio routes served by server/accounts.js.
 * Requests go to /api, which the dev server proxies to the Node API, so the
 * session cookie stays same-origin.
 */

export class AccountApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AccountApiError('The account server is not reachable. Start it with npm run server.', 0);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new AccountApiError(payload?.error || 'The request could not be completed.', response.status);
  }
  return payload || {};
}

export function signupAccount(displayName, email, password) {
  return request('/auth/signup', { method: 'POST', body: { displayName, email, password } });
}

export function loginAccount(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}

export function logoutAccount() {
  return request('/auth/logout', { method: 'POST' });
}

/** Never throws: a missing server simply means the visitor stays a guest. */
export async function fetchSession() {
  try {
    const data = await request('/auth/session');
    return { user: data.user || null, state: data.state || null, offline: false };
  } catch {
    return { user: null, state: null, offline: true };
  }
}

export async function fetchPortfolio() {
  const data = await request('/state');
  return data.state || null;
}

export function savePortfolio(state) {
  return request('/state', { method: 'PUT', body: { state } });
}
