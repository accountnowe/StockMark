/*
 * Account session for signed-in paper trading.
 *
 * Profiles live in the server's SQLite database and are opened with an email
 * and password; the provider also owns the portfolio adapter that the rest of
 * the app reads, so a guest and an account are the same shape to the UI.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createServerStore, createStorage } from '../storage.js';
import { AccountApiError, fetchSession, loginAccount, logoutAccount, savePortfolio, signupAccount } from './api.js';
import './auth.css';

const AccountContext = createContext(null);
const OFFLINE = 'The account server is not running, so nothing was saved. Start it with npm run server and try again.';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

function errorMessage(error) {
  if (error instanceof AccountApiError) return error.message;
  return 'Something went wrong with this request. Please try again.';
}

export function AccountProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', account: null, snapshot: null });
  const storeRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchSession().then((next) => {
      if (active) setSession({ status: 'ready', account: next.user, snapshot: next.state });
    });
    return () => { active = false; };
  }, []);

  const adopt = useCallback((account, snapshot) => {
    setSession({ status: 'ready', account, snapshot });
  }, []);

  const login = useCallback(async (email, password) => {
    const next = await loginAccount(email, password);
    adopt(next.user, next.state);
    return next.user;
  }, [adopt]);

  const signup = useCallback(async (displayName, email, password) => {
    const next = await signupAccount(displayName, email, password);
    adopt(next.user, next.state);
    return next.user;
  }, [adopt]);

  const logout = useCallback(async () => {
    // Flush pending portfolio writes while the session cookie still exists.
    storeRef.current?.dispose?.();
    await logoutAccount();
    adopt(null, null);
    return true;
  }, [adopt]);

  const store = useMemo(() => {
    if (session.status !== 'ready') return null;
    return session.account
      ? createServerStore(session.snapshot, savePortfolio)
      : createStorage('guest');
  }, [session]);

  useEffect(() => { storeRef.current = store; }, [store]);

  const value = useMemo(() => ({
    status: session.status,
    account: session.account,
    store,
    login,
    signup,
    logout,
  }), [session.status, session.account, store, login, signup, logout]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used within AccountProvider');
  return context;
}

export function AuthDialog({ mode, onClose }) {
  const { login, signup } = useAccount();
  const dialogRef = useRef(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  useEffect(() => {
    dialogRef.current?.querySelector('input')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSignup, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isSignup) await signup(displayName, email, password);
      else await login(email, password);
      onClose();
    } catch (submissionError) {
      setError(errorMessage(submissionError));
      if (submissionError instanceof AccountApiError && submissionError.status === 0) setNotice(OFFLINE);
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    onClose();
  };

  return <div className="auth-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="auth-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="auth-dialog-head">
        <div><p className="auth-kicker">Stockmark · paper trading</p><h2 id="account-title">{isSignup ? 'Create your account' : 'Log in'}</h2></div>
        <button className="auth-close" type="button" aria-label="Close dialog" onMouseDown={closeDialog} onClick={closeDialog}>×</button>
      </div>
      <form onSubmit={submit} noValidate>
        {isSignup && <label className="auth-field">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={80} placeholder="e.g. Jordan Smith" disabled={busy} aria-invalid={Boolean(error)} /></label>}
        <label className="auth-field">Email address<input type="text" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder="you@example.com" disabled={busy} aria-invalid={Boolean(error)} /></label>
        <label className="auth-field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} maxLength={200} minLength={isSignup ? 8 : undefined} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} disabled={busy} aria-invalid={Boolean(error)} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Working…' : isSignup ? 'Create account' : 'Log in'}</button>
      </form>
      <p className="auth-switch">{isSignup ? 'Already have an account?' : 'No account yet?'} <button type="button" disabled={busy} onClick={() => { setError(''); setNotice(''); onClose(isSignup ? 'login' : 'signup'); }}>{isSignup ? 'Log in' : 'Sign up'}</button></p>
      <p className="auth-guest-note">You can also close this window and keep trading as a guest. Guest data stays in this browser only.</p>
    </section>
  </div>;
}

/** Account controls intended for the app header; guest visitors always see both entry points. */
export function AccountControls({ className = '', onViewPortfolio }) {
  const { account, logout } = useAccount();
  const [dialog, setDialog] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const openerRef = useRef(null);
  const [logoutError, setLogoutError] = useState('');

  const closeDialog = (nextMode) => {
    setDialog(nextMode || null);
    if (!nextMode) {
      const restore = () => openerRef.current?.focus();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
      else restore();
    }
  };

  const openDialog = (mode, event) => {
    openerRef.current = event.currentTarget;
    setDialog(mode);
    setLogoutError('');
  };

  const doLogout = async () => {
    setLogoutError('');
    setProfileOpen(false);
    try {
      await logout();
    } catch (error) {
      setLogoutError(error instanceof AccountApiError ? error.message : 'Log out failed. Refresh the page to try again.');
    }
  };

  return <div className={`account-controls ${className}`.trim()}>
    {account ? <>
      <button className="account-profile" type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((value) => !value)}><span className="account-avatar" aria-hidden="true">{initials(account.displayName)}</span><span className="account-copy"><strong>{account.displayName}</strong><small>{account.email}</small></span></button>
      {profileOpen && <div className="account-menu" role="menu"><div className="account-menu-profile"><span className="account-avatar large" aria-hidden="true">{initials(account.displayName)}</span><div><strong>{account.displayName}</strong><small>{account.email}</small></div></div><div className="account-menu-divider" />{onViewPortfolio && <button className="account-menu-item" role="menuitem" type="button" onClick={() => { setProfileOpen(false); onViewPortfolio(); }}>View portfolio</button>}<button className="account-menu-item" role="menuitem" type="button" onClick={doLogout}>Log out</button></div>}
    </> : <>
      <span className="guest-label">Guest mode</span>
      <button className="account-button account-login" type="button" onClick={(event) => openDialog('login', event)}>Log in</button>
      <button className="account-button account-signup" type="button" onClick={(event) => openDialog('signup', event)}>Sign up</button>
    </>}
    {logoutError && <span className="account-error" role="alert">{logoutError}</span>}
    {dialog && <AuthDialog mode={dialog} onClose={closeDialog} />}
  </div>;
}
