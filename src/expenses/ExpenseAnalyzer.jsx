import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleCheck, ChevronRight, Loader, ScanSearch, ShieldCheck, Sparkles, TrendingUp, X,
} from 'lucide-react';
import { formatCurrency } from '../storage';
import { analyzeExpenses, parseExpenseLines } from './analysis.js';
import { releaseReceiptEngine, scanReceipt } from './ocr.js';

const DEFAULT_LINES = 'Rent, 1200\nGroceries, 540\nTransport, 260\nUtilities, 185\nDining out, 150\nNetflix, 16';

const GROUP_META = {
  need: { label: 'Need', tone: 'need' },
  want: { label: 'Want', tone: 'want' },
  saving: { label: 'Saving', tone: 'save' },
  unknown: { label: 'Untracked', tone: 'flat' },
};

const STAGE_COPY = {
  loading: 'Loading the text reader…',
  preparing: 'Preparing the image…',
  reading: 'Reading the image…',
  done: 'Done',
};

const toPercent = (value) => `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
const toLines = (items) => items.map((item) => `${item.name}, ${item.amount}`).join('\n');

function FindingCard({ finding }) {
  const icon = finding.tone === 'pro'
    ? <CircleCheck size={15} />
    : finding.tone === 'watch' ? <TrendingUp size={15} /> : <Sparkles size={15} />;
  return (
    <li className={`ex-finding ${finding.tone}`}>
      <span className="ex-finding-icon">{icon}</span>
      <div>
        <strong>{finding.title}</strong>
        <p>{finding.detail}</p>
        {finding.action && <p className="ex-finding-action">{finding.action}</p>}
      </div>
    </li>
  );
}

export function ExpenseAnalyzer() {
  const [income, setIncome] = useState('');
  const [people, setPeople] = useState('1');
  const [text, setText] = useState(DEFAULT_LINES);
  const [image, setImage] = useState(null);
  const [scan, setScan] = useState({ status: 'idle', stage: '', progress: 0, items: [], confidence: 0, error: '' });
  const [calculated, setCalculated] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const scanToken = useRef(0);
  const previewUrl = useRef(null);

  const lines = useMemo(() => parseExpenseLines(text), [text]);
  const result = useMemo(
    () => (calculated ? analyzeExpenses({ items: lines, income, people }) : null),
    [calculated, lines, income, people],
  );

  useEffect(() => () => {
    scanToken.current += 1;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    releaseReceiptEngine();
  }, []);

  const runScan = useCallback(async (file) => {
    const token = scanToken.current + 1;
    scanToken.current = token;
    setScan({ status: 'scanning', stage: 'loading', progress: 0, items: [], confidence: 0, error: '' });
    try {
      const read = await scanReceipt(file, {
        onStage: (stage, progress) => {
          if (scanToken.current !== token) return;
          setScan((current) => ({ ...current, stage, progress: progress ?? current.progress }));
        },
      });
      if (scanToken.current !== token) return;
      const items = parseExpenseLines(read.text);
      setScan({
        status: items.length ? 'ready' : 'empty',
        stage: 'done',
        progress: 1,
        items,
        confidence: read.confidence,
        error: items.length
          ? ''
          : 'The image was read but no amounts were found. Crops of the numbers work best, or type the lines below.',
      });
    } catch (scanError) {
      if (scanToken.current !== token) return;
      setScan({
        status: 'error',
        stage: '',
        progress: 0,
        items: [],
        confidence: 0,
        error: scanError?.message || 'The image could not be read.',
      });
    }
  }, []);

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file, such as a photo of a bill.');
      event.target.value = '';
      return;
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    setError('');
    const url = URL.createObjectURL(file);
    previewUrl.current = url;
    setImage({ url, name: file.name, size: file.size });
    runScan(file);
  };

  const clearImage = () => {
    scanToken.current += 1;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setImage(null);
    setScan({ status: 'idle', stage: '', progress: 0, items: [], confidence: 0, error: '' });
    if (fileInput.current) fileInput.current.value = '';
  };

  const useDetected = (mode) => {
    const next = toLines(scan.items);
    setText((current) => (mode === 'append' && current.trim() ? `${current.trim()}\n${next}` : next));
    setScan((current) => ({ ...current, status: 'applied' }));
    setCalculated(true);
  };

  const calculate = () => {
    if (!lines.length) {
      setCalculated(false);
      setError('Add at least one expense line with an amount, like “Rent, 1200”.');
      return;
    }
    setError('');
    setCalculated(true);
  };

  const scanning = scan.status === 'scanning';

  return (
    <div className="view-page budget-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">EXPENSE ANALYSIS</p>
          <h1>Expense analyzer</h1>
          <p>Upload a bill to read its amounts, then break the month down by category, average and 50/30/20 guideline.</p>
        </div>
        <span className="data-chip"><ScanSearch size={12} /> Runs in your browser</span>
      </div>

      <div className="budget-layout">
        <section className="card budget-form" aria-label="Expense inputs">
          <h2>Expense details</h2>

          <label>Monthly income
            <input type="number" min="0" value={income} onChange={(event) => setIncome(event.target.value)} placeholder="$5,000" />
          </label>
          <label>People sharing expenses
            <input type="number" min="1" value={people} onChange={(event) => setPeople(event.target.value)} />
          </label>

          <div className="upload-row">
            <label className="upload-field">Upload expense image
              <input ref={fileInput} type="file" accept="image/*" onChange={pickImage} disabled={scanning} />
            </label>
            {image ? (
              <div className="receipt-preview-wrap">
                <img className="receipt-preview" src={image.url} alt={`Uploaded bill: ${image.name}`} />
                <button className="remove-image" type="button" onClick={clearImage}><X size={13} /> Remove image</button>
              </div>
            ) : (
              <p className="modal-note"><ShieldCheck size={14} /> The photo is read locally — nothing is uploaded to a server.</p>
            )}
          </div>

          {image && (
            <div className={`ex-scan ${scan.status}`} role="status" aria-live="polite">
              {scanning && (
                <p className="ex-scan-progress">
                  <Loader size={13} className="ex-spin" />
                  <span>{STAGE_COPY[scan.stage] || 'Reading…'}</span>
                  <span className="ex-scan-bar"><i style={{ width: `${Math.round((scan.progress || 0.08) * 100)}%` }} /></span>
                </p>
              )}
              {!scanning && scan.status !== 'idle' && (
                <>
                  <div className="ex-scan-head">
                    <strong>{scan.status === 'ready' || scan.status === 'applied' ? `${scan.items.length} lines read` : 'Nothing usable found'}</strong>
                    <span className="ex-scan-file">{image.name} · {Math.max(0.1, image.size / 1e6).toFixed(1)} MB</span>
                    {scan.confidence > 0 && <span className={`ex-confidence ${scan.confidence >= 80 ? 'good' : scan.confidence >= 60 ? 'ok' : 'weak'}`}>{Math.round(scan.confidence)}% legible</span>}
                  </div>
                  {scan.error && <p className="ex-scan-error" role="alert">{scan.error}</p>}
                  {scan.items.length > 0 && scan.status !== 'applied' && (
                    <>
                      <ul className="ex-detected">
                        {scan.items.map((item) => (
                          <li key={`${item.raw}-${item.amount}`}>
                            <span>{item.name}</span>
                            <strong>{formatCurrency(item.amount)}</strong>
                          </li>
                        ))}
                      </ul>
                      <div className="ex-scan-actions">
                        <button className="admin-secondary-button" type="button" onClick={() => useDetected('append')}>Add to my lines</button>
                        <button className="admin-secondary-button" type="button" onClick={() => useDetected('replace')}>Replace my lines</button>
                      </div>
                    </>
                  )}
                  {scan.status === 'applied' && <p className="ex-scan-note">Detected lines are in the list below.</p>}
                </>
              )}
            </div>
          )}

          <label>Enter expenses <small>one per line: category, amount</small>
            <textarea rows="7" value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <p className="ex-line-count">
            <span>{lines.length} usable line{lines.length === 1 ? '' : 's'}</span>
            {lines.length !== text.split('\n').filter((line) => line.trim()).length && <span className="warn">some lines have no amount</span>}
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="budget-form-actions">
            <button className="auth-submit" type="button" onClick={calculate}>Analyze expenses</button>
          </div>
        </section>

        <section className="card budget-result ex-result" aria-label="Analysis result">
          <p className="eyebrow">ANALYSIS</p>
          {result ? (
            <>
              <div className="ex-score">
                <div>
                  <h2>{formatCurrency(result.total)}</h2>
                  <p>total outflow · {result.categories.length} categories</p>
                </div>
                <div className="ex-score-meter">
                  <strong>{result.score}</strong>
                  <span className="ex-score-bar"><i style={{ width: `${result.score}%` }} /></span>
                  <small>{result.grade}{result.confidence === 'partial' ? ' · add income for a full read' : ''}</small>
                </div>
              </div>

              <div className="ex-stats">
                <span><small>Per person</small><strong>{formatCurrency(result.perPerson)}</strong></span>
                <span><small>Per day</small><strong>{formatCurrency(result.perDay)}</strong></span>
                <span><small>Avg per line</small><strong>{formatCurrency(result.averageItem)}</strong></span>
                {result.income > 0 && <span><small>Left after expenses</small><strong className={result.savings < 0 ? 'neg' : ''}>{formatCurrency(result.savings)}</strong></span>}
                {result.income > 0 && <span><small>Savings rate</small><strong className={result.savingsRate < 0 ? 'neg' : ''}>{toPercent(result.savingsRate)}</strong></span>}
                <span><small>Recurring share</small><strong>{toPercent(result.fixedShare)}</strong></span>
              </div>

              <div className="ex-block">
                <p className="eyebrow">Where it goes</p>
                <ul className="ex-categories">
                  {result.categories.map((category) => (
                    <li key={`${category.name}-${category.label}`} className={GROUP_META[category.group].tone}>
                      <span className="ex-cat-name">
                        <strong>{category.name}</strong>
                        <em>{GROUP_META[category.group].label}{category.recurring ? ' · recurring' : ''}</em>
                      </span>
                      <span className="ex-cat-bar"><i style={{ width: `${Math.max(2, category.share * 100)}%` }} /></span>
                      <span className="ex-cat-value"><b>{toPercent(category.share)}</b>{formatCurrency(category.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {result.benchmarks.length > 0 && (
                <div className="ex-block">
                  <p className="eyebrow">Against 50 / 30 / 20</p>
                  <ul className="ex-bench">
                    {result.benchmarks.map((bench) => {
                      const gap = bench.amount - bench.guide;
                      return (
                        <li key={bench.key} className={Math.abs(gap) <= bench.guide * 0.1 ? 'on' : gap > 0 ? 'over' : 'under'}>
                          <span><strong>{bench.label}</strong><small>{toPercent(bench.amount / result.income)} of income</small></span>
                          <span className="ex-bench-bar"><i style={{ width: `${Math.min(100, bench.actual / 0.6 * 100)}%` }} /><b style={{ left: `${bench.target / 0.6 * 100}%` }} /></span>
                          <span className="ex-bench-value"><b>{formatCurrency(bench.amount)}</b><small>guide {formatCurrency(bench.guide)}</small></span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {result.findings.length > 0 && (
                <div className="ex-block">
                  <p className="eyebrow">Strengths &amp; watch-outs</p>
                  <ul className="ex-findings">
                    {result.findings.map((finding) => <FindingCard key={finding.title} finding={finding} />)}
                  </ul>
                </div>
              )}

              <details className="ex-score-break">
                <summary>How the {result.score} was scored <ChevronRight size={13} /></summary>
                <ul>
                  {result.scoreParts.map((part) => (
                    <li key={part.key}>
                      <span><strong>{part.label}</strong><small>{part.note}</small></span>
                      <b>{Math.round(part.earned * part.weight)}/{part.weight}</b>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><ScanSearch size={20} /></span>
              <h3>Nothing analyzed yet</h3>
              <p>Upload a bill or fill the expense lines on the left, then use Analyze expenses for the category, average and guideline breakdown.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
