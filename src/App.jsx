import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, BookOpen, BriefcaseBusiness,
  ChevronRight, CircleDollarSign, Clock3, LineChart, Menu, Newspaper, Plus, RefreshCw,
  ScanSearch, Search, Settings2, ShieldCheck, Sparkles, Star, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Pie, PieChart, Sector,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  formatCurrency, formatDateTime, formatPercent, formatTime,
} from './storage';
import { AccountControls, AccountProvider, AuthDialog, useAccount } from './auth/Accounts.jsx';
import {
  STOCK_CATALOG, MARKET_SECTORS, stockBySymbol, logoDomains, fallbackQuote, normalizeQuote,
  normalizeHistory, buildPortfolioHistory, getCachedMarket, setCachedMarket, evaluateAlert,
  filterCatalog, readMarketOverride, refreshMarketCatalog,
} from './market';
import AdminBoard from './admin/AdminBoard.jsx';
import { BudgetPlanner } from './budget/BudgetPlanner.jsx';
import { ExpenseAnalyzer } from './expenses/ExpenseAnalyzer.jsx';

const stocks = STOCK_CATALOG;
const VIEWS = ['overview', 'portfolio', 'watchlist', 'activity', 'screener', 'news', 'budget', 'expenses', 'admin'];

function readRoute() {
  const parts = String(window.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'stock' && parts[1]) return { view: 'overview', symbol: decodeURIComponent(parts[1]).toUpperCase() };
  if (VIEWS.includes(parts[0])) return { view: parts[0], symbol: null };
  return { view: 'overview', symbol: null };
}

const routeToHash = ({ view, symbol }) => (symbol ? `#/stock/${symbol}` : `#/${view}`);
const indices = [
  ['SPX', 'S&P 500', '5,973.10', '+0.42%', true],
  ['NDX', 'Nasdaq 100', '21,512.18', '+0.76%', true],
  ['DJI', 'Dow Jones', '43,444.99', '-0.18%', false],
  ['RUT', 'Russell 2000', '2,209.54', '+0.31%', true],
];

async function requestMarket(path, symbol) {
  try {
    const response = await fetch(`/api/market/${path}?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  } catch (error) {
    return { demo: true, error: error.message, data: {} };
  }
}

function hasPositiveHistory(payload) {
  const series = payload?.data?.['Time Series (Daily)'];
  return Boolean(series && Object.values(series).some((item) => Number.parseFloat(item?.['4. close']) > 0));
}

function useStock(symbol, refreshKey) {
  const [state, setState] = useState({
    symbol: null, quote: null, history: [], overview: null, loading: false, source: 'loading',
    historyDemo: false, error: null,
  });

  useEffect(() => {
    let live = true;
    if (!symbol) {
      setState({ symbol: null, quote: null, history: [], overview: null, loading: false, source: 'loading', historyDemo: false, error: null });
      return () => { live = false; };
    }
    setState({ symbol, quote: null, history: [], overview: null, loading: true, source: 'loading', historyDemo: false, error: null });

    const load = async () => {
      const cachedQuote = refreshKey === 0 ? getCachedMarket('quote', symbol) : null;
      const cachedHistory = refreshKey === 0 ? getCachedMarket('history', symbol) : null;
      const cachedHistoryDemo = refreshKey === 0 ? getCachedMarket('history-demo', symbol) : null;
      const [quotePayload, historyPayload, overviewPayload] = await Promise.all([
        cachedQuote ? Promise.resolve(null) : requestMarket('quote', symbol),
        cachedHistory ? Promise.resolve(null) : requestMarket('history', symbol),
        requestMarket('overview', symbol),
      ]);
      if (!live) return;
      const quote = cachedQuote || setCachedMarket('quote', symbol, normalizeQuote(quotePayload, symbol));
      const history = cachedHistory || setCachedMarket('history', symbol, normalizeHistory(historyPayload, symbol));
      const historyDemo = cachedHistoryDemo ?? (!hasPositiveHistory(historyPayload) || Boolean(historyPayload?.demo));
      if (cachedHistoryDemo === null) setCachedMarket('history-demo', symbol, historyDemo);
      const overview = overviewPayload?.data?.Name ? overviewPayload.data : null;
      setState({
        symbol,
        quote,
        history,
        overview,
        loading: false,
        source: quote.demo || quote.unavailable || historyDemo ? 'demo' : 'alpha-vantage',
        historyDemo,
        error: quote.error || historyPayload?.error || overviewPayload?.error || null,
      });
    };
    load();
    return () => { live = false; };
  }, [symbol, refreshKey]);

  return state;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function Trend({ value, positive }) {
  return <span className={`trend ${positive ? 'positive' : 'negative'}`}>
    {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{value}
  </span>;
}

function DemoBadge() { return null; }

function Logo({ symbol, size = '' }) {
  const domain = logoDomains[symbol];
  return <span className={`stock-logo ${size}`} style={{ '--logo-color': stockBySymbol[symbol]?.color || '#8b5cf6' }}>
    {domain && <img src={`https://cdn.simpleicons.org/${domain}`} alt={`${symbol} logo`} onError={(event) => { const image = event.currentTarget; const step = Number(image.dataset.fallback || 0); if (step === 0) { image.dataset.fallback = '1'; image.src = `https://logo.clearbit.com/${domain}.com?size=64`; } else if (step === 1) { image.dataset.fallback = '2'; image.src = `https://www.google.com/s2/favicons?domain=${domain}.com&sz=64`; } else image.style.display = 'none'; }} />}<span>{stockBySymbol[symbol]?.mark || symbol.slice(0, 1)}</span>
  </span>;
}

function Metric({ label, value, footnote, icon, tone = 'purple', trend, onClick }) {
  return <button className="metric-card card-button" onClick={onClick} type="button">
    <div className="metric-head"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div>
    <strong>{value}</strong>
    <div className="metric-foot">{trend && <Trend value={trend.value} positive={trend.positive} />}<span>{footnote}</span></div>
  </button>;
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span><strong>{formatCurrency(payload[0].value)}</strong></div>;
}

function Sparkline({ positive, label = 'Demo price trend' }) {
  const reducedMotion = useReducedMotion();
  const data = Array.from({ length: 14 }, (_, index) => ({
    value: 28 + index * (positive ? 1.4 : -0.7) + Math.sin(index * 1.3) * 4,
  }));
  return <div role="img" aria-label={label} className="sparkline-chart">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} isAnimationActive={!reducedMotion}>
        <Area type="monotone" dataKey="value" stroke={positive ? '#34d399' : '#fb7185'} fill={positive ? '#34d399' : '#fb7185'} fillOpacity={.12} strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

function SearchBox({ recent, onSelect }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = filterCatalog(value).slice(0, 7);
  const select = (symbol) => {
    const next = (symbol || value).trim().toUpperCase();
    if (next) onSelect(next);
    setValue('');
    setOpen(false);
  };
  return <div className="search-wrap">
    <Search size={17} />
    <input
      value={value}
      onChange={(event) => { setValue(event.target.value); setActiveIndex(0); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
        if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + results.length) % results.length); }
        if (event.key === 'Enter') { event.preventDefault(); select(value && results[activeIndex]?.symbol); }
        if (event.key === 'Escape') setOpen(false);
      }}
      placeholder="Search stocks, ETFs, or symbols"
      aria-label="Search stocks"
      aria-expanded={open}
    />
    {value && <button className="clear-search" onClick={() => setValue('')} type="button" aria-label="Clear search"><X size={15} /></button>}
    {open && <div className="search-dropdown">
      {value ? results.length ? results.map((item, index) => <button
        key={item.symbol}
        className={index === activeIndex ? 'active' : ''}
        onMouseDown={() => select(item.symbol)}
        type="button"
      ><Logo symbol={item.symbol} size="small" /><span><strong>{item.symbol}</strong><small>{item.name} · {item.sector}</small></span><ChevronRight size={15} /></button>) : <div className="search-empty"><Search size={18} />No catalog match — press Enter to open {value.toUpperCase()}</div>
        : <><p className="dropdown-label">Recent searches</p>{recent.length ? recent.slice(0, 3).map((symbol) => <button key={symbol} onMouseDown={() => select(symbol)} type="button"><Clock3 size={15} />{symbol}</button>) : <div className="search-empty"><Sparkles size={18} />Try a popular symbol like NVDA</div>}</>}
    </div>}
  </div>;
}

