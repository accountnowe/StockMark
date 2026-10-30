import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleCheck, Plus, RefreshCw, ShieldCheck, Sparkles, TrendingUp, X } from 'lucide-react';
import { formatCurrency } from '../storage';
import { BUDGET_GUIDE, classifyName } from '../expenses/analysis.js';

const STARTER = [
  'Rent / mortgage', 'Groceries', 'Utilities', 'Transport', 'Insurance',
  'Dining out', 'Subscriptions', 'Shopping', 'Health', 'Savings & investing',
];
const TONE = { need: 'need', want: 'want', saving: 'save', unknown: 'flat' };
const GROUP_NAME = { need: 'Need', want: 'Want', saving: 'Savings', unknown: 'Unclassified' };
const AUTO_NAME = { need: 'Need', want: 'Want', saving: 'Save', unknown: 'None' };
const CHOICES = ['', 'need', 'want', 'saving'];
const DAYS_IN_MONTH = 30.44;

const money = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const percent = (value) => `${(value * 100).toFixed(Math.abs(value) >= 0.1 ? 0 : 1)}%`;
const round = (value) => Math.round(value * 100) / 100;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blankRow = (name = '') => ({ id: newId(), name, planned: '', actual: '', group: '' });
const asText = (value) => (value > 0 ? String(value) : '');

const hydrate = (saved) => {
  if (!saved || !saved.rows) return { income: '', carryIn: '', people: '1', rows: STARTER.slice(0, 6).map((name) => blankRow(name)) };
  return {
    income: asText(saved.income),
    carryIn: asText(saved.carryIn),
    people: String(saved.people || 1),
    rows: saved.rows.length ? saved.rows.map((row) => ({ id: row.id || newId(), name: row.name, planned: asText(row.planned), actual: asText(row.actual), group: CHOICES.includes(row.group) ? row.group : '' })) : STARTER.slice(0, 6).map((name) => blankRow(name)),
  };
};

const serialize = (draft) => ({
  income: money(draft.income),
  carryIn: money(draft.carryIn),
  people: Math.max(1, Math.round(money(draft.people) || 1)),
  rows: draft.rows
    .filter((row) => row.name.trim())
    .map((row) => ({ id: row.id, name: row.name.trim().slice(0, 48), planned: money(row.planned), actual: money(row.actual), group: CHOICES.includes(row.group) ? row.group : '' })),
});

function buildFindings({ available, income, loggedCount, loggedPlanned, loggedActual, rowCount, leftToPlan, guide, unclassified, over }) {
  const notes = [];
  if (!income) {
    notes.push({ tone: 'tip', title: 'Start with your take-home pay', detail: 'Enter the money that actually lands in your account each month. Every other figure on this page is measured against it.' });
    return notes;
  }
  if (leftToPlan > 0.5) {
    notes.push({ tone: 'tip', title: `${formatCurrency(leftToPlan)} has no job yet`, detail: 'A plan is only finished when nothing is left over. Move it into an envelope, or give it to savings and investing.', action: 'Use the 50/30/20 split button to assign it in one step.' });
  }
  if (leftToPlan < -0.5) {
    notes.push({ tone: 'watch', title: `Planned spending is ${formatCurrency(-leftToPlan)} above your income`, detail: 'Cut from the largest want envelope first — that is the amount you would have to find every single month.' });
  }
  guide.forEach((item) => {
    if (!item.planned && available) return;
    if (item.key === 'need' && item.plannedShare > item.target + 0.05) {
      notes.push({ tone: 'watch', title: `Needs are ${percent(item.plannedShare)} of your money`, detail: `The guideline is ${percent(item.target)}. Housing and transport usually drive this, and they are the hardest to claw back later.` });
    }
    if (item.key === 'want' && item.plannedShare > item.target + 0.05) {
      notes.push({ tone: 'watch', title: `Wants are ${formatCurrency(item.planned - item.guide)} over the ${percent(item.target)} line`, detail: 'Bringing wants back to target frees that amount for investing without touching rent, food or bills.' });
    }
    if (item.key === 'saving' && item.plannedShare < item.target - 0.02) {
      notes.push({ tone: 'tip', title: `Savings and investing are at ${formatCurrency(item.planned)}`, detail: `The ${percent(item.target)} target is ${formatCurrency(item.guide)}. The gap is ${formatCurrency(Math.max(0, item.guide - item.planned))} a month, or ${formatCurrency(Math.max(0, item.guide - item.planned) * 12)} a year.` });
    }
    if (item.key === 'saving' && item.plannedShare >= item.target) {
      notes.push({ tone: 'pro', title: `You are saving ${percent(item.plannedShare)} of what you earn`, detail: `That is at or above the ${percent(item.target)} guideline — ${formatCurrency(item.planned * 12)} across a year.` });
    }
  });
  if (over.length) {
    notes.push({ tone: 'watch', title: `${over.length} envelope${over.length === 1 ? ' is' : 's are'} already over the limit`, detail: `${over.slice(0, 3).map((row) => `${row.name} (+${formatCurrency(row.over)})`).join(', ')}${over.length > 3 ? ` and ${over.length - 3} more` : ''}. Either raise the limit or note what it pushed out.` });
  }
  if (loggedCount && loggedPlanned > 0) {
    const drift = loggedActual - loggedPlanned;
    const tight = Math.abs(drift) / loggedPlanned < 0.05;
    notes.push({
      tone: tight ? 'pro' : 'watch',
      title: tight ? 'Where you have logged, spending matches the plan' : `Where you have logged, spending is ${formatCurrency(Math.abs(drift))} ${drift > 0 ? 'above' : 'below'} the plan`,
      detail: `${formatCurrency(loggedActual)} spent against ${formatCurrency(loggedPlanned)} set aside for ${loggedCount} of ${rowCount} categor${rowCount === 1 ? 'y' : 'ies'}.${loggedCount < rowCount ? ' The rest still has no actual figure, so the total is not a fair comparison yet.' : ''}`,
    });
  }
  if (unclassified.length) {
    notes.push({ tone: 'tip', title: `${unclassified.length} categor${unclassified.length === 1 ? 'y is' : 'ies are'} not recognised`, detail: `${unclassified.slice(0, 3).map((row) => row.name).join(', ')} do not match any known expense, so they sit outside the 50/30/20 read. Rename them to something like "Groceries" or "Netflix", or set Need, Want or Savings on the row.` });
  }
  return notes;
}

