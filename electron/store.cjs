const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const DATA_FILE_NAME = 'data.json'
const DEFAULT_SETTINGS = {
  trailingAverageMonths: 6,
  // 'ledger' (light) or 'ledger-dark'.
  theme: 'ledger',
  // Affordability-calculator defaults (Settings → Affordability Defaults).
  // grossMonthlyIncome is intentionally separate from anything derived
  // from logged snapshot income — that figure is whatever actually lands
  // in the user's spendable accounts, which may already exclude pre-tax
  // deductions or automatic transfers (401k, a Roth contribution taken
  // before the paycheck even hits checking, etc.), so it's not a reliable
  // stand-in for gross/pre-tax income.
  // grossMonthlyIncome kept for backwards compat — superseded by
  // grossIncomeSources when that array is non-empty.
  grossMonthlyIncome: null,
  // Named gross income sources for the affordability calculator.
  // Allows multiple earners (e.g. Riley + Katie) to be stored separately
  // so the calculator pre-populates with one row per person.
  grossIncomeSources: [],
  defaultMortgageRatePercent: null,
  defaultLoanTermYears: null,
  defaultPropertyTaxRatePercent: null,
  defaultAnnualInsurance: null,
  defaultMonthlyHOA: null,
  defaultOtherMonthlyDebt: null,
  defaultClosingCostsPercent: null,
  // Annual PMI rate as a % of the loan amount — only actually applied by
  // the calculator when down payment is under 20%. Null means "use the
  // calculator's own built-in default," same unset convention as the
  // other affordability fields here.
  defaultPmiRatePercent: null,
}

// Seeds the categories list on first run, so there's something to pick
// from (and edit/rename/delete via Settings → Categories) before any
// expense or card spend has been logged.
const STARTER_CATEGORIES = [
  'Rent/Mortgage',
  'Utilities',
  'Groceries',
  'Transportation',
  'Insurance',
  'Subscriptions',
  'Entertainment',
  'Healthcare',
  'Personal',
]

function seedCategories() {
  return STARTER_CATEGORIES.map((name, i) => ({ id: i + 1, name, color: null }))
}

const DEFAULT_HOUSE_ACCOUNT_NAME = 'House Fund'
const DEFAULT_EMERGENCY_ACCOUNT_NAME = 'Emergency Fund'

const EMPTY_DATA = {
  version: 2,
  snapshots: [],
  scenarios: [],
  creditCards: [],
  cardBalances: [],
  settings: { ...DEFAULT_SETTINGS },
  categories: seedCategories(),
  accounts: [],
  accountBalances: [],
  forecastItems: [],
  incomeOptions: [],
}

// In-memory mirror of the JSON file, loaded lazily on first access and
// kept in sync on every write. Electron apps are single-process-per-window
// here (no worker threads touching this), so a simple module-level cache
// is safe and avoids re-reading/parsing the file on every IPC call.
let cache = null

function getDataPath() {
  // app.getPath('userData') resolves to ~/.config/<app name> on Linux,
  // ~/Library/Application Support/<app name> on macOS, and
  // %APPDATA%/<app name> on Windows. The app name is locked in main.cjs
  // via app.setName(), independent of the packaged productName.
  return path.join(app.getPath('userData'), DATA_FILE_NAME)
}

function nextId(records) {
  return records.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1
}

// ---------------------------------------------------------------------
// Migrations — run in order on every load(). Each is idempotent (checks
// its own "already done" sentinel and no-ops otherwise), so chaining them
// is safe regardless of which vintage of data.json or restored backup
// they're running against.
// ---------------------------------------------------------------------