function Sidebar({ view, onNavigate, mobileOpen, setMobileOpen, isAdmin, marketOverride }) {
  const links = [['overview', 'Overview', <BarChart3 size={18} />], ['portfolio', 'Portfolio', <BriefcaseBusiness size={18} />], ['watchlist', 'Watchlist', <Star size={18} />], ['activity', 'Activity', <Activity size={18} />], ...(isAdmin ? [['admin', 'Admin board', <Settings2 size={18} />]] : [])];
  const market = getMarketStatus(new Date(), marketOverride);
  return <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
    <div className="brand"><span className="brand-mark"><LineChart size={20} /></span><span>stock<span>mark</span></span></div>
    <button className="close-mobile" onClick={() => setMobileOpen(false)} type="button" aria-label="Close menu"><X size={18} /></button>
    <div className="side-section"><p className="side-label">Workspace</p>{links.map(([id, label, icon]) => <button key={id} className={`side-link ${view === id ? 'active' : ''}`} onClick={() => { onNavigate(id); setMobileOpen(false); }} type="button">{icon}<span>{label}</span>{id === 'watchlist' && <span className="nav-badge">3</span>}</button>)}</div>
    <div className="side-section"><p className="side-label">Explore</p><button className={`side-link ${view === 'screener' ? 'active' : ''}`} onClick={() => { onNavigate('screener'); setMobileOpen(false); }} type="button"><ScanSearch size={18} /><span>Screener</span></button><button className="side-link" onClick={() => onNavigate('news')} type="button"><Newspaper size={18} /><span>News</span></button><button className={`side-link ${view === 'budget' ? 'active' : ''}`} onClick={() => onNavigate('budget')} type="button"><BookOpen size={18} /><span>Budget planner</span></button><button className={`side-link ${view === 'expenses' ? 'active' : ''}`} onClick={() => onNavigate('expenses')} type="button"><Sparkles size={18} /><span>Expense analyzer</span></button></div>
    <div className="sidebar-bottom"><div className="market-status"><span className={`status-dot ${market.open ? '' : 'closed'}`} /><div><strong>{market.label}</strong><small>{market.detail}</small></div></div><div className="mini-disclaimer">Paper trading only<br /><span>Educational use · No advice</span></div></div>
  </aside>;
}

function Header({ recent, onSearch, onRefresh, loading, setMobileOpen, notifications = [], onNotify, onViewPortfolio }) {
  return <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} type="button" aria-label="Open menu"><Menu size={21} /></button><SearchBox recent={recent} onSelect={onSearch} /><div className="topbar-actions"><button className="icon-button" onClick={onRefresh} type="button" aria-label="Refresh market prices" title="Refresh market prices"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button><button className="icon-button notification" onClick={onNotify} type="button" aria-label="Stock notifications" title={notifications.join(' · ') || 'No stock moves yet'}><Bell size={18} />{notifications.length > 0 && <i />}</button><AccountControls onViewPortfolio={onViewPortfolio} /></div></header>;
}

