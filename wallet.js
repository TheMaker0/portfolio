const STORAGE_KEY = 'swift-pass-wallet-v1';
const ACTIVE_DATE_KEY = 'swift-pass-active-date-v1';
const CURRENCY = 'PHP';
const CATEGORY_ICONS = {
  Food: '🍴', Transport: '🚌', Bills: '▤', Shopping: '🛍', Health: '✚',
  Entertainment: '🎮', Other: '•••', Freelance: '↗', Salary: '₱', Gift: '✦',
  Savings: '◎'
};
const CATEGORY_COLORS = {
  Food: '#0b9a6a', Transport: '#4389f5', Shopping: '#ffb648',
  Bills: '#f05262', Health: '#8762e9', Entertainment: '#12a6b5',
  Other: '#819088', Freelance: '#0b9a6a', Salary: '#4389f5', Gift: '#8762e9'
};
const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gift', 'Other'];
const GOAL_ICONS = { motorcycle: '🏍', laptop: '💻', shield: '✚', plane: '✈', home: '⌂', other: '◎' };
const $ = (selector, root = document) => root.querySelector(selector);
const appContent = $('#app-content');
const dialog = $('#action-dialog');
const toast = $('#toast');
let database;
let currentView = 'home';
let transactionFilter = 'all';
let transactionDateMode = 'all';
let summaryPeriod = 'week';
let selectedDate = todayISO();
let toastTimer;
let receiptTimer;

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function chooseDate(date) {
  selectedDate = date;
  transactionDateMode = 'selected';
  try {
    localStorage.setItem(ACTIVE_DATE_KEY, selectedDate);
  } catch (error) {
    console.warn('The selected wallet date could not be saved.', error);
  }
}

function fallbackDatabase() {
  return {
    schemaVersion: 1,
    currency: CURRENCY,
    openingBalance: 2770,
    transactions: [
      { id: 'seed-income-1', type: 'income', category: 'Freelance', title: 'Project payment', note: 'Website project', amount: 1000, date: todayISO(), time: '09:00' },
      { id: 'seed-expense-1', type: 'expense', category: 'Food', title: 'Lunch', note: '', amount: 150, date: todayISO(), time: '12:30' },
      { id: 'seed-expense-2', type: 'expense', category: 'Transport', title: 'Tricycle', note: '', amount: 70, date: todayISO(), time: '10:15' },
      { id: 'seed-expense-3', type: 'expense', category: 'Shopping', title: 'Groceries', note: '', amount: 100, date: todayISO(), time: '08:45' }
    ],
    goals: [
      { id: 'goal-motorcycle', name: 'Motorcycle', icon: 'motorcycle', target: 50000, saved: 12450, color: 'green' },
      { id: 'goal-laptop', name: 'Laptop Upgrade', icon: 'laptop', target: 30000, saved: 8000, color: 'blue' },
      { id: 'goal-emergency', name: 'Emergency Fund', icon: 'shield', target: 20000, saved: 6000, color: 'violet' }
    ]
  };
}

function normalizeSeed(data) {
  if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.goals)) {
    throw new Error('The wallet JSON data has an invalid structure.');
  }
  const seed = JSON.parse(JSON.stringify(data));
  seed.transactions.forEach((transaction) => {
    if (transaction.id.startsWith('seed-')) transaction.date = todayISO();
  });
  return seed;
}

async function loadDatabase() {
  try {
    const savedDate = localStorage.getItem(ACTIVE_DATE_KEY);
    if (savedDate && savedDate <= todayISO()) selectedDate = savedDate;
  } catch (error) {
    console.warn('The selected wallet date could not be restored.', error);
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.transactions) && Array.isArray(parsed.goals)) {
        database = parsed;
        return;
      }
    }
  } catch (error) {
    console.warn('Saved wallet data could not be read.', error);
  }

  try {
    const response = await fetch('wallet-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Wallet data request failed (${response.status}).`);
    database = normalizeSeed(await response.json());
  } catch (error) {
    database = fallbackDatabase();
    console.info('Using the built-in demo data. Serve the folder over HTTP to load wallet-data.json.', error);
  }
  persistDatabase();
}

