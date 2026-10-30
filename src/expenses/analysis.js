/*
 * Rule-based expense analytics for the paper-trading demo.
 * Everything here is deterministic arithmetic over the lines the user typed or
 * scanned — no model, no network, no invented figures.
 */

const DAY_DIVISOR = 30.44; // average calendar days per month
const TARGET_NEEDS = 0.5;
const TARGET_WANTS = 0.3;
const TARGET_SAVINGS = 0.2;

const RULES = [
  { group: 'saving', recurring: true, label: 'Savings & investing', keys: ['sip', 'mutual fund', 'invest', 'stock', 'fd', 'fixed deposit', 'ppf', 'nps', '401k', '401(k)', 'ira', 'pension', 'saving', 'deposit', 'emergency fund', 'gold', 'bond', 'retirement'] },
  { group: 'need', recurring: true, label: 'Housing', keys: ['rent', 'lease', 'mortgage', 'housing', 'society', 'maintenance', 'property', 'accommodation', 'pg', 'hostel', 'home loan', 'council tax', 'rates'] },
  { group: 'need', recurring: true, label: 'Utilities', keys: ['utilit', 'electricity', 'power', 'water', 'gas', 'internet', 'wifi', 'broadband', 'phone', 'cable', 'waste', 'sewer', 'heating'] },
  { group: 'need', recurring: true, label: 'Insurance', keys: ['insurance', 'premium', 'policy', 'term plan'] },
  { group: 'need', recurring: true, label: 'Debt & EMIs', keys: ['emi', 'loan', 'interest', 'credit card', 'repayment', 'debt', 'overdraft', 'payday'] },
  { group: 'need', recurring: true, label: 'Education', keys: ['school', 'college', 'tuition', 'fees', 'course', 'training', 'lesson', 'university', 'book'] },
  { group: 'need', recurring: false, label: 'Groceries & food', keys: ['grocer', 'groceries', 'food', 'supermarket', 'ration', 'vegetable', 'fruit', 'milk', 'bread', 'kirana', 'pantry'] },
  { group: 'need', recurring: false, label: 'Health', keys: ['health', 'medicine', 'medical', 'pharma', 'doctor', 'hospital', 'clinic', 'dental', 'gym', 'fitness', 'therapy', 'glasses'] },
  { group: 'need', recurring: false, label: 'Transport', keys: ['transport', 'fuel', 'petrol', 'diesel', 'cng', 'bus', 'metro', 'train', 'taxi', 'cab', 'uber', 'ola', 'parking', 'toll', 'car', 'bike', 'scooter', 'commute'] },
  { group: 'want', recurring: false, label: 'Dining out', keys: ['dining', 'restaurant', 'cafe', 'coffee', 'swiggy', 'zomato', 'doordash', 'ubereats', 'pizza', 'takeout', 'bar', 'pub', 'snack'] },
  { group: 'want', recurring: true, label: 'Subscriptions & play', keys: ['netflix', 'prime video', 'spotify', 'youtube', 'disney', 'hbo', 'subscription', 'movie', 'cinema', 'game', 'gaming', 'concert', 'hobby', 'streaming', 'membership', 'entertainment'] },
  { group: 'want', recurring: false, label: 'Shopping', keys: ['shopping', 'clothes', 'apparel', 'fashion', 'shoe', 'footwear', 'amazon', 'flipkart', 'myntra', 'electronics', 'gadget', 'furniture', 'decor', 'gift', 'makeup', 'cosmetic'] },
  { group: 'want', recurring: false, label: 'Travel & leisure', keys: ['travel', 'flight', 'airline', 'hotel', 'vacation', 'trip', 'holiday', 'resort', 'cruise', 'tour'] },
  { group: 'want', recurring: false, label: 'Personal care', keys: ['salon', 'spa', 'haircut', 'grooming', 'barber'] },
];