function EmptyState({ icon, title, body, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{body}</p>{action && <button className="secondary-button" onClick={onAction} type="button">{action}</button>}</div>;
}

function Watchlist({ list, quoteMap, onSelect, onToggle, onSeeAll }) {
  return <section className="card watchlist-card"><div className="section-heading"><div><p className="eyebrow">Your signal board</p><h2>Watchlist</h2></div><button className="text-button" onClick={onSeeAll} type="button">View all <ChevronRight size={15} /></button></div>{list.length ? <div className="watchlist-list">{list.map((symbol) => { const quote = quoteMap[symbol] || fallbackQuote(symbol); const positive = quote.changePercent >= 0; return <div className="watch-row" key={symbol} role="button" tabIndex="0" onClick={() => onSelect(symbol)} onKeyDown={(event) => event.key === 'Enter' && onSelect(symbol)}><Logo symbol={symbol} /><span className="watch-name"><strong>{symbol}</strong><small>{stockBySymbol[symbol]?.name || 'US Equity'}</small></span><span className="watch-spark"><Sparkline positive={positive} />{quote.demo && <DemoBadge />}</span><span className="watch-price"><strong>{quote.price > 0 ? formatCurrency(quote.price) : 'Unavailable'}</strong><Trend value={formatPercent(quote.changePercent)} positive={positive} /></span><button className="watch-star" onClick={(event) => { event.stopPropagation(); onToggle(symbol); }} type="button" aria-label={`Remove ${symbol}`}><Star size={16} fill="currentColor" /></button></div>; })}</div> : <EmptyState icon={<Star size={20} />} title="Your watchlist is clear" body="Save stocks you want to keep an eye on." action="Explore popular stocks" onAction={onSeeAll} />}</section>;
}

function Screener({ quoteMap, onSelect, onToggle, watchlist }) {
  const [sector, setSector] = useState('All'); const [type, setType] = useState('All'); const [min, setMin] = useState(''); const [max, setMax] = useState(''); const [move, setMove] = useState('All');
  const preset = (name) => { if (name === 'gainers' || name === 'decliners') setMove(name === 'gainers' ? 'Gainers' : 'Decliners'); else if (name === 'etfs') setType('ETF'); else { setSector('All'); setType('All'); setMin(''); setMax(''); setMove('All'); } };
  const rows = STOCK_CATALOG.filter((stock) => { const quote = quoteMap[stock.symbol] || fallbackQuote(stock.symbol); const price = Number(quote.price) || 0; const change = Number(quote.changePercent) || 0; return (sector === 'All' || stock.sector === sector) && (type === 'All' || (type === 'ETF' ? stock.sector === 'ETFs' : stock.sector !== 'ETFs')) && (!min || price >= Number(min)) && (!max || price <= Number(max)) && (move === 'All' || (move === 'Gainers' ? change >= 0 : change < 0)); });
  return <div className="view-page screener-page"><div className="page-title"><div><p className="eyebrow">Local market catalog</p><h1>Screener</h1><p>Explore the demo universe with simple, educational filters.</p></div><span className="data-chip"><span className="source-dot demo" />Delayed / demo data</span></div><section className="card screener-panel"><div className="preset-row"><span className="filter-label">Presets</span>{[['gainers','Top gainers'],['decliners','Decliners'],['etfs','ETFs'],['all','All']].map(([id,label]) => <button className="preset-button" key={id} onClick={() => preset(id)} type="button">{label}</button>)}</div><div className="screener-filters"><label>Sector<select value={sector} onChange={(e) => setSector(e.target.value)}>{MARKET_SECTORS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Stock / ETF<select value={type} onChange={(e) => setType(e.target.value)}><option>All</option><option>Stock</option><option>ETF</option></select></label><label>Min price<input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder="$0" /></label><label>Max price<input type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder="No limit" /></label><label>Performance<select value={move} onChange={(e) => setMove(e.target.value)}><option>All</option><option>Gainers</option><option>Decliners</option></select></label></div></section><section className="card screener-results"><div className="section-heading"><div><p className="eyebrow">Matching assets</p><h2>{rows.length} results</h2></div><span className="count-pill">Catalog prices</span></div>{rows.length ? <div className="screener-table"><div className="screener-header"><span>Asset</span><span>Type</span><span>Sector</span><span>Price</span><span>Daily move</span><span /></div>{rows.map((stock) => { const quote = quoteMap[stock.symbol] || fallbackQuote(stock.symbol); return <button className="screener-row" key={stock.symbol} onClick={() => onSelect(stock.symbol)} type="button"><span className="asset-cell"><Logo symbol={stock.symbol} size="small" /><span><strong>{stock.symbol}</strong><small>{stock.name}</small></span></span><span>{stock.sector === 'ETFs' ? 'ETF' : 'Stock'}</span><span>{stock.sector}</span><span><strong>{formatCurrency(quote.price)}</strong></span><span><Trend value={formatPercent(quote.changePercent)} positive={quote.changePercent >= 0} /></span><span><Star size={15} fill={watchlist.includes(stock.symbol) ? 'currentColor' : 'none'} onClick={(e) => { e.stopPropagation(); onToggle(stock.symbol); }} /></span></button>; })}</div> : <EmptyState icon={<ScanSearch size={20} />} title="No matches" body="Try widening your price range or clearing a filter." action="Show all" onAction={() => preset('all')} />}</section></div>;
}

function Popular({ quoteMap, watchlist, onSelect, onToggle, onViewAll }) {
  const [sector, setSector] = useState('All');
  const [expanded, setExpanded] = useState(false);
  const filtered = filterCatalog('', sector);
  const visible = expanded ? filtered : filtered.slice(0, 6);
  return <section className="popular-section"><div className="section-heading"><div><p className="eyebrow">Market radar</p><h2>Popular stocks</h2></div><div className="catalog-controls"><label htmlFor="sector-filter">Sector</label><select id="sector-filter" value={sector} onChange={(event) => setSector(event.target.value)}>{MARKET_SECTORS.map((item) => <option key={item}>{item}</option>)}</select><span className="live-pill"><i /> Delayed data</span></div></div><div className="popular-grid">{visible.map((stock) => { const quote = quoteMap[stock.symbol] || fallbackQuote(stock.symbol); const positive = quote.changePercent >= 0; const watched = watchlist.includes(stock.symbol); return <div className="popular-card card-button" key={stock.symbol} role="button" tabIndex="0" onClick={() => onSelect(stock.symbol)} onKeyDown={(event) => event.key === 'Enter' && onSelect(stock.symbol)}><div className="popular-top"><Logo symbol={stock.symbol} /><span className="stock-id"><strong>{stock.symbol}</strong><small>{stock.name}</small></span><button className={`tiny-star ${watched ? 'watched' : ''}`} onClick={(event) => { event.stopPropagation(); onToggle(stock.symbol); }} type="button" aria-label="Toggle watchlist"><Star size={15} fill={watched ? 'currentColor' : 'none'} /></button></div><div className="popular-price"><strong>{quote.price > 0 ? formatCurrency(quote.price) : 'Unavailable'}</strong><Trend value={formatPercent(quote.changePercent)} positive={positive} /></div><div className="popular-chart"><Sparkline positive={positive} />{quote.demo && <DemoBadge />}</div></div>; })}</div><button className="catalog-expand" onClick={() => onViewAll ? onViewAll() : setExpanded((value) => !value)} type="button">View all {filtered.length} stocks <ChevronRight size={14} /></button></section>;
}

function MarketOverview() {
  return <section className="market-overview" style={{ padding: 18, borderRadius: 13 }}><div className="section-heading"><div><p className="eyebrow">The bigger picture</p><h2>Market overview</h2></div><span className="live-pill"><i /> Delayed data</span></div><div className="index-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>{indices.map(([symbol, name, value, change, positive]) => <div className="index-card" key={symbol} style={{ display: 'grid', gridTemplateColumns: 'minmax(48px, .45fr) minmax(90px, 1fr) minmax(78px, .8fr) minmax(48px, .7fr)', alignItems: 'center', gap: 9, padding: '9px 10px' }}><div className="index-top" style={{ marginBottom: 0 }}><span>{symbol}</span><BarChart3 size={14} /></div><span style={{ overflow: 'hidden', color: '#8994aa', fontSize: 10, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span><strong style={{ margin: 0, fontSize: 12 }}>{value}</strong><span style={{ display: 'flex', justifyContent: 'flex-end' }}><Trend value={change} positive={positive} /></span></div>)}</div></section>;
}

function PerformanceChart({ data, range, setRange }) {
  const reducedMotion = useReducedMotion();
  const visible = data.slice(range === '1M' ? -22 : range === '3M' ? -63 : 0);
  const chartLabel = visible.length ? `Portfolio value chart, ${visible.length} trading-day points, currently ${formatCurrency(visible[visible.length - 1].value)}` : 'No portfolio history available';
  return <div className="performance-chart"><div className="chart-toolbar"><div><p className="eyebrow">Portfolio performance</p><h3>Value over time</h3><span className="chart-note">Rebuilt from your trades and daily closes</span></div><div className="range-tabs">{['1M', '3M', 'All'].map((item) => <button className={range === item ? 'active' : ''} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}</div></div><div className="large-chart" role="img" aria-label={chartLabel}><ResponsiveContainer width="100%" height="100%"><AreaChart data={visible} margin={{ top: 10, right: 2, left: -18, bottom: 0 }} isAnimationActive={!reducedMotion}><defs><linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={.35} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#ffffff10" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#69758d', fontSize: 11 }} minTickGap={28} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#69758d', fontSize: 11 }} tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`} domain={['dataMin - 200', 'dataMax + 200']} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="value" stroke="#a78bfa" fill="url(#portfolioFill)" strokeWidth={2.5} dot={visible.length === 1 ? { r: 4 } : false} activeDot={{ r: 5, fill: '#c4b5fd', stroke: '#0b1020', strokeWidth: 3 }} isAnimationActive={!reducedMotion} /></AreaChart></ResponsiveContainer></div></div>;
}

function TradeModal({ symbol, quote, marketOpen, onClose, onSubmit }) {
  const [type, setType] = useState('buy');
  const [quantity, setQuantity] = useState('1');
  const shares = Number(quantity) || 0;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation"><div className="trade-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title"><div className="modal-head"><div><p className="eyebrow">Paper trade · no real money</p><h2 id="trade-title">Trade {symbol}</h2></div><button className="icon-button" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button></div><div className="trade-tabs"><button className={type === 'buy' ? 'active buy-tab' : ''} onClick={() => setType('buy')} type="button">Buy</button><button className={type === 'sell' ? 'active sell-tab' : ''} onClick={() => setType('sell')} type="button">Sell</button></div><label className="field-label" htmlFor="quantity">Shares</label><div className="quantity-input"><input id="quantity" type="number" min=".01" step=".01" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus /><span>shares</span></div><div className="order-summary"><div><span>{marketOpen ? 'Estimated price' : 'Last updated price'}</span><strong>{formatCurrency(quote.price)}</strong></div><div><span>Estimated trade value</span><strong>{formatCurrency(shares * quote.price)}</strong></div><div><span>Order type</span><strong>Market · simulated</strong></div></div><button className={`confirm-trade ${type}`} onClick={() => onSubmit(type, shares)} disabled={shares <= 0} type="button">Confirm {type} order <ChevronRight size={16} /></button><p className="modal-note">{marketOpen ? <><ShieldCheck size={14} /> Latest loaded price · educational use only</> : <><Clock3 size={14} /> Markets are closed, so this fills at the last updated price shown above.</>}</p></div></div>;
}

function AlertPanel({ symbol, quote, alerts, onCreate, onDelete }) {
  const [type, setType] = useState('above');
  const [threshold, setThreshold] = useState('');
  const submit = () => { const value = Number(threshold); if (Number.isFinite(value) && value >= 0) { onCreate({ symbol, type, threshold: value }); setThreshold(''); } };
  return <section className="card alert-panel"><div className="section-heading"><div><p className="eyebrow">Local price alerts</p><h2><Bell size={15} /> Alert {symbol}</h2></div><span className="count-pill">{alerts.length} active</span></div><div className="alert-form"><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Alert condition"><option value="above">Price above</option><option value="below">Price below</option><option value="percent">Move by percent</option></select><input type="number" min="0" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder={type === 'percent' ? 'e.g. 5' : 'Target price'} aria-label="Alert threshold" /><button className="secondary-button" onClick={submit} disabled={!threshold} type="button">Add alert</button></div>{alerts.length ? <div className="alert-list">{alerts.map((alert) => <div className="alert-row" key={alert.id}><span>{alert.type === 'percent' ? `Move ±${alert.threshold}%` : `${alert.type === 'above' ? 'Above' : 'Below'} ${formatCurrency(alert.threshold)}`}</span><button className="text-button" onClick={() => onDelete(alert.id)} type="button">Delete</button></div>)}</div> : <p className="alert-empty">Alerts are stored in this browser and checked whenever a quote loads.</p>}</section>;
}

function Detail({ symbol, data, watchlist, onToggle, onBack, onTrade, marketOpen = true, alerts = [], onCreateAlert, onDeleteAlert }) {
  const [range, setRange] = useState('1M');
  const [tradeOpen, setTradeOpen] = useState(false);
  const currentData = data.symbol === symbol ? data : { symbol, quote: null, history: [], overview: null, loading: true, source: 'loading', historyDemo: false };
  const quote = currentData.quote;
  const positive = (quote?.changePercent || 0) >= 0;
  const info = currentData.overview || { Sector: stockBySymbol[symbol]?.sector || 'Market', Industry: 'Common stock', Description: 'A demo overview is shown until live company information is available.' };
  const history = currentData.history.slice(range === '1M' ? -22 : range === '3M' ? -63 : 0);
  const canTrade = Boolean(!currentData.loading && quote?.price > 0 && !quote.unavailable && onTrade);
  return <div className="detail-page"><div className="detail-header"><button className="back-button" onClick={onBack} type="button">← Back to overview</button><span className="data-chip"><span className={`source-dot ${currentData.source === 'demo' ? 'demo' : ''}`} />{currentData.loading ? 'Loading data' : currentData.source === 'demo' ? 'Demo data' : 'Alpha Vantage'}{!currentData.loading && ` · ${formatTime()}`}</span></div><div className="detail-identity"><div className="detail-title"><Logo symbol={symbol} size="large" /><div><div className="title-line"><h1>{info.Name || stockBySymbol[symbol]?.name || `${symbol} Holdings`}</h1><span className="ticker-tag">{symbol}</span></div><p>{info.Exchange || 'US Equity'} · {info.Sector || stockBySymbol[symbol]?.sector || 'Market'}</p></div></div><div className="detail-actions"><button className={`watch-button ${watchlist.includes(symbol) ? 'active' : ''}`} onClick={() => onToggle(symbol)} type="button"><Star size={17} fill={watchlist.includes(symbol) ? 'currentColor' : 'none'} />{watchlist.includes(symbol) ? 'Watching' : 'Add to watchlist'}</button><button className="buy-button" onClick={() => canTrade && setTradeOpen(true)} disabled={!canTrade} type="button"><Plus size={17} /> {currentData.loading ? 'Loading quote' : canTrade ? 'Trade' : 'Unavailable'}</button></div></div><div className="detail-quote"><div><p className="eyebrow">Latest available price</p><strong>{currentData.loading ? <span className="skeleton inline-skeleton" /> : quote?.price > 0 ? formatCurrency(quote.price) : 'Unavailable'}</strong>{!currentData.loading && quote?.unavailable && <span className="unavailable-note">Current quote unavailable; no trade enabled.</span>}<div className="quote-change">{quote && <><Trend value={formatCurrency(Math.abs(quote.change))} positive={positive} /><Trend value={formatPercent(quote.changePercent)} positive={positive} /></>}</div></div><div className="quote-meta"><span>Last trading day<strong>{quote?.latestTradingDay || 'Unavailable'}</strong></span><span>Volume<strong>{quote?.volume ? new Intl.NumberFormat('en-US', { notation: 'compact' }).format(quote.volume) : 'Unavailable'}</strong></span><span>Previous close<strong>{quote?.previousClose ? formatCurrency(quote.previousClose) : 'Unavailable'}</strong></span></div></div><div className="detail-chart-card card"><div className="chart-toolbar"><div><p className="eyebrow">Price history {currentData.historyDemo && <DemoBadge />}</p><h3>{symbol} performance</h3></div><div className="range-tabs">{['1M', '3M', 'All'].map((item) => <button className={range === item ? 'active' : ''} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}</div></div>{currentData.loading ? <div className="chart-loading"><span className="skeleton" />Loading price history…</div> : <div className="detail-chart" role="img" aria-label={`${symbol} price history chart with ${history.length} trading-day points`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 14, right: 5, left: -20, bottom: 0 }}><defs><linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={.27} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#ffffff0d" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#69758d', fontSize: 10 }} minTickGap={35} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#69758d', fontSize: 10 }} tickFormatter={(value) => `$${value}`} domain={['dataMin - 5', 'dataMax + 5']} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="price" stroke="#41d9e8" fill="url(#detailFill)" strokeWidth={2.5} dot={history.length === 1 ? { r: 4 } : false} activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div>}</div><div className="detail-bottom"><section className="card company-card"><div className="section-heading"><div><p className="eyebrow">About {symbol}</p><h2>Company snapshot</h2></div><span className="data-chip">{currentData.overview ? 'Loaded' : 'Demo data'}</span></div><p>{info.Description || 'Company information is not available from the current data source.'}</p><div className="company-stats"><span><small>Sector</small><strong>{info.Sector || 'Market'}</strong></span><span><small>Industry</small><strong>{info.Industry || 'Common stock'}</strong></span><span><small>Exchange</small><strong>{info.Exchange || 'US Equity'}</strong></span></div></section></div>{tradeOpen && <TradeModal symbol={symbol} quote={quote} marketOpen={marketOpen} onClose={() => setTradeOpen(false)} onSubmit={(type, shares) => { onTrade(type, shares); setTradeOpen(false); }} />}</div>;
}

function Portfolio({ holdings, quoteMap, cash, onSelect }) {
  const positions = Object.entries(holdings).map(([symbol, item]) => {
    const quote = quoteMap[symbol];
    const liveQuote = quote?.price > 0 && !quote.demo && !quote.unavailable;
    const value = (liveQuote ? quote.price : item.averagePrice) * item.shares;
    const pnl = liveQuote ? (quote.price - item.averagePrice) * item.shares : 0;
    return { symbol, ...item, quote, value, pnl, liveQuote, pnlPercent: liveQuote && item.averagePrice ? (quote.price - item.averagePrice) / item.averagePrice * 100 : 0 };
  });
  const invested = positions.reduce((sum, item) => sum + item.value, 0);
  const total = cash + invested;
  return <div className="view-page"><div className="page-title"><div><p className="eyebrow">Your practice account</p><h1>Portfolio</h1><p>Track your simulated positions and learn by doing.</p></div><span className="paper-pill"><CircleDollarSign size={15} /> Actual account totals</span></div><div className="portfolio-stats"><Metric label="Portfolio value" value={formatCurrency(total)} footnote="Positions at loaded prices or cost basis" icon={<BriefcaseBusiness size={17} />} /><Metric label="Cash balance" value={formatCurrency(cash)} footnote="Available to trade" tone="cyan" icon={<CircleDollarSign size={17} />} /><Metric label="Unrealized P/L" value={formatCurrency(positions.reduce((sum, item) => sum + item.pnl, 0))} footnote="Loaded quotes only" tone="green" icon={<Activity size={17} />} /></div><div className="portfolio-layout"><section className="card positions-card"><div className="section-heading"><div><p className="eyebrow">Open positions</p><h2>Holdings</h2></div><span className="count-pill">{positions.length} positions</span></div>{positions.length ? <div className="positions-table"><div className="table-header"><span>Asset</span><span>Shares</span><span>Avg. price</span><span>Current</span><span>Value</span><span>P/L</span></div>{positions.map((item) => <button className="position-row" key={item.symbol} onClick={() => onSelect(item.symbol)} type="button"><span className="asset-cell"><Logo symbol={item.symbol} size="small" /><strong>{item.symbol}</strong></span><span>{item.shares.toFixed(2)}</span><span>{formatCurrency(item.averagePrice)}</span><span>{item.liveQuote ? formatCurrency(item.quote.price) : 'Unavailable'}</span><span><strong>{formatCurrency(item.value)}</strong></span><span>{item.liveQuote ? <Trend value={`${formatCurrency(item.pnl)} (${formatPercent(item.pnlPercent)})`} positive={item.pnl >= 0} /> : <span className="muted-status">Load quote</span>}</span></button>)}</div> : <EmptyState icon={<BriefcaseBusiness size={21} />} title="Your portfolio is ready" body="Open a stock and place your first paper trade to see it here." action="Browse popular stocks" onAction={() => onSelect('AAPL')} />}</section><AllocationPanel eyebrow="Position mix" title="Allocation" holdings={holdings} quotes={quoteMap} cash={cash} onPick={onSelect} /></div></div>;
}

function ActivityView({ transactions, onSelect }) {
  return <div className="view-page"><div className="page-title"><div><p className="eyebrow">A clear paper trail</p><h1>Activity</h1><p>Every simulated order, timestamped and easy to review.</p></div><span className="data-chip"><span className="source-dot demo" />Local activity</span></div><section className="card activity-card">{transactions.length ? <div className="activity-table"><div className="table-header"><span>Type</span><span>Asset</span><span>Shares</span><span>Execution price</span><span>Trade value</span><span>Date</span></div>{transactions.map((item) => <button className="activity-row" key={item.id} onClick={() => onSelect(item.symbol)} type="button"><span><span className={`activity-type ${item.type}`}>{item.type === 'buy' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{item.type}</span></span><span className="asset-cell"><Logo symbol={item.symbol} size="small" /><strong>{item.symbol}</strong></span><span>{item.shares.toFixed(2)}</span><span>{formatCurrency(item.price)}</span><span><strong>{formatCurrency(item.total)}</strong></span><span className="date-cell">{formatDateTime(item.createdAt)}</span></button>)}</div> : <EmptyState icon={<Clock3 size={21} />} title="No activity yet" body="Your buy and sell confirmations will appear here." action="Start exploring" onAction={() => onSelect('AAPL')} />}</section></div>;
}

function getMarketStatus(now = new Date(), override = null) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const weekday = !['Sat', 'Sun'].includes(values.weekday);
  const open = weekday && minutes >= 570 && minutes < 960;
  if (override === true) return { open: true, label: 'Markets open', detail: 'Admin override · Paper session' };
  if (override === false) return { open: false, label: 'Markets closed', detail: 'Admin override · Paper session' };
  return open ? { open: true, label: 'Markets open', detail: 'NYSE · Closes 4:00 PM ET' } : { open: false, label: 'Markets closed', detail: 'NYSE · Weekday session' };
}

function Workspace({ account, store }) {
  const [route] = useState(readRoute);
  const [view, setView] = useState(route.view);
  const [selected, setSelected] = useState(route.symbol);
  const replaceHash = useRef(!window.location.hash);
  const [authGate, setAuthGate] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [watchlist, setWatchlist] = useState(() => store.getWatchlist());
  const [cash, setCash] = useState(() => store.getCash());
  const [holdings, setHoldings] = useState(() => store.getHoldings());
  const [transactions, setTransactions] = useState(() => store.getTransactions());
  const [alerts, setAlerts] = useState(() => store.getAlerts());
  const [recent, setRecent] = useState(() => store.getRecent());
  const [quotes, setQuotes] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [range, setRange] = useState('1M');
  const [marketOverride, setMarketOverride] = useState(() => readMarketOverride());
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [historySeries, setHistorySeries] = useState({});
  const detail = useStock(selected, refreshKey);

  useEffect(() => {
    const onCatalogChange = () => {
      refreshMarketCatalog();
      setCatalogVersion((value) => value + 1);
    };
    const onMarketChange = () => setMarketOverride(readMarketOverride());
    window.addEventListener('stockmark:catalog-changed', onCatalogChange);
    window.addEventListener('stockmark:market-changed', onMarketChange);
    return () => {
      window.removeEventListener('stockmark:catalog-changed', onCatalogChange);
      window.removeEventListener('stockmark:market-changed', onMarketChange);
    };
  }, []);

  useEffect(() => {
    const next = routeToHash({ view, symbol: selected });
    if (window.location.hash === next) { replaceHash.current = false; return; }
    if (replaceHash.current) {
      replaceHash.current = false;
      window.history.replaceState(null, '', next);
    } else {
      window.location.hash = next;
    }
  }, [view, selected]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      setView(next.view);
      setSelected(next.symbol);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let live = true;
    const symbols = [...new Set([...STOCK_CATALOG.map((stock) => stock.symbol), ...watchlist, ...(view === 'portfolio' ? Object.keys(holdings) : [])])].filter(Boolean);
    if (!symbols.length) { setLoading(false); return () => { live = false; }; }
    setLoading(true);
    Promise.all(symbols.map(async (symbol) => {
      const cached = refreshKey === 0 ? getCachedMarket('quote', symbol) : null;
      const quote = cached || setCachedMarket('quote', symbol, normalizeQuote(await requestMarket('quote', symbol), symbol));
      return [symbol, quote];
    })).then((entries) => { if (live) { setQuotes((current) => ({ ...current, ...Object.fromEntries(entries) })); setLoading(false); } });
    return () => { live = false; };
  }, [watchlist.join(','), Object.keys(holdings).join(','), view, refreshKey]);

  // Daily closes for everything the account has ever held, which is what turns
  // the value-over-time chart into a reconstruction rather than a straight line.
  const chartSymbols = useMemo(
    () => [...new Set([...Object.keys(holdings), ...transactions.map((item) => item.symbol)])].filter(Boolean).sort().join(','),
    [holdings, transactions],
  );

  useEffect(() => {
    const symbols = chartSymbols ? chartSymbols.split(',') : [];
    if (!symbols.length) { setHistorySeries({}); return () => {}; }
    let live = true;
    Promise.all(symbols.map(async (symbol) => {
      const cached = refreshKey === 0 ? getCachedMarket('history', symbol) : null;
      const history = cached || setCachedMarket('history', symbol, normalizeHistory(await requestMarket('history', symbol), symbol));
      return [symbol, history];
    })).then((entries) => { if (live) setHistorySeries(Object.fromEntries(entries)); });
    return () => { live = false; };
  }, [chartSymbols, refreshKey]);

  useEffect(() => { store.saveWatchlist(watchlist); }, [store, watchlist]);
  useEffect(() => { store.saveCash(cash); }, [store, cash]);
  useEffect(() => { store.saveHoldings(holdings); }, [store, holdings]);
  useEffect(() => { store.saveTransactions(transactions); }, [store, transactions]);
  useEffect(() => { store.saveAlerts(alerts); }, [store, alerts]);
  useEffect(() => {
    const matches = alerts.filter((alert) => evaluateAlert(alert, quoteMap[alert.symbol]));
    if (matches.length) showToast(`Alert reached: ${matches.map((alert) => alert.symbol).join(', ')}`, 'neutral');
  }, [Object.values(quotes).map((quote) => `${quote.symbol}:${quote.price}`).join('|')]);
  useEffect(() => { const timer = toast && setTimeout(() => setToast(null), 4200); return () => clearTimeout(timer); }, [toast]);

  const showToast = (message, tone = 'success') => setToast({ message, tone });
  const navigate = (nextView) => {
    if (nextView === 'admin' && !account?.isAdmin) {
      showToast('Admin access is available only to the demo admin profile.', 'error');
      return;
    }
    setSelected(null);
    setView(nextView);
  };
  const openStock = (raw) => {
    const symbol = String(raw || '').trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol)) return showToast('Enter a valid US ticker symbol.', 'error');
    setSelected(symbol);
    setRecent((current) => { const next = [symbol, ...current.filter((item) => item !== symbol)].slice(0, 5); store.saveRecent(next); return next; });
  };
  const toggleWatchlist = (symbol) => setWatchlist((current) => { const exists = current.includes(symbol); showToast(exists ? `${symbol} removed from watchlist` : `${symbol} added to watchlist`, exists ? 'neutral' : 'success'); return exists ? current.filter((item) => item !== symbol) : [symbol, ...current]; });
  const executeTrade = (type, shares) => {
    if (!account) { setAuthGate('login'); showToast('Log in to use paper trading. New accounts start with $10,000 in paper cash.', 'error'); return; }
    const symbol = selected;
    const quote = detail.quote;
    const marketOpen = getMarketStatus(new Date(), marketOverride).open;
    if (!symbol || !quote?.price || quote.unavailable || detail.loading) return showToast('Wait for a current positive quote before trading.', 'error');
    const total = shares * quote.price;
    const existing = holdings[symbol] || { shares: 0, averagePrice: 0 };
    if (!Number.isFinite(shares) || shares <= 0) return showToast('Enter a quantity greater than zero.', 'error');
    if (type === 'buy' && total > cash + .001) return showToast(`Insufficient cash. You need ${formatCurrency(total - cash)} more.`, 'error');
    if (type === 'sell' && shares > existing.shares + .001) return showToast(`You only own ${existing.shares.toFixed(2)} shares of ${symbol}.`, 'error');
    const next = { ...holdings }; let nextCash = cash;
    if (type === 'buy') { const nextShares = existing.shares + shares; next[symbol] = { shares: nextShares, averagePrice: (existing.shares * existing.averagePrice + total) / nextShares }; nextCash -= total; } else { const nextShares = existing.shares - shares; nextCash += total; if (nextShares <= .001) delete next[symbol]; else next[symbol] = { ...existing, shares: nextShares }; }
    setHoldings(next); setCash(nextCash); setTransactions((current) => [{ id: `${Date.now()}-${symbol}`, symbol, type, shares, price: quote.price, total, createdAt: new Date().toISOString() }, ...current]); showToast(`${type === 'buy' ? 'Bought' : 'Sold'} ${shares.toFixed(2)} ${symbol} · ${formatCurrency(total)}${marketOpen ? '' : ' · at the last updated price'}`);
  };

  const quoteMap = { ...quotes };
  void catalogVersion;
  if (selected && detail.symbol === selected && detail.quote) quoteMap[selected] = detail.quote;
  const createAlert = (alert) => setAlerts((current) => [...current, store.createAlert(alert)]);
  const deleteAlert = (id) => { store.deleteAlert(id); setAlerts((current) => current.filter((alert) => alert.id !== id)); };
  const portfolioPositions = Object.entries(holdings).map(([symbol, item]) => {
    const quote = quoteMap[symbol];
    const live = quote?.price > 0 && !quote.demo && !quote.unavailable;
    return { item, quote, live, value: (live ? quote.price : item.averagePrice) * item.shares, pnl: live ? (quote.price - item.averagePrice) * item.shares : 0 };
  });
  const portfolioValue = cash + portfolioPositions.reduce((sum, position) => sum + position.value, 0);
  const totalPnl = portfolioPositions.reduce((sum, position) => sum + position.pnl, 0);
  const dailyMove = portfolioPositions.reduce((sum, position) => sum + (position.live ? position.quote.change * position.item.shares : 0), 0);
  const chartData = useMemo(
    () => buildPortfolioHistory({
      holdings, transactions, cash, series: historySeries, since: account?.createdAt, current: portfolioValue,
    }),
    [holdings, transactions, cash, historySeries, account?.createdAt, portfolioValue],
  );

  let page;
  if (selected) page = <><AlertPanel symbol={selected} quote={detail.quote} alerts={alerts.filter((alert) => alert.symbol === selected)} onCreate={createAlert} onDelete={deleteAlert} /><Detail key={`${selected}-${refreshKey}`} symbol={selected} data={detail} marketOpen={getMarketStatus(new Date(), marketOverride).open} watchlist={watchlist} alerts={alerts.filter((alert) => alert.symbol === selected)} onCreateAlert={createAlert} onDeleteAlert={deleteAlert} onToggle={toggleWatchlist} onBack={() => setSelected(null)} onTrade={executeTrade} /></>;
  else if (view === 'portfolio') page = <Portfolio holdings={holdings} quoteMap={quoteMap} cash={cash} onSelect={openStock} />;
  else if (view === 'activity') page = <ActivityView transactions={transactions} onSelect={openStock} />;
   else if (view === 'screener') page = <Screener quoteMap={quoteMap} onSelect={openStock} onToggle={toggleWatchlist} watchlist={watchlist} />;
   else if (view === 'admin' && account?.isAdmin) page = <AdminBoard onMarketChange={setMarketOverride} />;
   else if (view === 'news') page = <NewsView onBack={() => navigate('overview')} />;
   else if (view === 'budget') page = <BudgetPlanner store={store} onOpenExpenses={() => navigate('expenses')} />;
   else if (view === 'expenses') page = <ExpenseAnalyzer />;
  else if (view === 'watchlist') page = <div className="view-page"><div className="page-title"><div><p className="eyebrow">Keep your edge</p><h1>Watchlist</h1><p>Everything you are tracking, in one focused view.</p></div><span className="count-pill">{watchlist.length} saved</span></div><Watchlist list={watchlist} quoteMap={quoteMap} onSelect={openStock} onToggle={toggleWatchlist} onSeeAll={() => navigate('overview')} /></div>;
   else page = <Dashboard accountName={account?.name || account?.displayName || 'Explorer'} portfolioValue={portfolioValue} cash={cash} holdings={holdings} pnl={totalPnl} dailyMove={dailyMove} quotes={quoteMap} watchlist={watchlist} recent={recent} loading={loading} history={chartData} range={range} setRange={setRange} marketOverride={marketOverride} onSelect={openStock} onToggle={toggleWatchlist} onPortfolio={() => navigate('portfolio')} onWatchlist={() => navigate('watchlist')} onNews={() => navigate('news')} onBudget={() => navigate('budget')} />;

  const notifications = Object.entries(quoteMap).filter(([, quote]) => quote?.price > 0 && Math.abs(quote.changePercent || 0) >= 1).slice(0, 4).map(([symbol, quote]) => `${symbol} ${formatPercent(quote.changePercent)}`);
  return <div className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><Sidebar view={view} onNavigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} isAdmin={account?.isAdmin} marketOverride={marketOverride} /><main className="main-content"><Header recent={recent} onSearch={openStock} onRefresh={() => setRefreshKey((value) => value + 1)} loading={loading} setMobileOpen={setMobileOpen} notifications={notifications} onNotify={() => showToast(notifications.length ? `Stock moves: ${notifications.join(' · ')}` : 'No significant stock moves yet.', 'neutral')} />{page}{toast && <div className={`toast ${toast.tone}`} role="status"><span className="toast-mark">{toast.tone === 'error' ? '!' : '✓'}</span>{toast.message}<button onClick={() => setToast(null)} type="button" aria-label="Dismiss"><X size={14} /></button></div>}<footer className="app-footer"><span><ShieldCheck size={14} /> Data may be delayed. This app is for educational purposes only and does not provide financial advice.</span><span>Market data · {loading ? 'Refreshing' : 'Cached'} <button onClick={() => setRefreshKey((value) => value + 1)} type="button">Refresh</button></span></footer></main>{authGate && <AuthDialog mode={authGate} onClose={(nextMode) => setAuthGate(nextMode || null)} />}</div>;
}