// Step 1 (oldest): asset items used to carry forHouseFund/forEmergencyFund
// booleans, pooling everything flagged into one number with one growth-
// rate assumption per goal. This promotes those into a fundAccounts list
// + accountId tags on the asset items — the shape Fund Accounts used
// before being absorbed into the unified Accounts system in step 2 below.
// Skips entirely once step 2 has already run, since that step deletes
// fundAccounts/assetItems for good — by then there's nothing left to do.
function migrateAssetFlagsToAccounts(data) {
  if (data.fundAccounts !== null || data.accounts !== null) return data
  data.fundAccounts = []

  let houseAccountId = null
  let emergencyAccountId = null

  function ensureHouseAccount() {
    if (houseAccountId) return houseAccountId
    houseAccountId = nextId(data.fundAccounts)
    data.fundAccounts.push({
      id: houseAccountId,
      name: DEFAULT_HOUSE_ACCOUNT_NAME,
      type: 'house',
      annualReturnPercent: 0,
    })
    return houseAccountId
  }

  function ensureEmergencyAccount() {
    if (emergencyAccountId) return emergencyAccountId
    emergencyAccountId = nextId(data.fundAccounts)
    data.fundAccounts.push({
      id: emergencyAccountId,
      name: DEFAULT_EMERGENCY_ACCOUNT_NAME,
      type: 'emergency',
      annualReturnPercent: 0,
    })
    return emergencyAccountId
  }

  for (const snapshot of data.snapshots) {
    for (const item of snapshot.assetItems || []) {
      if (item.forHouseFund) {
        item.accountId = ensureHouseAccount()
      } else if (item.forEmergencyFund) {
        item.accountId = ensureEmergencyAccount()
      } else if (item.accountId === undefined) {
        item.accountId = null
      }
      delete item.forHouseFund
      delete item.forEmergencyFund
    }
  }

  return data
}