const GROUP_LABEL = { need: 'Need', want: 'Want', saving: 'Saving', unknown: 'Untracked' };
const SKIP_PATTERN = /^(grand\s+)?(total|subtotal|balance|amount\s+due|sum)\b/i;
const MONTH_PATTERN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/i;
const NOISE_PATTERN = /^[|·•*,:;\-_=~#\s]+|[|·•*,:;\-_=~#\s]+$/g;

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchers = RULES.map((rule) => ({
  ...rule,
  tests: rule.keys.map((key) => new RegExp(`\\b${escapeRe(key)}\\w*`, 'i')),
}));

export function classifyName(name) {
  const text = String(name || '').trim();
  if (!text) return { group: 'unknown', label: 'Untracked', recurring: false };
  for (const rule of matchers) {
    if (rule.tests.some((test) => test.test(text))) {
      return { group: rule.group, label: rule.label, recurring: rule.recurring };
    }
  }
  return { group: 'unknown', label: 'Untracked', recurring: false };
}

function parseAmountToken(raw) {
  const cleaned = String(raw || '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Read one "Name, amount" / "Name $1,200.00" / "$1,200 Name" line. Returns null when it carries no amount. */
export function parseExpenseLine(line) {
  const raw = String(line || '').trim();
  if (!raw || SKIP_PATTERN.test(raw)) return null;
  const candidates = [...raw.matchAll(/[$€£₹]\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?%?/g)];
  const dated = MONTH_PATTERN.test(raw);
  const usable = candidates.filter((match) => {
    const token = match[0].trim();
    if (token.endsWith('%')) return false;
    // "October 2026" on a receipt header is a date, not a price.
    const looksLikeYear = /^(19|20)\d{2}$/.test(token.replace(/,/g, ''));
    return !(dated && looksLikeYear && !/[$€£₹]/.test(token));
  });
  if (!usable.length) return null;
  const picked = usable.find((match) => /[$€£₹]/.test(match[0])) || usable[usable.length - 1];
  const amount = parseAmountToken(picked[0]);
  if (amount === null || amount <= 0) return null;

  const name = `${raw.slice(0, picked.index)} ${raw.slice(picked.index + picked[0].length)}`
    .replace(NOISE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { name: (name || 'Unlabelled expense').slice(0, 48), amount, raw };
}

export function parseExpenseLines(text) {
  return String(text || '').split(/\r?\n/).map(parseExpenseLine).filter(Boolean);
}

function shareOf(value, total) {
  return total > 0 ? value / total : 0;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function linearScore(value, floor, ceiling) {
  if (floor === ceiling) return 0;
  return clamp01((ceiling - value) / (ceiling - floor));
}

function buildScoreParts({ incomeValue, savingsRate, needsShare, wantsShare, unknownShare, evenness, itemCount }) {
  const parts = [];
  if (incomeValue) {
    parts.push({
      key: 'buffer',
      label: 'Money left over',
      weight: 25,
      earned: savingsRate > 0 ? clamp01(savingsRate / TARGET_SAVINGS) : 0,
      note: `${(savingsRate * 100).toFixed(0)}% of income is unspent`,
    });
  }
  parts.push({
    key: 'needs',
    label: 'Essentials within 50%',
    weight: 20,
    earned: linearScore(needsShare, TARGET_NEEDS, 0.85),
    note: `Needs take ${(needsShare * 100).toFixed(0)}% of outflow`,
  });
  parts.push({
    key: 'wants',
    label: 'Lifestyle within 30%',
    weight: 20,
    earned: linearScore(wantsShare, TARGET_WANTS, 0.6),
    note: `Wants take ${(wantsShare * 100).toFixed(0)}% of outflow`,
  });
  parts.push({
    key: 'spread',
    label: 'Spread across categories',
    weight: 15,
    earned: itemCount > 1 ? evenness : 0,
    note: itemCount > 1 ? 'Evenness of the category split' : 'Only one line entered',
  });
  parts.push({
    key: 'tracked',
    label: 'Everything labelled',
    weight: 10,
    earned: 1 - clamp01(unknownShare / 0.3),
    note: unknownShare > 0 ? `${(unknownShare * 100).toFixed(0)}% unlabelled` : 'Every line is classified',
  });
  parts.push({
    key: 'detail',
    label: 'Enough detail',
    weight: 10,
    earned: clamp01(itemCount / 6),
    note: `${itemCount} expense line${itemCount === 1 ? '' : 's'}`,
  });
  return parts;
}

function buildFindings({ incomeValue, total, items, categories, buckets, savingsRate, fixedShare, topCategory, averageItem, perDay, people }) {
  const findings = [];
  const wantsAmount = buckets.wants.amount;
  const wantsTrimmed = Math.max(0, wantsAmount - total * TARGET_WANTS);
  const topWant = [...categories].filter((c) => c.group === 'want').sort((a, b) => b.amount - a.amount)[0];

  if (incomeValue && total > incomeValue) {
    findings.push({
      tone: 'watch',
      title: `You are spending ${formatDelta(total - incomeValue)} more than you earn`,
      detail: `Outflow is ${(shareOf(total, incomeValue) * 100).toFixed(0)}% of income, so the month is funded from savings or credit.`,
      action: topWant
        ? `Cutting ${topWant.name.toLowerCase()} alone closes ${Math.min(1, topWant.amount / (total - incomeValue)) * 100}% of the gap.`
        : 'Remove or defer one want category until outflow is under income.',
    });
  } else if (incomeValue && savingsRate >= TARGET_SAVINGS) {
    findings.push({
      tone: 'pro',
      title: `${(savingsRate * 100).toFixed(0)}% of income stays unspent`,
      detail: `That is ${formatDelta(incomeValue - total)} a month — about ${((incomeValue - total) / total).toFixed(1)} months of spending at this run rate.`,
      action: 'Route a fixed slice to savings on payday so it is not spent by accident.',
    });
  } else if (incomeValue && savingsRate < 0.1) {
    findings.push({
      tone: 'watch',
      title: `Only ${(savingsRate * 100).toFixed(0)}% of income is left`,
      detail: `One unexpected bill of ${formatDelta(Math.max(averageItem, perDay * 7))} would put this month underwater.`,
      action: 'Aim for the 20% guideline first — that is ' + formatDelta(incomeValue * TARGET_SAVINGS) + ' a month.',
    });
  }

  if (incomeValue && buckets.savings.amount === 0) {
    findings.push({
      tone: 'watch',
      title: 'Nothing is routed to savings or investing',
      detail: 'Every line is consumption, so no part of the month builds net worth.',
      action: `Even ${formatDelta(incomeValue * 0.05)} (5%) moved on payday changes the trajectory.`,
    });
  } else if (buckets.savings.share >= 0.1) {
    findings.push({
      tone: 'pro',
      title: 'You pay yourself first',
      detail: `${(buckets.savings.share * 100).toFixed(0)}% of outflow (${formatDelta(buckets.savings.amount)}) goes to savings or investing.`,
    });
  }

  if (topCategory && topCategory.share >= 0.4) {
    findings.push({
      tone: 'watch',
      title: `${topCategory.name} is ${(topCategory.share * 100).toFixed(0)}% of every dollar you spend`,
      detail: `One category holding ${formatDelta(topCategory.amount)} leaves almost no room to flex the rest of the month.`,
      action: topCategory.recurring
        ? 'Fixed and large — renegotiate or refinance at renewal, since monthly cuts will not reach it.'
        : 'Set a hard cap for this line and watch it for one month.',
    });
  } else if (topCategory && topCategory.share <= 0.3 && categories.length >= 4) {
    findings.push({
      tone: 'pro',
      title: 'No single category dominates',
      detail: `The largest line, ${topCategory.name}, is ${(topCategory.share * 100).toFixed(0)}% of spending.`,
    });
  }

  if (buckets.wants.share > TARGET_WANTS && wantsTrimmed > 0) {
    findings.push({
      tone: 'watch',
      title: `Lifestyle spend is ${((buckets.wants.share - TARGET_WANTS) * 100).toFixed(0)} points over the 30% guideline`,
      detail: `Wants take ${formatDelta(wantsAmount)} of the month${topWant ? `, led by ${topWant.name} at ${formatDelta(topWant.amount)}` : ''}.`,
      action: `Trimming wants to 30% frees ${formatDelta(wantsTrimmed)} a month.`,
    });
  } else if (buckets.wants.amount > 0 && buckets.wants.share <= 0.2 && total > 0) {
    findings.push({
      tone: 'pro',
      title: 'Discretionary spend is contained',
      detail: `Wants are only ${(buckets.wants.share * 100).toFixed(0)}% of outflow — well inside the 30% guideline.`,
    });
  }

  if (buckets.needs.share > 0.7) {
    findings.push({
      tone: 'watch',
      title: 'Essentials claim ' + (buckets.needs.share * 100).toFixed(0) + '% of the month',
      detail: `Above the 50% guideline, so ${formatDelta(buckets.needs.amount)} is committed before any choice is made.`,
      action: 'Only renegotiating a fixed contract moves this — a smaller plan, a cheaper insurer, a refinance.',
    });
  } else if (incomeValue && buckets.needs.share <= TARGET_NEEDS) {
    findings.push({
      tone: 'pro',
      title: 'Essentials sit inside the 50% guideline',
      detail: `Needs are ${(buckets.needs.share * 100).toFixed(0)}% of outflow, which is what a resilient budget looks like.`,
    });
  }

  if (fixedShare >= 0.75) {
    findings.push({
      tone: 'watch',
      title: 'Three-quarters of spending is recurring',
      detail: `${formatDelta(total * fixedShare)} repeats every month, so only ${formatDelta(total * (1 - fixedShare))} can be adjusted this month.`,
      action: 'Review the recurring list once a quarter — unused subscriptions and stale plans hide there.',
    });
  }

  if (buckets.unknown.amount > 0 && buckets.unknown.share >= 0.15) {
    findings.push({
      tone: 'watch',
      title: `${formatDelta(buckets.unknown.amount)} has no category`,
      detail: `${(buckets.unknown.share * 100).toFixed(0)}% of outflow is unlabelled, so it cannot be planned or cut.`,
      action: 'Name each line before the amount — "Gym, 45" beats "Misc, 45".',
    });
  }

  const chatty = categories.find((c) => c.group === 'want' && c.share >= 0.08);
  if (chatty) {
    findings.push({
      tone: 'tip',
      title: `${chatty.name} works out to ${formatDelta(chatty.amount / DAY_DIVISOR)} a day`,
      detail: `${formatDelta(chatty.amount)} a month is ${(chatty.share * 100).toFixed(0)}% of outflow — decide whether it still feels worth it at daily scale.`,
    });
  }

  if (items.length === 1) {
    findings.push({
      tone: 'tip',
      title: 'One line is too coarse to analyse',
      detail: 'Averages and percentages only become meaningful once spending is split into categories.',
      action: 'Break the big lines apart: groceries separate from dining out, rent separate from utilities.',
    });
  } else if (items.length < 4) {
    findings.push({
      tone: 'tip',
      title: 'Add the small categories too',
      detail: `Averaging ${formatDelta(averageItem)} per line across ${items.length} lines usually means subscriptions and one-offs are missing.`,
    });
  }

  if (people > 1) {
    findings.push({
      tone: 'tip',
      title: `Split ${people} ways, each person carries ${formatDelta(total / people)}`,
      detail: `That is ${formatDelta(total / people / DAY_DIVISOR)} a day each.`,
    });
  }

  return findings;
}

function formatDelta(value) {
  const abs = Math.abs(Number(value) || 0);
  const rounded = abs >= 1000 ? Math.round(abs) : Math.round(abs * 100) / 100;
  return `${value < 0 ? '-' : ''}$${rounded.toLocaleString('en-US', { minimumFractionDigits: rounded % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Full analysis of a month of expenses. `income` and `people` are optional. */
export function analyzeExpenses({ items = [], income = 0, people = 1 } = {}) {
  const clean = items
    .map((item) => ({ ...item, amount: Number(item?.amount) || 0 }))
    .filter((item) => item.amount > 0);
  const total = clean.reduce((sum, item) => sum + item.amount, 0);
  if (!clean.length || total <= 0) return null;

  const merged = new Map();
  clean.forEach((item) => {
    const kind = classifyName(item.name);
    const key = item.name.trim().toLowerCase();
    const bucketKey = `${key}|${kind.label}`;
    const existing = merged.get(bucketKey);
    if (existing) {
      existing.amount += item.amount;
      existing.count += 1;
    } else {
      merged.set(bucketKey, {
        name: item.name.trim(),
        amount: item.amount,
        count: 1,
        group: kind.group,
        label: kind.label,
        recurring: kind.recurring,
      });
    }
  });

  const categories = [...merged.values()]
    .map((category) => ({ ...category, share: shareOf(category.amount, total) }))
    .sort((a, b) => b.amount - a.amount);

  const buckets = {};
  [['needs', 'need'], ['wants', 'want'], ['savings', 'saving'], ['unknown', 'unknown']].forEach(([key, group]) => {
    const amount = categories.filter((c) => c.group === group).reduce((sum, c) => sum + c.amount, 0);
    buckets[key] = { amount, share: shareOf(amount, total), groupLabel: GROUP_LABEL[group] };
  });

  const fixedAmount = categories.filter((c) => c.recurring).reduce((sum, c) => sum + c.amount, 0);
  const fixedShare = shareOf(fixedAmount, total);
  const headcount = Math.max(1, Number(people) || 1);
  const incomeValue = Number(income) > 0 ? Number(income) : 0;
  const savings = incomeValue ? incomeValue - total : 0;
  const savingsRate = incomeValue ? savings / incomeValue : null;
  const hhi = categories.reduce((sum, c) => sum + c.share ** 2, 0);
  const evenness = categories.length > 1
    ? clamp01((1 - hhi) / (1 - 1 / categories.length))
    : 0;
  const topCategory = categories[0] || null;

  const scoreParts = buildScoreParts({
    incomeValue,
    savingsRate: savingsRate ?? 0,
    needsShare: buckets.needs.share,
    wantsShare: buckets.wants.share,
    unknownShare: buckets.unknown.share,
    evenness,
    itemCount: clean.length,
  });
  const weightApplied = scoreParts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(scoreParts.reduce((sum, part) => sum + part.weight * clamp01(part.earned), 0) / Math.max(1, weightApplied) * 100);

  const benchmarks = incomeValue ? [
    { key: 'need', label: 'Needs', target: TARGET_NEEDS, actual: buckets.needs.share, amount: buckets.needs.amount, guide: incomeValue * TARGET_NEEDS },
    { key: 'want', label: 'Wants', target: TARGET_WANTS, actual: buckets.wants.share, amount: buckets.wants.amount, guide: incomeValue * TARGET_WANTS },
    { key: 'saving', label: 'Savings', target: TARGET_SAVINGS, actual: buckets.savings.share, amount: buckets.savings.amount, guide: incomeValue * TARGET_SAVINGS },
  ] : [];

  return {
    total,
    items: clean,
    categories,
    buckets,
    benchmarks,
    scoreParts,
    score,
    grade: score >= 80 ? 'Strong' : score >= 62 ? 'Steady' : score >= 45 ? 'Stretchy' : 'At risk',
    confidence: scoreParts.length >= 6 ? 'high' : 'partial',
    averageItem: total / clean.length,
    perPerson: total / headcount,
    perDay: total / DAY_DIVISOR,
    perPersonPerDay: total / headcount / DAY_DIVISOR,
    people: headcount,
    income: incomeValue,
    savings,
    savingsRate,
    expenseRatio: incomeValue ? total / incomeValue : null,
    fixedAmount,
    fixedShare,
    variableAmount: total - fixedAmount,
    variableShare: 1 - fixedShare,
    topCategory,
    topShare: topCategory ? topCategory.share : 0,
    evenness,
    largest: topCategory,
    smallest: categories[categories.length - 1] || null,
    wantsTrimmed: Math.max(0, buckets.wants.amount - total * TARGET_WANTS),
    findings: buildFindings({
      incomeValue,
      total,
      items: clean,
      categories,
      buckets,
      savingsRate: savingsRate ?? 0,
      fixedShare,
      topCategory,
      averageItem: total / clean.length,
      perDay: total / DAY_DIVISOR,
      people: headcount,
    }),
  };
}

export const EXPENSE_GROUP_LABEL = GROUP_LABEL;

/** The 50/30/20 guideline, shared by the analyzer and the budget planner. */
export const BUDGET_GUIDE = [
  { key: 'need', label: 'Needs', target: TARGET_NEEDS },
  { key: 'want', label: 'Wants', target: TARGET_WANTS },
  { key: 'saving', label: 'Savings & investing', target: TARGET_SAVINGS },
];