function persistDatabase() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  } catch (error) {
    console.warn('Wallet changes could not be saved in browser storage.', error);
    showToast('Browser storage is unavailable. Changes may not persist after closing this page.');
  }
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: database?.currency || CURRENCY,
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
}

function totalBalance() {
  return database.openingBalance + database.transactions.reduce((balance, transaction) => {
    return balance + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
  }, 0);
}

function dateLabel(dateString, options = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-PH', options).format(new Date(`${dateString}T12:00:00`));
}

function timeLabel(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function sortedTransactions(list = database.transactions) {
  return [...list].sort((a, b) => `${b.date}T${b.time || '00:00'}`.localeCompare(`${a.date}T${a.time || '00:00'}`));
}

function balancesByDate() {
  let balance = database.openingBalance;
  const dailyBalances = new Map();
  const chronological = [...database.transactions].sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
  chronological.forEach((transaction) => {
    balance += transaction.type === 'income' ? transaction.amount : -transaction.amount;
    dailyBalances.set(transaction.date, balance);
  });
  return dailyBalances;
}

function balanceAtDate(date) {
  return database.openingBalance + database.transactions
    .filter((transaction) => transaction.date <= date)
    .reduce((balance, transaction) => balance + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0);
}

function transactionsOnDate(date, type) {
  return database.transactions.filter((transaction) => {
    return transaction.date === date && (!type || transaction.type === type);
  });
}

function sumTransactions(transactions) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function setHeading(title, eyebrow) {
  $('#page-title').textContent = title;
  $('#page-eyebrow').textContent = eyebrow;
}

function updateNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === currentView);
  });
}