function LegacyDashboard({ accountName, portfolioValue, cash, pnl, dailyMove, quotes, watchlist, recent, loading, history, range, setRange, marketOverride, onSelect, onToggle, onPortfolio, onWatchlist, onScreener }) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false }).format(now));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  const market = getMarketStatus(now, marketOverride);
  return <div className="dashboard-page"><div className="welcome-row"><div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, <span>{accountName}</span></h1><p className="subhead">A calmer way to understand the market.</p></div><div className={`market-open-badge ${market.open ? '' : 'closed'}`}><i /> {market.label} <span>·</span> Updated {formatTime(now)}</div></div><div className="metrics-grid"><Metric label="Portfolio value" value={formatCurrency(portfolioValue)} footnote="Cash + positions at cost basis when needed" icon={<BriefcaseBusiness size={17} />} onClick={onPortfolio} /><Metric label="Available cash" value={formatCurrency(cash)} footnote="Ready to deploy" tone="cyan" icon={<CircleDollarSign size={17} />} onClick={onPortfolio} /><Metric label="Total profit / loss" value={formatCurrency(pnl)} footnote="Loaded quotes only" tone="green" icon={<Activity size={17} />} trend={pnl ? { value: formatPercent(portfolioValue ? pnl / (portfolioValue - pnl) * 100 : 0), positive: pnl >= 0 } : undefined} /><Metric label="Today's move" value={formatCurrency(dailyMove)} footnote="Loaded positions only" tone="orange" icon={<Activity size={17} />} trend={dailyMove ? { value: formatPercent(portfolioValue ? dailyMove / portfolioValue * 100 : 0), positive: dailyMove >= 0 } : undefined} /></div><div className="dashboard-grid"><div className="primary-column"><section className="card chart-card"><PerformanceChart data={history} range={range} setRange={setRange} /></section><Popular quoteMap={quotes} watchlist={watchlist} onSelect={onSelect} onToggle={onToggle} /></div><div className="secondary-column"><Watchlist list={watchlist} quoteMap={quotes} onSelect={onSelect} onToggle={onToggle} onSeeAll={onWatchlist} /><MarketOverview /></div></div><div className="recent-strip"><div className="section-heading"><div><p className="eyebrow">Pick up where you left off</p><h2>Recently viewed</h2></div></div><div className="recent-cards">{(recent.length ? recent : ['AAPL', 'NVDA']).slice(0, 4).map((symbol) => { const quote = quotes[symbol] || fallbackQuote(symbol); return <button className="recent-card" key={symbol} onClick={() => onSelect(symbol)} type="button"><Logo symbol={symbol} size="small" /><span><strong>{symbol}</strong><small>{stockBySymbol[symbol]?.name || 'US Equity'}</small></span><span className="recent-price">{quote.price > 0 ? formatCurrency(quote.price) : 'Unavailable'}{quote.demo && <DemoBadge />}</span></button>; })}</div></div></div>;
}