// Step 2: replaces the old freeform assetItems/debtItems arrays (retyped
// by hand every month, with no real persistent identity) and the
// fundAccounts entity (which only covered House/Emergency-tagged assets)
// with one unified Accounts system: persistent named accounts (asset or
// debt) each with their own real per-month balance log — the same pattern
// Credit Cards already used. This is the only thing that actually fixes
// "did I log this account this month" being fragile (a forgotten month
// used to silently read as a $0 balance for that account, not "unknown").
//
// Untagged asset items and all debt items have no real identity beyond
// whatever label was typed, so accounts are inferred by grouping same-
// named (trimmed, case-insensitive) items across every snapshot — the
// closest thing to a stable identity freeform text ever had. Items
// already tagged to a fund account (accountId, from step 1) keep that
// exact linkage instead, since it's already reliable. A stray completely
// empty row (no label, no amount — an unused blank line in the editor)
// is skipped rather than becoming a clutter "Untitled" account.
function migrateToUnifiedAccounts(data) {
  if (data.accounts !== null) return data
  data.accounts = []
  data.accountBalances = []

  const fundAccountIdMap = new Map()
  for (const fa of data.fundAccounts || []) {
    const newId = nextId(data.accounts)
    fundAccountIdMap.set(fa.id, newId)
    data.accounts.push({
      id: newId,
      name: fa.name,
      kind: 'asset',
      goalType: fa.type,
      annualReturnPercent: fa.annualReturnPercent || 0,
      monthlyTargetContribution: fa.monthlyTargetContribution ?? null,
      isRetirement: false,
      interestRatePercent: 0,
      minimumPayment: null,
      extraMonthlyPayment: null,
      isTransactionAccount: false,
    })
  }

  const assetLabelMap = new Map()
  const debtLabelMap = new Map()

  function ensureLabelAccount(map, label, kind) {
    const key = label.trim().toLowerCase()
    if (map.has(key)) return map.get(key)
    const newId = nextId(data.accounts)
    data.accounts.push({
      id: newId,
      name: label.trim() || (kind === 'asset' ? 'Untitled asset' : 'Untitled debt'),
      kind,
      goalType: null,
      annualReturnPercent: 0,
      monthlyTargetContribution: null,
      isRetirement: false,
      interestRatePercent: 0,
      minimumPayment: null,
      extraMonthlyPayment: null,
      isTransactionAccount: false,
    })
    map.set(key, newId)
    return newId
  }

  function addBalance(accountId, month, amount) {
    const existing = data.accountBalances.find((b) => b.accountId === accountId && b.month === month)
    if (existing) {
      existing.amount += amount
    } else {
      data.accountBalances.push({
        id: nextId(data.accountBalances),
        accountId,
        month,
        amount,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  for (const snapshot of data.snapshots) {
    for (const item of snapshot.assetItems || []) {
      const amount = Number(item.amount) || 0
      const label = (item.label || '').trim()
      if (!label && !amount) continue
      let accountId
      if (item.accountId != null && fundAccountIdMap.has(item.accountId)) {
        accountId = fundAccountIdMap.get(item.accountId)
      } else {
        accountId = ensureLabelAccount(assetLabelMap, item.label || '', 'asset')
      }
      addBalance(accountId, snapshot.month, amount)
    }
    for (const item of snapshot.debtItems || []) {
      const amount = Number(item.amount) || 0
      const label = (item.label || '').trim()
      if (!label && !amount) continue
      const accountId = ensureLabelAccount(debtLabelMap, item.label || '', 'debt')
      addBalance(accountId, snapshot.month, amount)
    }
    delete snapshot.assetItems
    delete snapshot.debtItems
  }

  delete data.fundAccounts
  return data
}

function load() {
  if (cache) return cache
  const file = getDataPath()
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    cache = {
      version: parsed.version ?? 2,
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
      creditCards: Array.isArray(parsed.creditCards) ? parsed.creditCards : [],
      cardBalances: Array.isArray(parsed.cardBalances) ? parsed.cardBalances : [],
      // Older data.json files (written before settings/categories/accounts
      // existed) won't have these keys — fall back to defaults rather
      // than treating it as a parse failure.
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      categories: Array.isArray(parsed.categories) ? parsed.categories : seedCategories(),
      fundAccounts: Array.isArray(parsed.fundAccounts) ? parsed.fundAccounts : null,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : null,
      accountBalances: Array.isArray(parsed.accountBalances) ? parsed.accountBalances : [],
      // "Planning ahead" forecast items (Monthly Entry → Planning ahead) —
      // independent of any month's actual snapshot, see the Accounts/
      // Forecasting section below.
      forecastItems: Array.isArray(parsed.forecastItems) ? parsed.forecastItems : [],
      // Managed list of income source labels (Settings → Income Options) —
      // same pattern as categories, just for the Income side of Monthly
      // Entry's autocomplete. No seeded defaults (unlike categories) —
      // income sources are personal ("My Salary," "Wife Paycheck") in a
      // way generic starters wouldn't actually help with.
      incomeOptions: Array.isArray(parsed.incomeOptions) ? parsed.incomeOptions : [],
    }
  } catch (err) {
    // First run (file doesn't exist yet) or the file is unreadable/corrupt.
    // Either way, start from an empty store rather than crashing the app.
    cache = { ...EMPTY_DATA, categories: seedCategories(), fundAccounts: null, accounts: null, accountBalances: [] }
  }
  migrateAssetFlagsToAccounts(cache)
  migrateToUnifiedAccounts(cache)
  return cache
}

function persist() {
  const data = load()
  const file = getDataPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Write to a temp file then rename over the real one. The rename is
  // atomic on the same filesystem, so a crash or power loss mid-write
  // can't leave behind a half-written, corrupt data.json.
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

// ---------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------

function listSnapshots() {
  return [...load().snapshots].sort((a, b) => a.month.localeCompare(b.month))
}

function saveSnapshot(plain) {
  const data = load()
  const existing = plain.id
    ? data.snapshots.find((s) => s.id === plain.id)
    : data.snapshots.find((s) => s.month === plain.month)

  const record = {
    ...plain,
    id: existing ? existing.id : nextId(data.snapshots),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const idx = data.snapshots.findIndex((s) => s.id === record.id)
  if (idx >= 0) data.snapshots[idx] = record
  else data.snapshots.push(record)

  persist()
  return record
}

function deleteSnapshot(id) {
  const data = load()
  data.snapshots = data.snapshots.filter((s) => s.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------

function listScenarios() {
  return [...load().scenarios]
}

function saveScenario(plain) {
  const data = load()
  const existing = plain.id ? data.scenarios.find((s) => s.id === plain.id) : null
  const record = { ...plain, id: existing ? existing.id : nextId(data.scenarios) }

  const idx = data.scenarios.findIndex((s) => s.id === record.id)
  if (idx >= 0) data.scenarios[idx] = record
  else data.scenarios.push(record)

  persist()
  return record
}

function deleteScenario(id) {
  const data = load()
  data.scenarios = data.scenarios.filter((s) => s.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------

function listCards() {
  return [...load().creditCards]
}

function saveCard(plain) {
  const data = load()
  const existing = plain.id ? data.creditCards.find((c) => c.id === plain.id) : null
  const record = { ...plain, id: existing ? existing.id : nextId(data.creditCards) }

  const idx = data.creditCards.findIndex((c) => c.id === record.id)
  if (idx >= 0) data.creditCards[idx] = record
  else data.creditCards.push(record)

  persist()
  return record
}

function deleteCard(id) {
  const data = load()
  data.creditCards = data.creditCards.filter((c) => c.id !== id)
  data.cardBalances = data.cardBalances.filter((b) => b.cardId !== id)
  persist()
}

// ---------------------------------------------------------------------
// Card balances
// ---------------------------------------------------------------------

function listBalances() {
  return [...load().cardBalances]
}

function saveBalance({ cardId, month, amount, categories, settlementDate }) {
  const data = load()
  const existing = data.cardBalances.find((b) => b.cardId === cardId && b.month === month)

  const record = {
    id: existing ? existing.id : nextId(data.cardBalances),
    cardId,
    month,
    amount: Number(amount) || 0,
    // ISO date string (YYYY-MM-DD) for when auto-pay actually cleared the
    // checking account. May differ from statementDueDay by a few days, and
    // may even land in the following month. Omitted until the user reconciles.
    settlementDate: settlementDate ?? existing?.settlementDate ?? null,
    updatedAt: new Date().toISOString(),
  }
  // Optional — a balance can still just be a single total with no
  // itemized split. Only persist the key at all when there's something
  // real to store, so old (un-itemized) records and new ones stay the
  // same shape.
  if (Array.isArray(categories) && categories.length) {
    record.categories = categories.map((c) => ({
      category: String(c.category || '').trim() || 'Uncategorized',
      amount: Number(c.amount) || 0,
    }))
  }

  const idx = data.cardBalances.findIndex((b) => b.id === record.id)
  if (idx >= 0) data.cardBalances[idx] = record
  else data.cardBalances.push(record)

  persist()
  return record
}

function deleteBalance(id) {
  const data = load()
  data.cardBalances = data.cardBalances.filter((b) => b.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

function getSettings() {
  return { ...load().settings }
}

function saveSettings(partial) {
  const data = load()
  data.settings = { ...data.settings, ...partial }
  persist()
  return { ...data.settings }
}

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

function listCategories() {
  // Categories saved before color picking existed won't have the key at
  // all — normalize to null ("use the automatic hash color") on read.
  return [...load().categories]
    .map((c) => ({ ...c, color: c.color ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Renaming a category (an existing id whose name actually changes) updates
// every expense item and card-balance category line that used the old
// name, so a typo-fix or rewording actually fixes history instead of
// leaving it stuck under the old name.
function renameCategoryEverywhere(data, oldName, newName) {
  for (const snapshot of data.snapshots) {
    for (const item of snapshot.expenseItems || []) {
      if (item.category === oldName) item.category = newName
    }
  }
  for (const balance of data.cardBalances) {
    for (const c of balance.categories || []) {
      if (c.category === oldName) c.category = newName
    }
  }
}

function saveCategory({ id, name, color }) {
  const data = load()
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new Error('Category name cannot be empty.')

  const existing = id ? data.categories.find((c) => c.id === id) : null
  const oldName = existing?.name

  const duplicate = data.categories.find(
    (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== id
  )
  if (duplicate) throw new Error(`"${trimmedName}" already exists.`)

  // color is optional per call — a rename-only save (color left
  // undefined) keeps whatever color was already set instead of wiping it
  // back to "auto." Passing an explicit null/empty string does clear it.
  const resolvedColor = color !== undefined ? color || null : existing?.color ?? null

  const record = { id: existing ? existing.id : nextId(data.categories), name: trimmedName, color: resolvedColor }
  const idx = data.categories.findIndex((c) => c.id === record.id)
  if (idx >= 0) data.categories[idx] = record
  else data.categories.push(record)

  if (oldName && oldName !== trimmedName) {
    renameCategoryEverywhere(data, oldName, trimmedName)
  }

  persist()
  return record
}

// Removes a category from the managed list only — existing expense items
// and card-balance lines that used it keep their value untouched. They'll
// just stop appearing in the curated suggestion list (though they can
// still surface via usage-derived suggestions elsewhere in the app).
function deleteCategory(id) {
  const data = load()
  data.categories = data.categories.filter((c) => c.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Accounts (Assets & Debts) — persistent named accounts with their own
// per-month balance log, the same pattern Credit Cards use. Asset
// accounts can optionally be tagged with a goal type (house/emergency,
// absorbing what used to be the separate Fund Accounts entity), an
// assumed growth rate, and a monthly contribution target. Debt accounts
// can optionally carry an interest rate, a minimum payment, and an extra
// payoff-plan payment — used to project a payoff timeline and to feed
// the Affordability calculator's "Other Monthly Debts" auto-pull.
// ---------------------------------------------------------------------

function listAccounts() {
  // Accounts saved before these fields existed won't have the keys at
  // all — normalize on read rather than requiring another migration
  // pass, same spirit as the ?? fallbacks used when loading settings.
  return [...load().accounts]
    .map((a) => ({
      ...a,
      isRetirement: !!a.isRetirement,
      interestRatePercent: a.interestRatePercent ?? 0,
      minimumPayment: a.minimumPayment ?? null,
      extraMonthlyPayment: a.extraMonthlyPayment ?? null,
      isTransactionAccount: !!a.isTransactionAccount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function saveAccount({
  id,
  name,
  kind,
  goalType,
  annualReturnPercent,
  monthlyTargetContribution,
  isRetirement,
  interestRatePercent,
  minimumPayment,
  extraMonthlyPayment,
  paymentDayOfMonth,
  isTransactionAccount,
}) {
  const data = load()
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new Error('Account name cannot be empty.')
  if (kind !== 'asset' && kind !== 'debt') {
    throw new Error('Account kind must be "asset" or "debt".')
  }
  if (goalType != null && goalType !== 'house' && goalType !== 'emergency') {
    throw new Error('Goal type must be "house", "emergency", or unset.')
  }

  // Optional dollar fields (minimum/extra payment) follow the same
  // "blank means untracked, not zero" convention as monthlyTargetContribution
  // below — an empty field means "I haven't set this," not "$0/mo."
  function optionalDollarField(value) {
    return value !== null && value !== undefined && value !== '' ? Number(value) || 0 : null
  }

  const existing = id ? data.accounts.find((a) => a.id === id) : null
  const record = {
    id: existing ? existing.id : nextId(data.accounts),
    name: trimmedName,
    kind,
    // goalType/rate/target/isRetirement are asset-only concepts — always
    // null/0/null/false for a debt account, regardless of what was passed
    // in.
    goalType: kind === 'asset' ? goalType ?? null : null,
    annualReturnPercent: kind === 'asset' ? Number(annualReturnPercent) || 0 : 0,
    monthlyTargetContribution: kind === 'asset' ? optionalDollarField(monthlyTargetContribution) : null,
    // Tags an asset account (401k, IRA, ...) as retirement so it can be
    // excluded from "non-retirement" totals/charts elsewhere in the app.
    // Purely informational — doesn't change growth/contribution math.
    isRetirement: kind === 'asset' ? !!isRetirement : false,
    // interestRatePercent/minimumPayment/extraMonthlyPayment are debt-only
    // concepts — always 0/null/null for an asset account, mirroring the
    // asset-only fields above.
    interestRatePercent: kind === 'debt' ? Number(interestRatePercent) || 0 : 0,
    minimumPayment: kind === 'debt' ? optionalDollarField(minimumPayment) : null,
    extraMonthlyPayment: kind === 'debt' ? optionalDollarField(extraMonthlyPayment) : null,
    paymentDayOfMonth: kind === 'debt' ? (Number(paymentDayOfMonth) || null) : null,
    // The single asset account Monthly Entry's predicted-balance feature
    // is based on (e.g. "Joint Checking") — asset-only, and exclusive:
    // at most one account can carry this at a time, enforced below.
    isTransactionAccount: kind === 'asset' ? !!isTransactionAccount : false,
  }

  const idx = data.accounts.findIndex((a) => a.id === record.id)
  if (idx >= 0) data.accounts[idx] = record
  else data.accounts.push(record)

  // Exclusivity: picking this account as the transaction account unsets
  // it on every other account, the same way a radio button would —
  // there's only ever one "the" checking account for this feature.
  if (record.isTransactionAccount) {
    for (const a of data.accounts) {
      if (a.id !== record.id) a.isTransactionAccount = false
    }
  }

  persist()
  return record
}

// Unlike the old Fund Accounts (where deleting just unassigned an asset
// item, since the dollar amount still lived independently in the
// snapshot), a balance here only exists as a record tied to its account —
// there's no "unassigned but still real" state anymore. Deleting an
// account deletes its balance history too, mirroring deleteCard exactly.
// The UI warns about this before calling it.
function deleteAccount(id) {
  const data = load()
  data.accounts = data.accounts.filter((a) => a.id !== id)
  data.accountBalances = data.accountBalances.filter((b) => b.accountId !== id)
  persist()
}

function listAccountBalances() {
  return [...load().accountBalances]
}

function saveAccountBalance({ accountId, month, amount }) {
  const data = load()
  const existing = data.accountBalances.find((b) => b.accountId === accountId && b.month === month)
  const record = {
    id: existing ? existing.id : nextId(data.accountBalances),
    accountId,
    month,
    amount: Number(amount) || 0,
    updatedAt: new Date().toISOString(),
  }
  const idx = data.accountBalances.findIndex((b) => b.id === record.id)
  if (idx >= 0) data.accountBalances[idx] = record
  else data.accountBalances.push(record)
  persist()
  return record
}

function deleteAccountBalance(id) {
  const data = load()
  data.accountBalances = data.accountBalances.filter((b) => b.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Forecast items (Monthly Entry → Planning ahead) — known future income
// or expenses, each with its own month, kept independent of any actual
// snapshot until that month arrives and the user explicitly pulls one in
// (SnapshotForm's "Add to this month" — a normal saveSnapshot call at
// that point, nothing special on this side). Dashboard's cash flow chart
// reads these for upcoming months to render a forecast overlay.
// ---------------------------------------------------------------------

function listForecastItems() {
  return [...load().forecastItems].sort((a, b) => a.month.localeCompare(b.month))
}

function saveForecastItem({ id, type, month, label, amount, category }) {
  const data = load()
  if (type !== 'income' && type !== 'expense') {
    throw new Error('Forecast item type must be "income" or "expense".')
  }
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    throw new Error('Forecast item needs a valid month.')
  }

  const existing = id ? data.forecastItems.find((f) => f.id === id) : null
  const record = {
    id: existing ? existing.id : nextId(data.forecastItems),
    type,
    month,
    label: String(label || '').trim(),
    amount: Number(amount) || 0,
    // category is an expense-only concept, same convention as line items
    // in a snapshot's expenseItems.
    category: type === 'expense' ? String(category || '').trim() || null : null,
  }

  const idx = data.forecastItems.findIndex((f) => f.id === record.id)
  if (idx >= 0) data.forecastItems[idx] = record
  else data.forecastItems.push(record)

  persist()
  return record
}

function deleteForecastItem(id) {
  const data = load()
  data.forecastItems = data.forecastItems.filter((f) => f.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Income Options (Settings → Income Options) — a managed list of income
// source labels (e.g. "My Salary," "Spouse Paycheck," "FSA
// Reimbursement"), same pattern as Categories, just feeding the
// autocomplete on Monthly Entry's Income label field instead of the
// Expense category field.
// ---------------------------------------------------------------------

function listIncomeOptions() {
  return [...load().incomeOptions].sort((a, b) => a.name.localeCompare(b.name))
}

// Renaming an income option (an existing id whose name actually changes)
// updates every income item across every snapshot that used the old
// label, same cascade-rename behavior as Categories — a typo-fix or
// rewording actually fixes history instead of leaving it stuck under the
// old name.
function renameIncomeOptionEverywhere(data, oldName, newName) {
  for (const snapshot of data.snapshots) {
    for (const item of snapshot.incomeItems || []) {
      if (item.label === oldName) item.label = newName
    }
  }
}

function saveIncomeOption({ id, name, schedule }) {
  const data = load()
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new Error('Income option name cannot be empty.')

  const existing = id ? data.incomeOptions.find((o) => o.id === id) : null
  const oldName = existing?.name

  const duplicate = data.incomeOptions.find(
    (o) => o.name.toLowerCase() === trimmedName.toLowerCase() && o.id !== id
  )
  if (duplicate) throw new Error(`"${trimmedName}" already exists.`)

  const record = {
    id: existing ? existing.id : nextId(data.incomeOptions),
    name: trimmedName,
    schedule: schedule !== undefined ? schedule : (existing?.schedule ?? null),
  }
  const idx = data.incomeOptions.findIndex((o) => o.id === record.id)
  if (idx >= 0) data.incomeOptions[idx] = record
  else data.incomeOptions.push(record)

  if (oldName && oldName !== trimmedName) {
    renameIncomeOptionEverywhere(data, oldName, trimmedName)
  }

  persist()
  return record
}

// Removes an income option from the managed list only — existing income
// items that used it keep their value untouched, same as deleteCategory.
function deleteIncomeOption(id) {
  const data = load()
  data.incomeOptions = data.incomeOptions.filter((o) => o.id !== id)
  persist()
}

// ---------------------------------------------------------------------
// Backup / restore (Settings -> Export/Import backup)
// ---------------------------------------------------------------------

function getBackupPayload() {
  const data = load()
  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    snapshots: data.snapshots,
    scenarios: data.scenarios,
    creditCards: data.creditCards,
    cardBalances: data.cardBalances,
    settings: data.settings,
    categories: data.categories,
    accounts: data.accounts,
    accountBalances: data.accountBalances,
    forecastItems: data.forecastItems,
    incomeOptions: data.incomeOptions,
  }
}

function restoreFromPayload(payload) {
  if (!payload || !Array.isArray(payload.snapshots) || !Array.isArray(payload.scenarios)) {
    throw new Error('Invalid backup file format.')
  }
  const creditCardsIn = Array.isArray(payload.creditCards) ? payload.creditCards : []
  const cardBalancesIn = Array.isArray(payload.cardBalances) ? payload.cardBalances : []

  const cardIdMap = new Map()
  const creditCards = creditCardsIn.map((c, i) => {
    const newId = i + 1
    cardIdMap.set(c.id, newId)
    const { id, ...rest } = c
    return { ...rest, id: newId }
  })
  const cardBalances = cardBalancesIn.map((b, i) => {
    const { id, ...rest } = b
    return { ...rest, id: i + 1, cardId: cardIdMap.get(b.cardId) ?? b.cardId }
  })

  const scenarios = payload.scenarios.map((s, i) => {
    const { id, ...rest } = s
    return { ...rest, id: i + 1 }
  })

  // Older backups won't have settings/categories — keep whatever's
  // currently set rather than resetting to defaults on import.
  const current = load()
  const settings = { ...DEFAULT_SETTINGS, ...(current.settings || {}), ...(payload.settings || {}) }
  const categories =
    Array.isArray(payload.categories) && payload.categories.length
      ? payload.categories.map((c, i) => ({ id: i + 1, name: c.name }))
      : current.categories

  let snapshots
  let accounts
  let accountBalances
  let fundAccounts

  if (Array.isArray(payload.accounts)) {
    // New-vintage backup: accounts/accountBalances already exist directly
    // — remap ids the same way cardId already gets remapped above.
    const accountIdMap = new Map()
    accounts = payload.accounts.map((a, i) => {
      const newId = i + 1
      accountIdMap.set(a.id, newId)
      const { id, ...rest } = a
      return { ...rest, id: newId }
    })
    const accountBalancesIn = Array.isArray(payload.accountBalances) ? payload.accountBalances : []
    accountBalances = accountBalancesIn.map((b, i) => {
      const { id, ...rest } = b
      return { ...rest, id: i + 1, accountId: accountIdMap.get(b.accountId) ?? b.accountId }
    })
    snapshots = payload.snapshots.map((s, i) => {
      const { id, ...rest } = s
      // New-vintage snapshots shouldn't carry these at all, but strip
      // defensively in case of a hand-edited file.
      delete rest.assetItems
      delete rest.debtItems
      return { ...rest, id: i + 1 }
    })
    fundAccounts = null
  } else {
    // Older backup (pre-unified-accounts, possibly even pre-Fund-
    // Accounts) — restore snapshots/fundAccounts as-is, with the same id
    // remapping the live app already does, and let the same migration
    // chain that runs on every normal load() promote everything below,
    // exactly as it would for a first load after upgrading.
    const fundAccountsIn = Array.isArray(payload.fundAccounts) ? payload.fundAccounts : null
    const fundAccountIdMap = new Map()
    fundAccounts = fundAccountsIn
      ? fundAccountsIn.map((a, i) => {
          const newId = i + 1
          fundAccountIdMap.set(a.id, newId)
          const { id, ...rest } = a
          return { ...rest, id: newId }
        })
      : null
    snapshots = payload.snapshots.map((s, i) => {
      const { id, ...rest } = s
      const assetItems = (rest.assetItems || []).map((item) => {
        if (item.accountId == null) return item
        return { ...item, accountId: fundAccountIdMap?.get(item.accountId) ?? null }
      })
      return { ...rest, assetItems, id: i + 1 }
    })
    accounts = null
    accountBalances = []
  }

  // Forecast items have no foreign keys into anything else, so this is a
  // plain id remap, same spirit as the others above.
  const forecastItems = Array.isArray(payload.forecastItems)
    ? payload.forecastItems.map((f, i) => {
        const { id, ...rest } = f
        return { ...rest, id: i + 1 }
      })
    : []

  // Same for income options — plain id remap, no foreign keys.
  const incomeOptions = Array.isArray(payload.incomeOptions)
    ? payload.incomeOptions.map((o, i) => {
        const { id, ...rest } = o
        return { ...rest, id: i + 1 }
      })
    : []

  cache = {
    version: 2,
    snapshots,
    scenarios,
    creditCards,
    cardBalances,
    settings,
    categories,
    fundAccounts,
    accounts,
    accountBalances,
    forecastItems,
    incomeOptions,
  }
  migrateAssetFlagsToAccounts(cache)
  migrateToUnifiedAccounts(cache)
  persist()
}

module.exports = {
  getDataPath,
  listSnapshots,
  saveSnapshot,
  deleteSnapshot,
  listScenarios,
  saveScenario,
  deleteScenario,
  listCards,
  saveCard,
  deleteCard,
  listBalances,
  saveBalance,
  deleteBalance,
  getSettings,
  saveSettings,
  listCategories,
  saveCategory,
  deleteCategory,
  listAccounts,
  saveAccount,
  deleteAccount,
  listAccountBalances,
  saveAccountBalance,
  deleteAccountBalance,
  listForecastItems,
  saveForecastItem,
  deleteForecastItem,
  listIncomeOptions,
  saveIncomeOption,
  deleteIncomeOption,
  getBackupPayload,
  restoreFromPayload,
}