export function BudgetPlanner({ store, onOpenExpenses }) {
  const [draft, setDraft] = useState(() => hydrate(store?.getBudget?.()));
  const [notice, setNotice] = useState('');

  useEffect(() => { store?.saveBudget(serialize(draft)); }, [store, draft]);

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const patchRow = (id, changes) => setDraft((current) => ({ ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, ...changes } : row)) }));
  const addRow = () => setDraft((current) => ({ ...current, rows: [...current.rows, blankRow()] }));
  const removeRow = (id) => setDraft((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  const loadStarter = () => { setDraft((current) => ({ ...current, rows: STARTER.map((name) => blankRow(name)) })); setNotice('Starter categories loaded. Add an amount to each one.'); };
  const resetAmounts = () => { setDraft((current) => ({ ...current, rows: current.rows.map((row) => ({ ...row, planned: '', actual: '' })), carryIn: '' })); setNotice('Amounts cleared.'); };

  const income = money(draft.income);
  const carryIn = money(draft.carryIn);
  const available = income + carryIn;
  const people = Math.max(1, Math.round(money(draft.people) || 1));

  // A row follows the name-based guess until the user picks a group, then the
  // pick wins — otherwise typing in the name box would undo their choice.
  const tagged = useMemo(() => draft.rows.map((row) => {
    const auto = classifyName(row.name).group;
    return { ...row, auto, kind: row.group || auto };
  }), [draft.rows]);
  const plannedTotal = tagged.reduce((sum, row) => sum + money(row.planned), 0);
  const actualTotal = tagged.reduce((sum, row) => sum + money(row.actual), 0);
  const leftToPlan = available - plannedTotal;

  const guide = BUDGET_GUIDE.map((entry) => {
    const planned = tagged.filter((row) => row.kind === entry.key).reduce((sum, row) => sum + money(row.planned), 0);
    const actual = tagged.filter((row) => row.kind === entry.key).reduce((sum, row) => sum + money(row.actual), 0);
    const target = available * entry.target;
    return { ...entry, planned, actual, guide: target, plannedShare: available ? planned / available : 0, actualShare: available ? actual / available : 0 };
  });

  const unclassified = tagged.filter((row) => row.kind === 'unknown' && (money(row.planned) > 0 || money(row.actual) > 0));
  const over = tagged.map((row) => ({ ...row, over: money(row.actual) - money(row.planned) })).filter((row) => row.over > 0.5 && money(row.planned) > 0);
  const logged = tagged.filter((row) => money(row.actual) > 0);
  const savingsPlanned = guide.find((entry) => entry.key === 'saving')?.planned || 0;

  const suggestSplit = () => {
    if (!available) { setNotice('Add your monthly income first — the split is worked out from it.'); return; }
    const counts = {};
    tagged.forEach((row) => { counts[row.kind] = (counts[row.kind] || 0) + 1; });
    const perRow = {};
    BUDGET_GUIDE.forEach((entry) => { perRow[entry.key] = counts[entry.key] ? round(available * entry.target / counts[entry.key]) : 0; });
    const groupOf = Object.fromEntries(tagged.map((row) => [row.id, row.kind]));
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        const share = perRow[groupOf[row.id]];
        return share ? { ...row, planned: String(share) } : row;
      }),
    }));
    setNotice(`Split ${formatCurrency(available * 0.5)} / ${formatCurrency(available * 0.3)} / ${formatCurrency(available * 0.2)} across your categories.`);
  };

  const findings = buildFindings({
    available,
    income,
    leftToPlan,
    guide,
    unclassified,
    over,
    rowCount: tagged.length,
    loggedCount: logged.length,
    loggedPlanned: logged.reduce((sum, row) => sum + money(row.planned), 0),
    loggedActual: logged.reduce((sum, row) => sum + money(row.actual), 0),
  });

  return <div className="view-page budget-page">
    <div className="page-title">
      <div>
        <p className="eyebrow">Plan before you invest</p>
        <h1>Budget planner</h1>
        <p>Assign every dollar you bring in, then watch the month against the plan.</p>
      </div>
      <span className="data-chip"><ShieldCheck size={12} /> {store?.scope === 'server' ? 'Saved to your account' : 'Saved in this browser'}</span>
    </div>

    <div className="budget-layout bp-layout">
      <div className="bp-left">
        <section className="card bp-money" aria-label="Money in">
          <div>
            <label>Monthly take-home income
              <input type="number" min="0" step="10" value={draft.income} onChange={(event) => patch({ income: event.target.value })} placeholder="5000" />
            </label>
            <small>After tax — the money that actually arrives.</small>
          </div>
          <div>
            <label>Left over from last month
              <input type="number" min="0" step="10" value={draft.carryIn} onChange={(event) => patch({ carryIn: event.target.value })} placeholder="0" />
            </label>
            <small>Unspent money rolls in and gets a job.</small>
          </div>
          <div>
            <label>People sharing this budget
              <input type="number" min="1" step="1" value={draft.people} onChange={(event) => patch({ people: event.target.value })} />
            </label>
            <small>Used for the per-head figures.</small>
          </div>
          <div className="bp-tally">
            <span>Money to plan</span>
            <strong>{formatCurrency(available)}</strong>
            <span className="bp-tally-sub">Assigned {formatCurrency(plannedTotal)} · Left {formatCurrency(leftToPlan)}</span>
          </div>
        </section>

        <section className="card bp-envelopes" aria-label="Category envelopes">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Envelopes</p>
              <h2>Give every category a limit</h2>
            </div>
            <span className="count-pill">{tagged.length} categories</span>
          </div>

          <div className="bp-rows" role="table">
            <div className="bp-row bp-row-head" role="row">
              <span>Category</span><span>Group</span><span>Planned</span><span>Actual</span><span className="bp-hide-sm">Left</span><span />
            </div>
            {tagged.map((row) => {
              const planned = money(row.planned);
              const actual = money(row.actual);
              const left = planned - actual;
              const used = planned ? Math.min(1.5, actual / planned) : (actual ? 1.5 : 0);
              return <div className={`bp-row ${actual > planned && planned > 0 ? 'over' : ''}`} key={row.id} role="row">
                <label className="bp-name">
                  <input value={row.name} onChange={(event) => patchRow(row.id, { name: event.target.value })} placeholder="Category name" aria-label="Category name" />
                  <span className="bp-meter"><i className={TONE[row.kind]} style={{ width: `${Math.min(100, used * 100 / 1.5)}%` }} /></span>
                </label>
                <select className={`bp-group ${TONE[row.kind]}`} value={row.group} onChange={(event) => patchRow(row.id, { group: event.target.value })} aria-label={`${row.name || 'Category'} group`} title={row.group ? 'Set by you' : `Detected from the name: ${GROUP_NAME[row.auto]}`}>
                  <option value="">Auto · {AUTO_NAME[row.auto]}</option>
                  <option value="need">Need</option>
                  <option value="want">Want</option>
                  <option value="saving">Savings</option>
                </select>
                <input className="bp-num bp-planned" type="number" min="0" step="10" value={row.planned} onChange={(event) => patchRow(row.id, { planned: event.target.value })} placeholder="0" aria-label={`${row.name || 'Category'} planned`} />
                <input className="bp-num bp-actual" type="number" min="0" step="10" value={row.actual} onChange={(event) => patchRow(row.id, { actual: event.target.value })} placeholder="—" aria-label={`${row.name || 'Category'} actually spent`} />
                <span className={`bp-left-cell bp-hide-sm ${left < 0 ? 'neg' : ''}`}>{planned || actual ? formatCurrency(left) : '—'}</span>
                <button className="bp-del" type="button" onClick={() => removeRow(row.id)} aria-label={`Remove ${row.name || 'category'}`}><X size={13} /></button>
              </div>;
            })}
            {!tagged.length && <p className="bp-empty">No categories yet. Load the starter set or add your own.</p>}
          </div>

          <div className="bp-actions">
            <button className="admin-secondary-button" type="button" onClick={addRow}><Plus size={13} /> Add category</button>
            <button className="admin-secondary-button" type="button" onClick={suggestSplit}><Sparkles size={13} /> Suggest 50/30/20 split</button>
            <button className="admin-secondary-button" type="button" onClick={loadStarter}><RefreshCw size={13} /> Load starter categories</button>
            {tagged.length > 0 && <button className="admin-secondary-button" type="button" onClick={resetAmounts}>Clear amounts</button>}
          </div>
          {notice && <p className="bp-notice" role="status">{notice}</p>}
          <p className="modal-note"><ShieldCheck size={14} /> Groups are guessed from the name — "Rent", "Netflix", "SIP" and 60+ other words are recognised — but the box on each row sets Need, Want or Savings yourself, and that choice wins.</p>
        </section>
      </div>

      <section className="card budget-result bp-result" aria-label="Budget summary">
        <p className="eyebrow">Your plan</p>
        <div className={`bp-hero ${leftToPlan < -0.5 ? 'neg' : ''}`}>
          <h2>{formatCurrency(leftToPlan)}</h2>
          <p>{!available && !plannedTotal ? 'enter your income and category limits to start' : leftToPlan < -0.5 ? 'assigned beyond what you earn' : leftToPlan > 0.5 ? 'still to assign — the plan is not finished' : 'every dollar has a job'}</p>
        </div>

        <div className="bp-stats">
          <span><small>Planned out</small><strong>{formatCurrency(plannedTotal)}</strong></span>
          <span><small>Actually spent</small><strong>{formatCurrency(actualTotal)}</strong></span>
          <span><small>Savings &amp; investing</small><strong>{formatCurrency(savingsPlanned)}</strong></span>
          <span><small>Per person</small><strong>{formatCurrency(plannedTotal / people)}</strong></span>
          <span><small>Per day</small><strong>{formatCurrency(plannedTotal / DAYS_IN_MONTH)}</strong></span>
          <span><small>Budget used</small><strong>{plannedTotal ? percent(actualTotal / plannedTotal) : '—'}</strong></span>
        </div>

        <div className="bp-block">
          <p className="eyebrow">Against the 50/30/20 guideline</p>
          {guide.map((entry) => {
            const state = !available ? 'flat' : entry.plannedShare > entry.target + 0.05 ? 'over' : entry.plannedShare < entry.target - 0.05 ? 'under' : 'on';
            return <div className={`bp-bench ${state}`} key={entry.key}>
              <div className="bp-bench-head">
                <strong>{entry.label}</strong>
                <span>{formatCurrency(entry.planned)} <small>· {percent(entry.plannedShare)} of income, target {percent(entry.target)}</small></span>
              </div>
              <div className="bp-bench-bar">
                <i className="bp-bench-plan" style={{ width: `${Math.min(100, entry.plannedShare * 100)}%` }} />
                <i className="bp-bench-actual" style={{ width: `${Math.min(100, entry.actualShare * 100)}%` }} />
                <b style={{ left: `${entry.target * 100}%` }} title={`Target ${percent(entry.target)}`} />
              </div>
              <p className="bp-bench-note">{!available ? 'Add income to see the target.' : state === 'over' ? `${formatCurrency(entry.planned - entry.guide)} above target` : state === 'under' ? `Room for ${formatCurrency(entry.guide - entry.planned)} more` : 'On target'}</p>
            </div>;
          })}
          <p className="bp-legend"><span className="bp-legend-plan" /> planned <span className="bp-legend-actual" /> actual <b /> guideline</p>
        </div>

        <div className="bp-block">
          <p className="eyebrow">What this means</p>
          <ul className="bp-findings">
            {findings.map((finding) => <li className={`bp-finding ${finding.tone}`} key={finding.title}>
              <span className="bp-finding-icon">
                {finding.tone === 'pro' ? <CircleCheck size={15} /> : finding.tone === 'watch' ? <TrendingUp size={15} /> : <Sparkles size={15} />}
              </span>
              <div>
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
                {finding.action && <p className="bp-finding-action">{finding.action}</p>}
              </div>
            </li>)}
          </ul>
        </div>

        {savingsPlanned > 0 && onOpenExpenses && <button className="text-button bp-cta" type="button" onClick={onOpenExpenses}>
          Analyse the month against this plan <ChevronRight size={15} />
        </button>}
      </section>
    </div>
  </div>;
}

export default BudgetPlanner;
