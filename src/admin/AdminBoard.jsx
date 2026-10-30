import { useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  LockKeyhole,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  refreshMarketCatalog,
  readAdminConfig,
  readMarketOverride,
  saveAdminConfig,
  saveMarketOverride,
  stocks,
} from '../market';
import './admin.css';

const TICKER_PATTERN = /^[A-Z]{1,5}(?:\.[A-Z])?$/;
const COLOR_SWATCHES = ['#8b5cf6', '#22d3ee', '#35d399', '#f59e0b', '#fb7185', '#60a5fa'];
const SECTOR_OPTIONS = [
  'Technology',
  'Consumer',
  'Financials',
  'Healthcare',
  'Energy',
  'Industrials',
  'Communication',
  'Semiconductors',
  'ETFs',
  'Other',
];

const EMPTY_FORM = {
  symbol: '',
  name: '',
  sector: '',
  price: '',
  change: '',
  mark: '',
};

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeStock(stock) {
  const symbol = normalizeSymbol(stock?.symbol);
  return {
    ...stock,
    symbol,
    name: String(stock?.name || stock?.companyName || `${symbol} Holdings`).trim(),
    sector: String(stock?.sector || 'Other').trim(),
    price: Number(stock?.price) || 0,
    change: Number(stock?.change ?? stock?.dailyChange) || 0,
    mark: String(stock?.mark || symbol.slice(0, 1)).trim().slice(0, 7),
    color: stock?.color || colorForSymbol(symbol),
  };
}

function snapshotCatalog(source = stocks) {
  return (Array.isArray(source) ? source : []).map(normalizeStock).filter((stock) => stock.symbol);
}

function normalizeConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  const customStocks = Array.isArray(config.customStocks)
    ? config.customStocks.map(normalizeStock).filter((stock) => stock.symbol)
    : [];
  const removedSymbols = Array.isArray(config.removedSymbols)
    ? [...new Set(config.removedSymbols.map(normalizeSymbol).filter(Boolean))]
    : [];
  return { customStocks, removedSymbols };
}

function colorForSymbol(symbol) {
  const score = [...String(symbol)].reduce((total, character) => total + character.charCodeAt(0), 0);
  return COLOR_SWATCHES[score % COLOR_SWATCHES.length];
}

function safeRead(read, fallback) {
  try {
    return read() ?? fallback;
  } catch {
    return fallback;
  }
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
}