function renderTransactionRow(transaction, withDate = false) {
  const isIncome = transaction.type === 'income';
  const icon = CATEGORY_ICONS[transaction.category] || (isIncome ? '↗' : '•••');
  const sign = isIncome ? '+' : '−';
  const date = withDate ? `<span class="sp-transaction-date">${dateLabel(transaction.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : '';
  const deleteButton = withDate ? `<button class="sp-delete-button" type="button" data-delete-transaction="${escapeHTML(transaction.id)}" aria-label="Delete ${escapeHTML(transaction.title || transaction.category)}" title="Delete transaction"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg></button>` : '';
  return `<article class="sp-transaction-row">
    <span class="sp-category-icon ${isIncome ? 'income' : ''}" aria-hidden="true">${icon}</span>
    <span><span class="sp-transaction-title">${escapeHTML(transaction.title || transaction.category)}</span><span class="sp-transaction-meta">${escapeHTML(transaction.category)}${transaction.note ? ` · ${escapeHTML(transaction.note)}` : ''} · ${timeLabel(transaction.time)}</span></span>
    ${date}
    <span class="sp-transaction-amount ${isIncome ? 'income' : 'expense'}">${sign} ${money(transaction.amount)}</span>
    ${deleteButton}
  </article>`;
}

function goalProgress(goal) {
  return Math.min(100, Math.round((goal.saved / goal.target) * 100));
}

function goalIcon(goal) {
  return GOAL_ICONS[goal.icon] || GOAL_ICONS.other;
}

function renderGoalRow(goal) {
  const progress = goalProgress(goal);
  return `<div class="sp-goal-row">
    <span class="sp-goal-icon ${escapeHTML(goal.color)}" aria-hidden="true">${goalIcon(goal)}</span>
    <span class="sp-goal-details"><span class="sp-goal-name">${escapeHTML(goal.name)}</span><span class="sp-goal-amount">${money(goal.saved)} / ${money(goal.target)}</span><span class="sp-progress ${escapeHTML(goal.color)}"><span style="width:${progress}%"></span></span></span>
    <span class="sp-goal-percent">${progress}%</span>
  </div>`;
}

function renderHome() {
  const income = sumTransactions(transactionsOnDate(selectedDate, 'income'));
  const expenses = sumTransactions(transactionsOnDate(selectedDate, 'expense'));
  const recent = sortedTransactions(transactionsOnDate(selectedDate)).slice(0, 4);
  const goals = database.goals.slice(0, 3);
  const selectedDateLabel = selectedDate === todayISO() ? "Today's" : dateLabel(selectedDate, { month: 'short', day: 'numeric' });
  const recentRows = recent.length ? recent.map((transaction) => renderTransactionRow(transaction)).join('') : '<p class="sp-empty">Your activity will appear here.</p>';
  const goalRows = goals.length ? goals.map(renderGoalRow).join('') : '<p class="sp-empty">Create a savings goal to get started.</p>';

  appContent.innerHTML = `<div class="sp-dashboard-grid">
    <div class="sp-column">
      <section class="sp-balance-card" aria-label="All-time and selected-day balances">
        <p class="sp-balance-label">Overall balance</p>
        <p class="sp-balance-value">${money(totalBalance())}</p>
        <div class="sp-day-balance"><span><span class="sp-day-balance-label">Balance on selected date</span><span class="sp-day-balance-date">${dateLabel(selectedDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></span><strong class="sp-day-balance-value">${money(balanceAtDate(selectedDate))}</strong></div>
        <div class="sp-balance-bottom"><span>Across all recorded dates</span><strong>PHP · Personal</strong></div>
      </section>
      <div class="sp-metrics">
        <article class="sp-metric-card"><div class="sp-metric-top"><span>${selectedDateLabel} income</span><span class="sp-metric-icon income" aria-hidden="true">&#8593;</span></div><p class="sp-metric-value income">+ ${money(income)}</p></article>
        <article class="sp-metric-card"><div class="sp-metric-top"><span>${selectedDateLabel} expense</span><span class="sp-metric-icon expense" aria-hidden="true">&#8595;</span></div><p class="sp-metric-value expense">− ${money(expenses)}</p></article>
      </div>
      <section class="sp-panel">
        <div class="sp-panel-heading"><h2>Quick actions</h2></div>
        <div class="sp-actions">
          <button class="sp-action-tile" type="button" data-action="add-income"><span class="sp-action-icon" aria-hidden="true">+</span><span><strong>Add money</strong><small>Record income</small></span></button>
          <button class="sp-action-tile" type="button" data-action="add-expense"><span class="sp-action-icon expense" aria-hidden="true">−</span><span><strong>Add expense</strong><small>Track spending</small></span></button>
        </div>
      </section>
      <section class="sp-panel">
        <div class="sp-panel-heading"><h2>Activity · ${dateLabel(selectedDate, { month: 'short', day: 'numeric' })}</h2><button class="sp-text-button" type="button" data-view="transactions">View all</button></div>
        <div class="sp-transaction-list">${recentRows}</div>
      </section>
    </div>
    <div class="sp-column">
      <section class="sp-panel">
        <div class="sp-panel-heading"><h2>Savings goals</h2><button class="sp-text-button" type="button" data-view="goals">View all</button></div>
        <div class="sp-goal-list">${goalRows}</div>
      </section>
      <section class="sp-panel">
        <div class="sp-panel-heading"><h2>Keep it moving</h2></div>
        <p style="margin:0;color:var(--muted);font-size:11px;line-height:1.7">Small steps make big dreams happen. Add to a goal whenever you're ready.</p>
        <button class="sp-secondary-button" style="margin-top:13px" type="button" data-view="goals">Open savings goals <span aria-hidden="true">&#8594;</span></button>
      </section>
    </div>
  </div>`;
}

function renderTransactions() {
  const visible = sortedTransactions().filter((transaction) => {
    const matchesType = transactionFilter === 'all' || transaction.type === transactionFilter;
    const matchesDate = transactionDateMode === 'all' || transaction.date === selectedDate;
    return matchesType && matchesDate;
  });
  const dailyBalances = balancesByDate();
  const groups = new Map();
  visible.forEach((transaction) => {
    if (!groups.has(transaction.date)) groups.set(transaction.date, []);
    groups.get(transaction.date).push(transaction);
  });
  const rows = groups.size ? [...groups.entries()].map(([date, transactions]) => {
    const dayName = date === todayISO() ? 'Today' : dateLabel(date, { weekday: 'long' });
    return `<section class="sp-date-group">
      <header class="sp-date-group-heading"><strong>${dayName} · ${dateLabel(date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span class="sp-date-balance">Balance at end of day<strong>${money(dailyBalances.get(date) ?? database.openingBalance)}</strong></span></header>
      <div class="sp-transaction-list">${transactions.map((transaction) => renderTransactionRow(transaction, true)).join('')}</div>
    </section>`;
  }).join('') : '<p class="sp-empty">No transactions in this view yet.</p>';
  appContent.innerHTML = `<div class="sp-section-heading"><div><h2>All transactions</h2><p>${visible.length} shown · ${database.transactions.length} total</p><span class="sp-overall-balance">Overall balance <strong>${money(totalBalance())}</strong></span></div><div class="sp-actions" style="display:flex;grid-template-columns:none"><button class="sp-secondary-button" type="button" data-action="add-income">+ Money</button><button class="sp-primary-button" type="button" data-action="add-expense">+ Expense</button></div></div>
    <div class="sp-filter-bar" role="group" aria-label="Filter transaction dates">
      <button class="sp-filter-button ${transactionDateMode === 'selected' ? 'is-active' : ''}" type="button" data-date-mode="selected">${dateLabel(selectedDate, { month: 'short', day: 'numeric' })}</button>
      <button class="sp-filter-button ${transactionDateMode === 'all' ? 'is-active' : ''}" type="button" data-date-mode="all">All dates</button>
      <span class="sp-date-balance">Balance on selected date<strong>${money(balanceAtDate(selectedDate))}</strong></span>
    </div>
    <div class="sp-filter-bar" role="group" aria-label="Filter transactions">
      ${[['all','All'],['income','Income'],['expense','Expenses'],['transfer','Savings']].map(([key,label]) => `<button class="sp-filter-button ${transactionFilter === key ? 'is-active' : ''}" type="button" data-filter="${key}">${label}</button>`).join('')}
    </div>
    <section class="sp-panel sp-transactions-panel">${rows}</section>`;
}

function renderGoals() {
  const cards = database.goals.length ? database.goals.map((goal) => {
    const progress = goalProgress(goal);
    return `<article class="sp-goal-card">
      <div class="sp-goal-card-top"><span class="sp-goal-icon ${escapeHTML(goal.color)}" aria-hidden="true">${goalIcon(goal)}</span><span class="sp-goal-percent">${progress}%</span></div>
      <div><h3>${escapeHTML(goal.name)}</h3><p class="sp-goal-amount">${money(goal.saved)} saved of ${money(goal.target)}</p><span class="sp-progress ${escapeHTML(goal.color)}"><span style="width:${progress}%"></span></span></div>
      <button class="sp-primary-button" type="button" data-action="contribute" data-goal-id="${escapeHTML(goal.id)}">+ Add money</button>
    </article>`;
  }).join('') : '<section class="sp-panel"><p class="sp-empty">No goals yet. Create one and start saving.</p></section>';
  appContent.innerHTML = `<div class="sp-section-heading"><div><h2>Your savings goals</h2><p>Give your next big thing a name and a target.</p></div><button class="sp-primary-button" type="button" data-action="create-goal">+ Create goal</button></div><div class="sp-goal-grid">${cards}</div>`;
}

function periodDates(period) {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const anchorDate = new Date(year, month - 1, day);
  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  if (period === 'month') start.setDate(1);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function withinPeriod(dateString, period) {
  const date = new Date(`${dateString}T12:00:00`);
  const { start, end } = periodDates(period);
  return date >= start && date <= end;
}

function getPeriodTransactions(period, type) {
  return database.transactions.filter((transaction) => withinPeriod(transaction.date, period) && transaction.type === type);
}

function renderSummary() {
  const expenses = getPeriodTransactions(summaryPeriod, 'expense');
  const income = getPeriodTransactions(summaryPeriod, 'income');
  const spent = sumTransactions(expenses);
  const earned = sumTransactions(income);
  const grouped = Object.entries(expenses.reduce((result, transaction) => {
    result[transaction.category] = (result[transaction.category] || 0) + transaction.amount;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
  const totalForChart = grouped.reduce((sum, [, amount]) => sum + amount, 0);
  let cursor = 0;
  const segments = grouped.map(([category, amount]) => {
    const start = cursor;
    cursor += totalForChart ? amount / totalForChart * 100 : 0;
    return `${CATEGORY_COLORS[category] || '#819088'} ${start}% ${cursor}%`;
  });
  const gradient = segments.length ? `conic-gradient(${segments.join(',')})` : 'conic-gradient(#e9efec 0 100%)';
  const legend = grouped.length ? grouped.map(([category, amount]) => {
    const percent = Math.round(amount / totalForChart * 100);
    return `<div class="sp-legend-row"><span class="sp-legend-dot" style="background:${CATEGORY_COLORS[category] || '#819088'}"></span><span>${escapeHTML(category)} <small>${percent}%</small></span><strong>${money(amount)}</strong></div>`;
  }).join('') : '<p class="sp-empty">Add expenses to see your spending breakdown.</p>';
  const weekBars = Array.from({ length: 7 }, (_, index) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - (6 - index));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayTotal = sumTransactions(database.transactions.filter((transaction) => transaction.date === iso && transaction.type === 'expense'));
    const height = dayTotal ? Math.max(8, Math.round(dayTotal / Math.max(1, ...Array.from({ length: 7 }, (_, dayIndex) => {
      const compare = new Date(year, month - 1, day);
      compare.setDate(compare.getDate() - (6 - dayIndex));
      const compareIso = `${compare.getFullYear()}-${String(compare.getMonth() + 1).padStart(2, '0')}-${String(compare.getDate()).padStart(2, '0')}`;
      return sumTransactions(database.transactions.filter((transaction) => transaction.date === compareIso && transaction.type === 'expense'));
    })) * 100)) : 4;
    return `<div class="sp-bar-column"><span class="sp-bar" style="height:${height}%"></span><small>${new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date)}</small></div>`;
  }).join('');
  const rangeName = {
    day: `on ${dateLabel(selectedDate, { month: 'short', day: 'numeric' })}`,
    week: 'in the selected week',
    month: 'in the selected month'
  }[summaryPeriod];

  appContent.innerHTML = `<div class="sp-summary-top">
    <section class="sp-summary-total"><p>Total spent ${rangeName}</p><strong>${money(spent)}</strong><small>Income received: ${money(earned)}</small></section>
    <section class="sp-panel"><div class="sp-panel-heading"><h2>Time period</h2></div><div class="sp-segmented" role="group" aria-label="Summary period">${[['day','Daily'],['week','Weekly'],['month','Monthly']].map(([key,label]) => `<button class="${summaryPeriod === key ? 'is-active' : ''}" type="button" data-period="${key}">${label}</button>`).join('')}</div><p style="margin:12px 0 0;color:var(--muted);font-size:10px">Available balance: <strong style="color:var(--ink)">${money(totalBalance())}</strong></p></section>
  </div>
  <div class="sp-column">
    <section class="sp-panel"><div class="sp-panel-heading"><h2>Where it goes</h2></div><div class="sp-chart-layout"><div class="sp-donut" role="img" aria-label="Expense breakdown" style="background:${gradient}"><span class="sp-donut-label"><small>Total expenses</small><strong>${money(spent)}</strong></span></div><div class="sp-legend">${legend}</div></div></section>
    <section class="sp-panel"><div class="sp-panel-heading"><h2>Spending trend</h2><span style="color:var(--muted);font-size:9px">Last 7 days</span></div><div class="sp-bar-chart">${weekBars}</div></section>
  </div>`;
}

function render() {
  updateNavigation();
  const date = new Date();
  const activeDateLabel = dateLabel(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' });
  const datePicker = $('#active-date');
  datePicker.value = selectedDate;
  datePicker.max = todayISO();
  const heading = {
    home: [`Good ${date.getHours() < 12 ? 'morning' : date.getHours() < 18 ? 'afternoon' : 'evening'}, Mark`, activeDateLabel],
    transactions: ['Transactions', `WALLET ACTIVITY · ${activeDateLabel.toUpperCase()}`],
    goals: ['Savings goals', 'PLAN FOR WHAT IS NEXT'],
    summary: ['Spending summary', `YOUR MONEY · ${activeDateLabel.toUpperCase()}`]
  }[currentView];
  setHeading(heading[0], heading[1]);
  if (currentView === 'transactions') renderTransactions();
  else if (currentView === 'goals') renderGoals();
  else if (currentView === 'summary') renderSummary();
  else renderHome();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function showReceipt({ type, category, title, amount, date }) {
  const isIncome = type === 'income';
  clearTimeout(receiptTimer);
  dialog.setAttribute('aria-labelledby', 'receipt-title');
  dialog.innerHTML = `<article class="sp-receipt ${isIncome ? 'income' : 'expense'}" aria-labelledby="receipt-title">
    <div class="sp-receipt-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg></div>
    <p class="sp-receipt-kicker">SWIFT PASS · TRANSACTION SAVED</p>
    <h2 id="receipt-title">${isIncome ? 'Money added' : 'Expense recorded'}</h2>
    <p class="sp-receipt-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'} ${money(amount)}</p>
    <div class="sp-receipt-rule"></div>
    <dl class="sp-receipt-details">
      <div><dt>Description</dt><dd>${escapeHTML(title)}</dd></div>
      <div><dt>${isIncome ? 'Source' : 'Category'}</dt><dd>${escapeHTML(category)}</dd></div>
      <div><dt>Date</dt><dd>${dateLabel(date, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
      <div><dt>Time</dt><dd>${timeLabel(new Date().toTimeString().slice(0, 5))}</dd></div>
    </dl>
    <div class="sp-receipt-rule"></div>
    <div class="sp-receipt-balance"><span>${isIncome ? 'New wallet balance' : 'Balance after expense'}</span><strong>${money(totalBalance())}</strong></div>
    <button class="sp-primary-button sp-receipt-done" type="button" data-close-dialog>Done</button>
  </article>`;
  receiptTimer = setTimeout(() => {
    if (dialog.open) dialog.close();
  }, 5200);
}

function openDialog(title, description, formContent) {
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = `<div class="sp-dialog-inner"><div class="sp-dialog-heading"><div><h2 id="dialog-title">${title}</h2><p>${description}</p></div><button class="sp-dialog-close" type="button" data-close-dialog aria-label="Close dialog">&times;</button></div>${formContent}</div>`;
  dialog.showModal();
  const firstInput = $('input,select', dialog);
  if (firstInput) firstInput.focus();
}

function openTransactionDialog(type) {
  const isIncome = type === 'income';
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  openDialog(isIncome ? 'Add money' : 'Add expense', isIncome ? 'Record money added to your wallet.' : 'Add a purchase to your transaction history.', `<form class="sp-form" id="wallet-form" data-form-kind="transaction" data-type="${type}">
    <label class="sp-field">Amount<input class="sp-amount-input" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" inputmode="decimal" required /></label>
    <label class="sp-field">${isIncome ? 'Source' : 'Category'}<select name="category" required>${categories.map((category) => `<option value="${category}">${category}</option>`).join('')}</select></label>
    <label class="sp-field">${isIncome ? 'Description' : 'What was it for?'}<input name="title" maxlength="60" placeholder="${isIncome ? 'e.g. Salary, freelance work' : 'e.g. Lunch with friends'}" required /></label>
    <label class="sp-field">Date<input name="date" type="date" value="${selectedDate}" max="${todayISO()}" required /></label>
    <label class="sp-field">Note <span style="font-weight:400;color:var(--muted)">(optional)</span><textarea name="note" rows="2" maxlength="120" placeholder="Add a note"></textarea></label>
    <p class="sp-form-error" id="form-error" aria-live="polite"></p>
    <div class="sp-form-actions"><button class="sp-secondary-button" type="button" data-close-dialog>Cancel</button><button class="sp-primary-button" type="submit">Save ${isIncome ? 'money' : 'expense'}</button></div>
  </form>`);
}

function openGoalDialog() {
  openDialog('Create a goal', 'Give your savings plan a name and a target amount.', `<form class="sp-form" id="wallet-form" data-form-kind="goal">
    <label class="sp-field">Goal name<input name="name" maxlength="50" placeholder="e.g. New laptop" required /></label>
    <label class="sp-field">Target amount<input class="sp-amount-input" name="target" type="number" min="1" step="0.01" placeholder="0.00" inputmode="decimal" required /></label>
    <label class="sp-field">Choose an icon<select name="icon"><option value="motorcycle">Motorcycle</option><option value="laptop">Laptop</option><option value="shield">Emergency fund</option><option value="plane">Travel</option><option value="home">Home</option><option value="other">Other</option></select></label>
    <p class="sp-form-error" id="form-error" aria-live="polite"></p>
    <div class="sp-form-actions"><button class="sp-secondary-button" type="button" data-close-dialog>Cancel</button><button class="sp-primary-button" type="submit">Create goal</button></div>
  </form>`);
}

function openContributionDialog(goalId) {
  const goal = database.goals.find((item) => item.id === goalId);
  if (!goal) return;
  const available = Math.max(0, balanceAtDate(selectedDate));
  openDialog(`Add to ${escapeHTML(goal.name)}`, `You have ${money(available)} available on the selected date.`, `<form class="sp-form" id="wallet-form" data-form-kind="contribution" data-goal-id="${escapeHTML(goal.id)}">
    <label class="sp-field">Contribution<input class="sp-amount-input" name="amount" type="number" min="0.01" max="${available}" step="0.01" placeholder="0.00" inputmode="decimal" required /></label>
    <label class="sp-field">Date<input name="date" type="date" value="${selectedDate}" max="${todayISO()}" required /></label>
    <p class="sp-form-error" id="form-error" aria-live="polite"></p>
    <div class="sp-form-actions"><button class="sp-secondary-button" type="button" data-close-dialog>Cancel</button><button class="sp-primary-button" type="submit">Add to goal</button></div>
  </form>`);
}

function addTransaction({ type, category, title, note, amount, date = selectedDate }) {
  const transaction = {
    id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type, category, title, note, amount: Number(amount), date,
    time: new Date().toTimeString().slice(0, 5)
  };
  database.transactions.push(transaction);
  persistDatabase();
  return transaction;
}

function handleFormSubmit(form) {
  const data = new FormData(form);
  const kind = form.dataset.formKind;
  const errorElement = $('#form-error', form);
  if (kind === 'transaction') {
    const amount = Number(data.get('amount'));
    const type = form.dataset.type;
    if (!Number.isFinite(amount) || amount <= 0) {
      errorElement.textContent = 'Enter an amount greater than zero.';
      return;
    }
    const date = data.get('date');
    if (type === 'expense' && amount > balanceAtDate(date)) {
      errorElement.textContent = 'This is more than the available balance on that date.';
      return;
    }
    addTransaction({ type, category: data.get('category'), title: data.get('title').trim(), note: data.get('note').trim(), amount, date });
    chooseDate(date);
    render();
    showReceipt({ type, category: data.get('category'), title: data.get('title').trim(), amount, date });
    return;
  }
  if (kind === 'goal') {
    const target = Number(data.get('target'));
    const name = data.get('name').trim();
    if (!name || !Number.isFinite(target) || target <= 0) {
      errorElement.textContent = 'Enter a goal name and a target above zero.';
      return;
    }
    database.goals.unshift({ id: `goal-${Date.now()}`, name, icon: data.get('icon'), target, saved: 0, color: 'green' });
    persistDatabase();
    dialog.close();
    currentView = 'goals';
    render();
    showToast('Savings goal created.');
    return;
  }
  if (kind === 'contribution') {
    const amount = Number(data.get('amount'));
    const goal = database.goals.find((item) => item.id === form.dataset.goalId);
    if (!goal) {
      errorElement.textContent = 'That savings goal could not be found.';
      return;
    }
    const date = data.get('date');
    if (!Number.isFinite(amount) || amount <= 0 || amount > balanceAtDate(date)) {
      errorElement.textContent = 'Enter an amount within the available balance on that date.';
      return;
    }
    if (goal.saved + amount > goal.target) {
      errorElement.textContent = `This goal needs only ${money(goal.target - goal.saved)} more.`;
      return;
    }
    goal.saved += amount;
    addTransaction({ type: 'transfer', category: 'Savings', title: `${goal.name} contribution`, note: '', amount, date });
    chooseDate(date);
    dialog.close();
    render();
    showToast('Your savings goal was updated.');
  }
}

async function resetDemo() {
  if (!window.confirm('Reset this wallet to its original demo data? Your saved demo changes will be removed.')) return;
  try {
    const response = await fetch('wallet-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Wallet JSON could not be loaded.');
    database = normalizeSeed(await response.json());
  } catch {
    database = fallbackDatabase();
  }
  persistDatabase();
  currentView = 'home';
  transactionFilter = 'all';
  transactionDateMode = 'all';
  summaryPeriod = 'week';
  selectedDate = todayISO();
  try { localStorage.removeItem(ACTIVE_DATE_KEY); } catch {}
  render();
  showToast('Demo wallet reset.');
}

document.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-transaction]');
  if (deleteButton) {
    const transaction = database.transactions.find((item) => item.id === deleteButton.dataset.deleteTransaction);
    if (!transaction || !window.confirm(`Delete "${transaction.title || transaction.category}"? This will update the balances.`)) return;
    if (transaction.type === 'transfer' && transaction.category === 'Savings') {
      const goal = database.goals.find((item) => transaction.title === `${item.name} contribution`);
      if (goal) goal.saved = Math.max(0, goal.saved - transaction.amount);
    }
    database.transactions = database.transactions.filter((item) => item.id !== transaction.id);
    persistDatabase();
    render();
    showToast(`Deleted. Overall: ${money(totalBalance())} · ${dateLabel(selectedDate, { month: 'short', day: 'numeric' })}: ${money(balanceAtDate(selectedDate))}`);
    return;
  }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    currentView = viewButton.dataset.view;
    render();
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'add-income') openTransactionDialog('income');
    if (action === 'add-expense') openTransactionDialog('expense');
    if (action === 'create-goal') openGoalDialog();
    if (action === 'contribute') openContributionDialog(actionButton.dataset.goalId);
    return;
  }
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) {
    transactionFilter = filterButton.dataset.filter;
    renderTransactions();
    return;
  }
  const dateModeButton = event.target.closest('[data-date-mode]');
  if (dateModeButton) {
    transactionDateMode = dateModeButton.dataset.dateMode;
    renderTransactions();
    return;
  }
  const periodButton = event.target.closest('[data-period]');
  if (periodButton) {
    summaryPeriod = periodButton.dataset.period;
    renderSummary();
    return;
  }
  if (event.target.closest('[data-close-dialog]')) dialog.close();
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'wallet-form') {
    event.preventDefault();
    if (event.target.reportValidity()) handleFormSubmit(event.target);
  }
});

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => clearTimeout(receiptTimer));
$('#active-date').addEventListener('change', (event) => {
  if (!event.target.value) return;
  chooseDate(event.target.value > todayISO() ? todayISO() : event.target.value);
  render();
});
$('#reset-demo').addEventListener('click', resetDemo);

async function startWallet() {
  appContent.innerHTML = '<section class="sp-panel"><p class="sp-empty">Loading your wallet...</p></section>';
  await loadDatabase();
  render();
}

startWallet();
