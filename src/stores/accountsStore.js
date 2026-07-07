import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deepClone } from '../utils/format'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([]) // [{ id, name, kind: 'asset'|'debt', goalType, annualReturnPercent, monthlyTargetContribution }]
  const balances = ref([]) // [{ id, accountId, month, amount, updatedAt }]

  async function loadAccounts() {
    accounts.value = await window.api.accounts.list()
  }

  async function loadBalances() {
    balances.value = await window.api.accountBalances.list()
  }

  async function loadAll() {
    await Promise.all([loadAccounts(), loadBalances()])
  }

  // Throws (with a user-facing message) on an empty name or invalid kind/
  // goalType — left uncaught here so callers can surface it next to
  // whatever form triggered it, same pattern as the other CRUD stores.
  // Returns the saved record — callers that need the real (server-
  // assigned) id right away, e.g. to log an initial balance in the same
  // flow, shouldn't rely on the id they passed in: a brand-new account
  // gets its id assigned by store.cjs, not reused from the caller.
  async function saveAccount(account) {
    const saved = await window.api.accounts.save(deepClone(account))
    await loadAccounts()
    return saved
  }

  // Deleting an account also deletes its balance history (there's no
  // "unassigned but still real" state in this model — every dollar
  // belongs to a specific account or it isn't tracked at all), so reload
  // both lists.
  async function deleteAccount(id) {
    await window.api.accounts.delete(id)
    await loadAll()
  }

  // Upserts an account's balance for a given month — re-logging the same
  // account+month updates the existing entry instead of creating a
  // duplicate. (Matching/upsert logic lives in electron/store.cjs.)
  async function saveBalance({ accountId, month, amount }) {
    await window.api.accountBalances.save(deepClone({ accountId, month, amount }))
    await loadBalances()
  }

  async function deleteBalance(id) {
    await window.api.accountBalances.delete(id)
    await loadBalances()
  }

  function balancesForAccount(accountId) {
    return balances.value
      .filter((b) => b.accountId === accountId)
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  function balanceForAccountMonth(accountId, month) {
    return balances.value.find((b) => b.accountId === accountId && b.month === month)?.amount ?? null
  }

  // Full balance record (not just the amount) for an account+month, so
  // the UI can pre-fill an editor for a specific past month.
  function balanceRecordForAccountMonth(accountId, month) {
    return balances.value.find((b) => b.accountId === accountId && b.month === month) ?? null
  }

  function accountById(id) {
    return accounts.value.find((a) => a.id === id) ?? null
  }

  // An account's own most recent logged balance — not gated by what any
  // other account or snapshot has logged, so a sparsely-logged account
  // doesn't silently read as $0 just because this particular month wasn't
  // re-entered for it. This is the fix for the exact fragility the old
  // Fund Accounts balance lookup had (it only ever looked at the single
  // latest snapshot).
  function currentBalance(accountId) {
    const history = balancesForAccount(accountId)
    return history.length ? history[history.length - 1].amount : 0
  }

  // What an account was worth "as of" a given month — the most recent
  // balance at or before that month. Asset/debt balances are a stock, not
  // a flow (unlike credit card spend, which genuinely is a new total each
  // cycle): if an account wasn't re-logged in a given month, its value
  // didn't reset to zero, it just didn't change, so this carries the last
  // known balance forward rather than treating a skipped month as "$0."
  // Returns 0 only if the account has no balance logged at or before that
  // month at all (it didn't exist/wasn't tracked yet).
  function balanceAsOfMonth(accountId, month) {
    const upTo = balancesForAccount(accountId).filter((b) => b.month <= month)
    return upTo.length ? upTo[upTo.length - 1].amount : 0
  }

  // Estimated contribution to one account for a given month: the balance
  // change from the previous month THAT account was actually logged in —
  // not necessarily the prior calendar month, so a skipped month doesn't
  // wrongly read as "no contribution."
  function contributionForMonth(accountId, month) {
    const history = balancesForAccount(accountId)
    const idx = history.findIndex((b) => b.month === month)
    if (idx <= 0) return null
    return history[idx].amount - history[idx - 1].amount
  }

  // Total across every account of a kind, "as of" a given month — used
  // for historical net worth at a specific past month (see financeStore's
  // totals()). Carries each account's balance forward per balanceAsOfMonth.
  function totalForMonth(month, kind) {
    return accounts.value
      .filter((a) => a.kind === kind)
      .reduce((acc, a) => acc + balanceAsOfMonth(a.id, month), 0)
  }

  function goalTotalForMonth(month, goalType) {
    return accounts.value
      .filter((a) => a.kind === 'asset' && a.goalType === goalType)
      .reduce((acc, a) => acc + balanceAsOfMonth(a.id, month), 0)
  }

  // "As of" total across only non-retirement asset accounts for a given
  // month — same carry-forward logic as totalForMonth, just pre-filtered
  // to exclude anything tagged isRetirement. Used by the Accounts page
  // history chart.
  function nonRetirementTotalForMonth(month) {
    return accounts.value
      .filter((a) => a.kind === 'asset' && !a.isRetirement)
      .reduce((acc, a) => acc + balanceAsOfMonth(a.id, month), 0)
  }

  // Current (not "as of a month") total across every account of a kind —
  // each account's own latest balance, summed. Used for Goals projections,
  // where the freshest possible figure matters more than gating on
  // whether a full monthly snapshot has been filled in yet.
  function currentTotal(kind) {
    return accounts.value.filter((a) => a.kind === kind).reduce((acc, a) => acc + currentBalance(a.id), 0)
  }

  function currentGoalTotal(goalType) {
    return accounts.value
      .filter((a) => a.kind === 'asset' && a.goalType === goalType)
      .reduce((acc, a) => acc + currentBalance(a.id), 0)
  }

  // Current total across only non-retirement asset accounts — each
  // account's own latest balance, summed (same "freshest figure" spirit
  // as currentTotal, just pre-filtered).
  const currentNonRetirementTotal = computed(() =>
    accounts.value
      .filter((a) => a.kind === 'asset' && !a.isRetirement)
      .reduce((acc, a) => acc + currentBalance(a.id), 0)
  )

  // Sum of every debt account's minimum payment (blank/untracked counts
  // as 0, not "unknown") — what the Affordability calculator's "Other
  // Monthly Debts" auto-pull uses by default, since lenders calculate
  // debt-to-income off required minimums, not whatever extra you're
  // optionally choosing to pay toward payoff.
  const currentMinimumDebtPaymentTotal = computed(() =>
    accounts.value.filter((a) => a.kind === 'debt').reduce((acc, a) => acc + (a.minimumPayment || 0), 0)
  )

  // Same, but including each debt's extra payoff-plan payment too — for
  // the Affordability toggle that reflects what's actually leaving the
  // account each month rather than just what's contractually required.
  const currentExtraDebtPaymentTotal = computed(() =>
    accounts.value.filter((a) => a.kind === 'debt').reduce((acc, a) => acc + (a.extraMonthlyPayment || 0), 0)
  )

  // Balance-weighted average growth rate across every asset account of
  // the given goal type — what goal projections use instead of a rate
  // manually typed per scenario. Accounts with a zero or negative current
  // balance don't influence the weighting (they're not contributing any
  // growth either way).
  function weightedGrowthRate(goalType) {
    const relevant = accounts.value.filter((a) => a.kind === 'asset' && a.goalType === goalType)
    let weightedSum = 0
    let totalBalance = 0
    for (const account of relevant) {
      const balance = currentBalance(account.id)
      if (balance <= 0) continue
      weightedSum += account.annualReturnPercent * balance
      totalBalance += balance
    }
    return totalBalance > 0 ? weightedSum / totalBalance : 0
  }

  const assetAccounts = computed(() => accounts.value.filter((a) => a.kind === 'asset'))
  const debtAccounts = computed(() => accounts.value.filter((a) => a.kind === 'debt'))
  const nonRetirementAssetAccounts = computed(() => accounts.value.filter((a) => a.kind === 'asset' && !a.isRetirement))
  const houseAccounts = computed(() => accounts.value.filter((a) => a.kind === 'asset' && a.goalType === 'house'))
  const emergencyAccounts = computed(() =>
    accounts.value.filter((a) => a.kind === 'asset' && a.goalType === 'emergency')
  )

  // The single account (if any) designated as the basis for Monthly
  // Entry's predicted-balance feature — e.g. "Joint Checking." At most
  // one account can carry this flag; exclusivity is enforced on save in
  // electron/store.cjs.
  const transactionAccount = computed(() => accounts.value.find((a) => a.kind === 'asset' && a.isTransactionAccount) ?? null)

  const houseFundRate = computed(() => weightedGrowthRate('house'))
  const emergencyFundRate = computed(() => weightedGrowthRate('emergency'))

  // Every distinct month any account has a balance logged for, ascending.
  const loggedMonths = computed(() => [...new Set(balances.value.map((b) => b.month))].sort())

  // Total assets / non-retirement assets / total debts, "as of" each
  // logged month — the x-axis + three series for the Accounts page
  // history chart. Carries each account's balance forward the same way
  // totalForMonth does, so a month where only some accounts were
  // re-logged still shows a sensible running total rather than dipping
  // toward zero.
  const accountsHistory = computed(() =>
    loggedMonths.value.map((month) => ({
      month,
      totalAssets: totalForMonth(month, 'asset'),
      nonRetirementAssets: nonRetirementTotalForMonth(month),
      totalDebts: totalForMonth(month, 'debt'),
    }))
  )

  return {
    accounts,
    balances,
    loadAccounts,
    loadBalances,
    loadAll,
    saveAccount,
    deleteAccount,
    saveBalance,
    deleteBalance,
    balancesForAccount,
    balanceForAccountMonth,
    balanceRecordForAccountMonth,
    accountById,
    currentBalance,
    balanceAsOfMonth,
    contributionForMonth,
    totalForMonth,
    nonRetirementTotalForMonth,
    goalTotalForMonth,
    currentTotal,
    currentNonRetirementTotal,
    currentMinimumDebtPaymentTotal,
    currentExtraDebtPaymentTotal,
    currentGoalTotal,
    weightedGrowthRate,
    assetAccounts,
    debtAccounts,
    nonRetirementAssetAccounts,
    houseAccounts,
    emergencyAccounts,
    transactionAccount,
    houseFundRate,
    emergencyFundRate,
    loggedMonths,
    accountsHistory,
  }
})