function formatChange(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00%';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function emitWindowEvent(name, detail) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function Field({ label, id, hint, error, required = false, children }) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <span className="admin-field-hint">{hint}</span>}
      {error && (
        <span className="admin-field-error" id={`${id}-error`} role="alert">
          <CircleAlert size={13} aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  );
}

function StockMark({ stock, size = '' }) {
  return (
    <span
      className={`admin-stock-mark ${size}`}
      style={{ '--admin-logo-color': stock.color || colorForSymbol(stock.symbol) }}
      aria-hidden="true"
    >
      {stock.mark || stock.symbol.slice(0, 1)}
    </span>
  );
}

function Notice({ notice }) {
  if (!notice) return null;
  return (
    <div className={`admin-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.tone === 'error' ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
      <span>{notice.message}</span>
    </div>
  );
}

function CatalogRow({ stock, removed = false, onRemove, onRestore }) {
  return (
    <div className="admin-catalog-row" role="row">
      <div className="admin-stock-identity" role="cell">
        <StockMark stock={stock} />
        <span>
          <strong>{stock.symbol}</strong>
          <small>{stock.name}</small>
        </span>
      </div>
      <span className="admin-sector-cell" role="cell">{stock.sector}</span>
      <span className="admin-price-cell" role="cell">{formatPrice(stock.price)}</span>
      <span className={`admin-change-cell ${stock.change >= 0 ? 'positive' : 'negative'}`} role="cell">
        {stock.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {formatChange(stock.change)}
      </span>
      <div className="admin-row-action" role="cell">
        {removed ? (
          <button className="admin-quiet-button restore" type="button" onClick={() => onRestore(stock.symbol)}>
            <ArchiveRestore size={15} /> Restore
          </button>
        ) : (
          <button
            className="admin-icon-action danger"
            type="button"
            onClick={() => onRemove(stock.symbol)}
            aria-label={`Remove ${stock.symbol} from the active catalog`}
            title={`Remove ${stock.symbol}`}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function CatalogTable({ stocks: catalog, removed, onRemove, onRestore }) {
  if (!catalog.length) {
    return (
      <div className="admin-empty-state">
        <ArchiveRestore size={20} />
        <strong>{removed ? 'No removed stocks' : 'No active stocks'}</strong>
        <span>{removed ? 'Removed symbols will appear here so they can be restored.' : 'Add a stock to start building the active catalog.'}</span>
      </div>
    );
  }

  return (
    <div className="admin-catalog-table" role="table" aria-label={removed ? 'Removed stocks' : 'Active stocks'}>
      <div className="admin-catalog-header" role="row">
        <span role="columnheader">Stock</span>
        <span role="columnheader">Sector</span>
        <span role="columnheader">Price</span>
        <span role="columnheader">Daily change</span>
        <span role="columnheader"><span className="sr-only">Actions</span></span>
      </div>
      {catalog.map((stock) => (
        <CatalogRow
          key={stock.symbol}
          stock={stock}
          removed={removed}
          onRemove={onRemove}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}

export function validateStockForm(form) {
  const errors = {};
  const symbol = normalizeSymbol(form.symbol);
  const name = String(form.name || '').trim();
  const sector = String(form.sector || '').trim();
  const price = Number.parseFloat(String(form.price || '').replace(/,/g, ''));
  const change = form.change === '' ? 0 : Number.parseFloat(String(form.change).replace('%', '').replace(/,/g, ''));

  if (!symbol) errors.symbol = 'Enter a ticker symbol.';
  else if (!TICKER_PATTERN.test(symbol)) errors.symbol = 'Use 1–5 letters, with an optional class suffix such as BRK.B.';
  if (!name) errors.name = 'Enter the company name.';
  if (!sector) errors.sector = 'Choose or enter a sector.';
  if (!Number.isFinite(price) || price <= 0) errors.price = 'Price must be a positive number.';
  if (!Number.isFinite(change)) errors.change = 'Use a number such as 1.25 or -0.80.';

  return {
    errors,
    stock: {
      symbol,
      name,
      sector,
      price,
      change,
      mark: String(form.mark || '').trim().slice(0, 7) || symbol.slice(0, 1),
      color: colorForSymbol(symbol),
    },
  };
}

export function AdminBoard({ onCatalogChange, onMarketChange }) {
  const [initialConfig] = useState(() => normalizeConfig(safeRead(readAdminConfig, {})));
  const [initialCatalog] = useState(() => snapshotCatalog(stocks));
  const knownStocks = useRef(new Map(initialCatalog.map((stock) => [stock.symbol, stock])));
  const [config, setConfig] = useState(initialConfig);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [marketOverride, setMarketOverride] = useState(() => safeRead(readMarketOverride, null));
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const customBySymbol = useMemo(
    () => new Map(config.customStocks.map((stock) => [stock.symbol, normalizeStock(stock)])),
    [config.customStocks],
  );

  const removedStocks = useMemo(() => config.removedSymbols.map((symbol) => (
    customBySymbol.get(symbol)
      || knownStocks.current.get(symbol)
      || normalizeStock({ symbol, name: 'Removed catalog entry', sector: '—', price: 0, change: 0 })
  )), [config.removedSymbols, customBySymbol]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const commitCatalog = async (nextConfig, detail, successMessage) => {
    setBusy(true);
    try {
      await saveAdminConfig(nextConfig);
      const refreshed = refreshMarketCatalog();
      const nextCatalog = snapshotCatalog(refreshed || stocks);
      nextCatalog.forEach((stock) => knownStocks.current.set(stock.symbol, stock));
      setConfig(normalizeConfig(readAdminConfig()));
      setCatalog(nextCatalog);
      emitWindowEvent('stockmark:catalog-changed', { ...detail, stocks: nextCatalog });
      onCatalogChange?.(nextCatalog);
      setNotice({ tone: 'success', message: successMessage });
      return true;
    } catch (error) {
      setNotice({ tone: 'error', message: error?.message || 'The catalog could not be saved to the server.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAddStock = async (event) => {
    event.preventDefault();
    const result = validateStockForm(form);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      setNotice({ tone: 'error', message: 'Review the highlighted fields before adding the stock.' });
      return;
    }

    const nextConfig = {
      customStocks: [
        ...config.customStocks.filter((stock) => normalizeSymbol(stock.symbol) !== result.stock.symbol),
        result.stock,
      ],
      removedSymbols: config.removedSymbols.filter((symbol) => symbol !== result.stock.symbol),
    };
    if (await commitCatalog(nextConfig, { action: 'upsert', symbol: result.stock.symbol }, `${result.stock.symbol} is live for everyone.`)) {
      knownStocks.current.set(result.stock.symbol, result.stock);
      setForm(EMPTY_FORM);
      setErrors({});
    }
  };

  const handleRemove = async (symbol) => {
    const normalized = normalizeSymbol(symbol);
    const stock = catalog.find((item) => item.symbol === normalized);
    if (stock) knownStocks.current.set(normalized, stock);
    const nextConfig = {
      ...config,
      removedSymbols: [...new Set([...config.removedSymbols, normalized])],
    };
    await commitCatalog(nextConfig, { action: 'remove', symbol: normalized }, `${normalized} was removed for everyone. You can restore it below.`);
  };

  const handleRestore = async (symbol) => {
    const normalized = normalizeSymbol(symbol);
    const nextConfig = {
      ...config,
      removedSymbols: config.removedSymbols.filter((item) => item !== normalized),
    };
    await commitCatalog(nextConfig, { action: 'restore', symbol: normalized }, `${normalized} is live again for everyone.`);
  };

  const handleMarketChange = async (value) => {
    setBusy(true);
    try {
      const saved = await saveMarketOverride(value);
      setMarketOverride(saved);
      emitWindowEvent('stockmark:market-changed', { override: saved });
      onMarketChange?.(saved);
      setNotice({
        tone: 'success',
        message: saved === true ? 'Paper market shown as open for everyone.' : saved === false ? 'Paper market shown as closed for everyone — orders still fill at the last updated price.' : 'Market state follows the NYSE schedule again.',
      });
    } catch (error) {
      setNotice({ tone: 'error', message: error?.message || 'The market setting could not be saved to the server.' });
    } finally {
      setBusy(false);
    }
  };

  const activeCount = catalog.length;
  const customCount = config.customStocks.filter((stock) => !config.removedSymbols.includes(stock.symbol)).length;

  return (
    <section className="admin-board" aria-labelledby="admin-board-title">
      <header className="admin-board-header">
        <div>
          <p className="admin-eyebrow"><Settings2 size={14} /> Catalog operations</p>
          <h1 id="admin-board-title">Admin board</h1>
          <p className="admin-intro">Shape the paper-trading universe and decide when learners can practice.</p>
        </div>
        <div className="admin-header-stats" aria-label="Catalog summary">
          <span><strong>{activeCount}</strong> active</span>
          <span><strong>{customCount}</strong> custom</span>
          <span><strong>{removedStocks.length}</strong> removed</span>
        </div>
      </header>

      <div className="admin-warning" role="note">
        <LockKeyhole size={17} aria-hidden="true" />
        <div>
          <strong>Shared settings — changes here apply to every browser, not secure production authorization</strong>
        </div>
      </div>

      <Notice notice={notice} />

      <div className="admin-board-grid">
        <section className="admin-panel admin-add-panel" aria-labelledby="add-stock-title">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-eyebrow">Catalog editor</p>
              <h2 id="add-stock-title">Add or update a stock</h2>
            </div>
            <span className="admin-heading-icon"><Plus size={18} /></span>
          </div>
          <p className="admin-panel-copy">Add a custom practice asset or update an existing ticker. Saving the same symbol makes it active again.</p>

          <form className="admin-stock-form" onSubmit={handleAddStock} noValidate>
            <div className="admin-form-grid">
              <Field id="admin-symbol" label="Ticker symbol" required error={errors.symbol} hint="Example: EDU or BRK.B">
                <input
                  id="admin-symbol"
                  value={form.symbol}
                  onChange={(event) => setField('symbol', event.target.value.toUpperCase())}
                  placeholder="EDU"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.symbol)}
                  aria-describedby={errors.symbol ? 'admin-symbol-error' : undefined}
                />
              </Field>
              <Field id="admin-name" label="Company name" required error={errors.name}>
                <input
                  id="admin-name"
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  placeholder="Summit Learning Co."
                  autoComplete="organization"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'admin-name-error' : undefined}
                />
              </Field>
              <Field id="admin-sector" label="Sector" required error={errors.sector}>
                <div className="admin-select-wrap">
                  <input
                    id="admin-sector"
                    list="admin-sector-options"
                    value={form.sector}
                    onChange={(event) => setField('sector', event.target.value)}
                    placeholder="Choose or type a sector"
                    aria-invalid={Boolean(errors.sector)}
                    aria-describedby={errors.sector ? 'admin-sector-error' : undefined}
                  />
                  <ChevronDown size={15} aria-hidden="true" />
                </div>
                <datalist id="admin-sector-options">
                  {SECTOR_OPTIONS.map((sector) => <option value={sector} key={sector} />)}
                </datalist>
              </Field>
              <Field id="admin-price" label="Price" required error={errors.price} hint="USD per share">
                <div className="admin-input-prefix">
                  <span>$</span>
                  <input
                    id="admin-price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={(event) => setField('price', event.target.value)}
                    placeholder="125.00"
                    inputMode="decimal"
                    aria-invalid={Boolean(errors.price)}
                    aria-describedby={errors.price ? 'admin-price-error' : undefined}
                  />
                </div>
              </Field>
              <Field id="admin-change" label="Daily change" error={errors.change} hint="Percent, e.g. 1.25 or -0.80">
                <div className="admin-input-suffix">
                  <input
                    id="admin-change"
                    type="number"
                    step="0.01"
                    value={form.change}
                    onChange={(event) => setField('change', event.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    aria-invalid={Boolean(errors.change)}
                    aria-describedby={errors.change ? 'admin-change-error' : undefined}
                  />
                  <span>%</span>
                </div>
              </Field>
              <Field id="admin-mark" label="Logo mark" hint="Optional · up to 7 characters">
                <input id="admin-mark" maxLength="7" value={form.mark} onChange={(event) => setField('mark', event.target.value)} placeholder="E" />
              </Field>
            </div>
            <div className="admin-form-actions">
              <button className="admin-primary-button" type="submit" disabled={busy}><Plus size={16} /> {busy ? 'Saving…' : 'Save stock'}</button>
              <button
                className="admin-secondary-button"
                type="button"
                onClick={() => { setForm(EMPTY_FORM); setErrors({}); setNotice(null); }}
              >
                <RotateCcw size={15} /> Clear
              </button>
            </div>
          </form>
        </section>

        <section className="admin-panel admin-market-panel" aria-labelledby="market-controls-title">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-eyebrow">Session control</p>
              <h2 id="market-controls-title">Market controls</h2>
            </div>
            <span className={`admin-market-indicator ${marketOverride === false ? 'closed' : marketOverride === null ? 'scheduled' : ''}`}>
              <i />
              {marketOverride === true ? 'Open' : marketOverride === false ? 'Closed' : 'Scheduled'}
            </span>
          </div>
          <p className="admin-panel-copy">Choose the session state everyone sees. Orders fill at the last updated price whether the market is open or closed.</p>
          <div className="admin-market-options" role="group" aria-label="Market state">
            <button
              className={marketOverride === true ? 'selected open' : ''}
              type="button"
              onClick={() => handleMarketChange(true)}
              aria-pressed={marketOverride === true}
              disabled={busy}
            >
              <span className="admin-option-icon"><Check size={15} /></span>
              <span><strong>Open market</strong><small>Show the session as trading</small></span>
            </button>
            <button
              className={marketOverride === false ? 'selected closed' : ''}
              type="button"
              onClick={() => handleMarketChange(false)}
              aria-pressed={marketOverride === false}
              disabled={busy}
            >
              <span className="admin-option-icon"><LockKeyhole size={14} /></span>
              <span><strong>Close market</strong><small>Show the session as closed</small></span>
            </button>
            <button
              className={marketOverride === null ? 'selected schedule' : ''}
              type="button"
              onClick={() => handleMarketChange(null)}
              aria-pressed={marketOverride === null}
              disabled={busy}
            >
              <span className="admin-option-icon"><RotateCcw size={15} /></span>
              <span><strong>Use schedule</strong><small>Follow weekday session hours</small></span>
            </button>
          </div>
          <div className="admin-market-footnote"><CircleCheck size={14} /> Saved on the server, so every browser gets the same session state.</div>
        </section>
      </div>

      <section className="admin-panel admin-catalog-panel" aria-labelledby="active-catalog-title">
        <div className="admin-panel-heading catalog-heading">
          <div>
            <p className="admin-eyebrow">Live catalog</p>
            <h2 id="active-catalog-title">Active stocks</h2>
          </div>
          <span className="admin-count-badge">{activeCount} symbols</span>
        </div>
        <CatalogTable stocks={catalog} onRemove={handleRemove} />
      </section>

      <section className="admin-panel admin-removed-panel" aria-labelledby="removed-catalog-title">
        <button className="admin-collapsible-heading" type="button" onClick={() => setShowRemoved((value) => !value)} aria-expanded={showRemoved}>
          <span><p className="admin-eyebrow">Recovery shelf</p><strong id="removed-catalog-title">Inactive / removed stocks</strong><small>Reversible catalog removals</small></span>
          <span className="admin-collapsible-meta"><b>{removedStocks.length}</b><ChevronDown size={18} /></span>
        </button>
        {showRemoved && <div className="admin-removed-content"><CatalogTable stocks={removedStocks} removed onRestore={handleRestore} /></div>}
      </section>

      <footer className="admin-board-footer">
        <span><LockKeyhole size={14} /> Saved on the server — every browser sees these changes.</span>
        <span>Educational use only · no real orders</span>
      </footer>
    </section>
  );
}

export default AdminBoard;