const LOCAL_NEWS = [
  { title: 'U.S. stocks move as investors digest fresh economic data', category: 'Market brief', age: 'Today', colors: ['#7558df', '#2a315d'], image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3' },
  { title: 'Technology shares lead the session while yields remain in focus', category: 'Market brief', age: 'Today', colors: ['#1d8d93', '#142943'], image: 'https://images.unsplash.com/photo-1559526324-593bc073d938' },
  { title: 'What a daily price change really tells a paper investor', category: 'Investing basics', age: '5 min read', colors: ['#c47751', '#312442'], image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f' },
  { title: 'Diversification can help reduce concentration risk', category: 'Portfolio lessons', age: '7 min read', colors: ['#855ec9', '#263857'], image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72' },
  { title: 'How earnings reports can move a stock price', category: 'Market basics', age: '6 min read', colors: ['#2563eb', '#12345a'], image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df' },
  { title: 'The difference between price and value', category: 'Investing basics', age: '9 min read', colors: ['#0f766e', '#123a42'], image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e' },
  { title: 'Building a watchlist you can actually use', category: 'Practical guide', age: '5 min read', colors: ['#9333ea', '#2d1b4e'], image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71' },
  { title: 'Why patience matters in long-term investing', category: 'Investor mindset', age: '6 min read', colors: ['#b45309', '#3c2814'], image: 'https://images.unsplash.com/photo-1500534623283-312aade485b7' },
];

/* Unsplash serves whatever pixel size is asked for, so the old w=220 links were
   being stretched across ~1200px surfaces. Each call site passes its own box. */
const newsImage = (base, width, height) => (base ? `${base}?auto=format&fit=crop&w=${width}&h=${height}&q=85` : '');

function HeroBand({ onDetails }) {
  return <section className="hero-band" style={{ position: 'relative', minHeight: 156, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, overflow: 'hidden', margin: '0 0 18px', padding: '24px 28px', border: '1px solid #8b5cf633', borderRadius: 16, background: 'linear-gradient(105deg, rgba(35, 27, 76, .9), rgba(13, 19, 37, .88) 58%, rgba(16, 38, 52, .75))', boxShadow: '0 20px 55px rgba(38, 24, 89, .18)' }}>
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
      <p className="eyebrow" style={{ color: '#b9aaff', marginBottom: 8 }}>Market pulse · educational view</p>
       <h2 style={{ margin: '0 0 8px', color: '#f4f1ff', fontSize: 22, letterSpacing: '-.7px' }}>Want to calculate your budget?</h2>
       <p style={{ margin: 0, color: '#b8b4ce', fontSize: 12, lineHeight: 1.55 }}>Plan your monthly spending, saving, and investing goals before making a move in the market.</p>
       <button className="text-button" onClick={onDetails} type="button" style={{ marginTop: 15, padding: 0, fontSize: 11 }}>Open budget planner <ChevronRight size={15} /></button>
    </div>
    <div className="hero-wave" aria-hidden="true" style={{ position: 'absolute', inset: '0 0 0 37%', opacity: .9, pointerEvents: 'none' }}>
      <svg viewBox="0 0 620 180" preserveAspectRatio="none" width="100%" height="100%">
        <defs><linearGradient id="heroWaveFill" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#a78bfa" stopOpacity=".3" /><stop offset="1" stopColor="#7c3aed" stopOpacity="0" /></linearGradient></defs>
        <path d="M0 128 C70 116 75 55 151 72 S244 143 316 101 S407 32 476 65 S548 126 620 36 L620 180 L0 180 Z" fill="url(#heroWaveFill)" />
        <path d="M0 128 C70 116 75 55 151 72 S244 143 316 101 S407 32 476 65 S548 126 620 36" fill="none" stroke="#b9a7ff" strokeOpacity=".85" strokeWidth="2.5" />
        <circle cx="476" cy="65" r="4" fill="#e4ddff" /><circle cx="476" cy="65" r="11" fill="none" stroke="#c4b5fd" strokeOpacity=".25" />
      </svg>
      <span className="hero-orb" style={{ position: 'absolute', top: 16, right: 46, width: 74, height: 74, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, rgba(196,181,253,.45), rgba(124,58,237,.04) 68%)', filter: 'blur(.2px)' }} />
    </div>
  </section>;
}

function RecentNews({ onViewAll }) {
  const [expanded, setExpanded] = useState(false);
  const thumb = expanded ? [240, 150] : [112, 90];
  const stories = expanded ? [...LOCAL_NEWS, { title: 'How to compare companies without chasing headlines', category: 'Research basics', age: '8 min read', colors: ['#2563eb', '#12345a'], image: 'https://images.unsplash.com/photo-1559526324-593bc073d938' }, { title: 'Why markets can rise and fall in the same week', category: 'Market basics', age: '6 min read', colors: ['#0f766e', '#123a42'], image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3' }] : LOCAL_NEWS;
  return <section className="news-card">
    <div className="section-heading" style={{ marginBottom: 14 }}>
       <div><p className="eyebrow">Learn as you go</p><h2>{expanded ? 'All news' : 'Recent news'}</h2></div>
       <button className="text-button" onClick={() => onViewAll ? onViewAll() : setExpanded((value) => !value)} type="button">{expanded ? 'Show less' : 'View all'} <ChevronRight size={15} /></button>
    </div>
    <p style={{ margin: '-5px 0 13px', color: '#69758d', fontSize: 10 }}>Local educational content · no external news feed</p>
    <div className="news-list">
       {stories.map((story) => <article className="news-item" key={story.title}>
         <div className="news-thumbnail" aria-hidden="true" style={{ width: expanded ? 112 : 54, height: expanded ? 68 : 43, flex: `0 0 ${expanded ? 112 : 54}px`, borderRadius: 8, backgroundImage: story.image ? `url(${newsImage(story.image, thumb[0], thumb[1])}), linear-gradient(135deg, ${story.colors[0]}, ${story.colors[1]})` : `linear-gradient(135deg, ${story.colors[0]}, ${story.colors[1]})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', width: 46, height: 16, left: 7, bottom: 5, borderTop: '1px solid #ffffffaa', transform: 'skewY(-17deg)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <strong>{story.title}</strong>
          <small>{story.category} · {story.age}</small>
        </div>
      </article>)}
    </div>
  </section>;
}

function NewsView({ onBack }) {
  const [selectedStory, setSelectedStory] = useState(null);
  if (selectedStory) return <div className="view-page news-article"><button className="text-button" onClick={() => setSelectedStory(null)} type="button">← Back to all news</button><div className="article-hero" style={{ backgroundImage: `url(${newsImage(selectedStory.image, 1800, 520)}), linear-gradient(135deg, ${selectedStory.colors[0]}, ${selectedStory.colors[1]})` }} /><span className="eyebrow">{selectedStory.category} · {selectedStory.age}</span><h1>{selectedStory.title}</h1><p className="article-lead">A practical explanation of the ideas behind this market topic, written for people learning with a paper portfolio.</p><div className="article-body"><p>Markets are constantly processing new information. Prices can change when investors update their expectations about company earnings, interest rates, demand, or the wider economy.</p><p>The useful habit is to separate the headline from the underlying information. Look at what changed, why it changed, and whether the move affects the long-term opportunity or only the short-term mood.</p><p>For a practice account, focus on documenting your reasoning before placing a simulated order. That makes it easier to review what you learned later rather than reacting only to a green or red number.</p></div></div>;
  return <div className="view-page news-page"><div className="page-title"><div><p className="eyebrow">Learn as you go</p><h1>Market news</h1><p>Educational market stories and investing explainers.</p></div><button className="text-button" onClick={onBack} type="button">Back to overview <ChevronRight size={15} /></button></div><div className="news-grid">{LOCAL_NEWS.map((story) => <article className="news-feature" key={story.title}><div className="news-feature-image" style={{ backgroundImage: `url(${newsImage(story.image, 1240, 306)}), linear-gradient(135deg, ${story.colors[0]}, ${story.colors[1]})` }} /><div className="news-feature-copy"><span>{story.category} · {story.age}</span><h2>{story.title}</h2><p>Understand the market context, the key terms, and what this movement can mean for a practice portfolio.</p><button className="text-button" onClick={() => setSelectedStory(story)} type="button">Read story <ChevronRight size={15} /></button></div></article>)}</div></div>;
}

const CASH_COLOR = '#41d9e8';
const shareOf = (value, total) => (total > 0 ? (value / total) * 100 : 0);
const formatShare = (value) => `${value >= 99.95 ? 100 : Number(value.toFixed(1))}%`;

function buildAllocation(holdings, quotes, cash) {
  const positions = Object.entries(holdings || {}).map(([symbol, item]) => {
    const quote = quotes?.[symbol];
    const liveQuote = quote?.price > 0 && !quote.demo && !quote.unavailable;
    const info = stockBySymbol[symbol];
    return {
      name: symbol,
      label: info?.name || 'US Equity',
      sector: info?.sector || 'Other holdings',
      color: info?.color || '#8b5cf6',
      value: (liveQuote ? quote.price : item.averagePrice) * item.shares,
    };
  }).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  const invested = positions.reduce((sum, item) => sum + item.value, 0);
  const available = Math.max(0, cash || 0);
  const total = invested + available;
  const cashSlice = { name: 'Cash', label: 'Ready to deploy', color: CASH_COLOR, value: available };

  const grouped = new Map();
  positions.forEach((item) => {
    const current = grouped.get(item.sector);
    if (current) { current.value += item.value; current.count += 1; }
    else grouped.set(item.sector, { name: item.sector, label: '', color: item.color, value: item.value, count: 1 });
  });
  const sectors = [...grouped.values()].map((item) => ({ ...item, label: `${item.count} position${item.count === 1 ? '' : 's'}` }));

  return {
    positions,
    invested,
    available,
    total,
    sectorCount: grouped.size,
    slices: {
      holdings: [...positions, ...(available > 0 ? [cashSlice] : [])],
      sectors: [...sectors.sort((a, b) => b.value - a.value), ...(available > 0 ? [cashSlice] : [])],
    },
  };
}

function buildAllocationNotes(model) {
  const notes = [];
  if (!model.total) return notes;
  const cashShare = shareOf(model.available, model.total);
  if (!model.positions.length) {
    return [{ tone: 'tip', text: `Your ${formatCurrency(model.total)} is all still in cash — nothing is allocated yet.` }];
  }

  const largest = model.positions[0];
  const largestShare = shareOf(largest.value, model.total);
  if (largestShare >= 25) {
    notes.push({ tone: 'watch', text: `${largest.name} is ${formatShare(largestShare)} of the account. Past roughly 15% one holding starts deciding the result for you.` });
  } else if (largestShare >= 15) {
    notes.push({ tone: 'watch', text: `${largest.name} at ${formatShare(largestShare)} is above the 10–15% single-stock zone most portfolio tools watch.` });
  }

  const topSector = model.slices.sectors[0];
  const sectorShare = shareOf(topSector.value, model.total);
  if (sectorShare >= 30) {
    notes.push({ tone: 'watch', text: `${topSector.name} covers ${formatShare(sectorShare)} of the account — that concentrated, a sector behaves like one large position.` });
  }

  if (model.positions.length < 5) {
    notes.push({ tone: 'tip', text: `${model.positions.length} position${model.positions.length === 1 ? '' : 's'} so far. Research on diversification usually points at 10–20 names before the risk spreads out.` });
  }
  if (cashShare >= 20) {
    notes.push({ tone: 'tip', text: `${formatShare(cashShare)} (${formatCurrency(model.available)}) is still sitting in cash.` });
  }
  if (!notes.length) {
    notes.push({ tone: 'pro', text: `Spread over ${model.positions.length} position${model.positions.length === 1 ? '' : 's'} in ${model.sectorCount} sector${model.sectorCount === 1 ? '' : 's'}, with the largest at ${formatShare(largestShare)}.` });
  }
  return notes.slice(0, 2);
}

function AllocationPanel({ holdings, quotes, cash, eyebrow = 'Account composition', title = 'Asset allocation', onDetails, onPick }) {
  const [mode, setMode] = useState('holdings');
  const [hover, setHover] = useState(null);
  const model = useMemo(() => buildAllocation(holdings, quotes, cash), [holdings, quotes, cash]);
  const slices = model.slices[mode];
  const notes = useMemo(() => buildAllocationNotes(model), [model]);
  const active = hover === null ? null : slices[hover];
  const largest = model.positions[0];

  if (!model.total) {
    return <section className="card allocation-card"><EmptyState icon={<BarChart3 size={20} />} title="Nothing allocated" body="Your position mix appears after your first simulated trade." /></section>;
  }

  return <section className="card allocation-card">
    <div className="section-heading ap-head">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      <div className="ap-tools">
        <div className="range-tabs" role="group" aria-label="Allocation view">
          <button className={mode === 'holdings' ? 'active' : ''} type="button" onClick={() => { setMode('holdings'); setHover(null); }}>Holdings</button>
          <button className={mode === 'sectors' ? 'active' : ''} type="button" onClick={() => { setMode('sectors'); setHover(null); }}>Sectors</button>
        </div>
        {onDetails && <button className="text-button" onClick={onDetails} type="button">Details <ChevronRight size={15} /></button>}
      </div>
    </div>

    <div className="ap-bar" aria-hidden="true">
      {slices.map((slice, index) => <i key={slice.name} className={hover === index ? 'on' : ''} style={{ width: `${shareOf(slice.value, model.total)}%`, background: slice.color }} />)}
    </div>

    <div className="ap-layout">
      <div className="allocation-chart ap-donut" role="img" aria-label={`Allocation of ${formatCurrency(model.total)} by ${mode}: ${slices.map((slice) => `${slice.name} ${formatShare(shareOf(slice.value, model.total))}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices} dataKey="value" nameKey="name" startAngle={90} endAngle={-270}
              innerRadius="67%" outerRadius="97%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="none"
              onMouseEnter={(_, index) => setHover(index)} onMouseLeave={() => setHover(null)}
              shape={(props) => <Sector {...props} cornerRadius={3}
                fill={slices[props.index]?.color || props.fill}
                opacity={hover === null || hover === props.index ? 1 : 0.32}
                outerRadius={hover === props.index ? props.outerRadius + 4 : props.outerRadius} />}
            />
          </PieChart>
        </ResponsiveContainer>
        <div>
          <strong>{active ? formatShare(shareOf(active.value, model.total)) : formatCurrency(model.total)}</strong>
          <span>{active ? `${active.name} · ${formatCurrency(active.value, { maximumFractionDigits: 0 })}` : 'total value'}</span>
        </div>
      </div>

      <div className="ap-list">
        {slices.map((slice, index) => {
          const selectable = Boolean(onPick) && slice.name !== 'Cash' && !slice.count;
          return <button className={`ap-row${hover === index ? ' on' : ''}`} key={slice.name} type="button" style={{ '--allocation-color': slice.color }}
            onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}
            onClick={() => selectable && onPick(slice.name)} disabled={!selectable} title={selectable ? `Open ${slice.name}` : undefined}>
            <i /><span className="ap-name"><strong>{slice.name}</strong><small>{slice.label}</small></span>
            <span className="ap-figure"><strong>{formatShare(shareOf(slice.value, model.total))}</strong><small>{formatCurrency(slice.value)}</small></span>
          </button>;
        })}
      </div>
    </div>

    <div className="ap-stats">
      <span><small>Largest</small><strong>{largest ? `${largest.name} ${formatShare(shareOf(largest.value, model.total))}` : '—'}</strong></span>
      <span><small>Top 3</small><strong>{model.positions.length ? formatShare(shareOf(model.positions.slice(0, 3).reduce((sum, item) => sum + item.value, 0), model.total)) : '—'}</strong></span>
      <span><small>Sectors</small><strong>{model.sectorCount || '—'}</strong></span>
      <span><small>In cash</small><strong>{formatShare(shareOf(model.available, model.total))}</strong></span>
    </div>

    {notes.length > 0 && <ul className="ap-notes">{notes.map((note) => <li className={note.tone} key={note.text}><i />{note.text}</li>)}</ul>}
  </section>;
}

function Dashboard(props) {
  const { holdings, cash, quotes, onPortfolio } = props;
  return <div className="dashboard-composition">
    <HeroBand onDetails={props.onBudget} />
    <LegacyDashboard {...props} />
    <div className="dashboard-insights">
      <RecentNews onViewAll={props.onNews} />
      <AllocationPanel holdings={holdings} quotes={quotes} cash={cash} onPick={props.onSelect} onDetails={onPortfolio} />
    </div>
  </div>;
}

function AccountWorkspace() {
  const { status, account, store } = useAccount();
  if (status === 'loading' || !store) {
    return <div className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><main className="main-content"><EmptyState icon={<LineChart size={20} />} title="Loading your portfolio" body="Checking for a signed-in account and its saved trades." /></main></div>;
  }
  return <Workspace key={account?.id || 'guest'} account={account} store={store} />;
}

export default function App() {
  return <AccountProvider><AccountWorkspace /></AccountProvider>;
}
