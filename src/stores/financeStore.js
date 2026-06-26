import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCreditCardStore } from './creditCardStore'
import { useSettingsStore } from './settingsStore'
import { useCategoriesStore } from './categoriesStore'
import { useIncomeOptionsStore } from './incomeOptionsStore'
import { useAccountsStore } from './accountsStore'
import { deepClone, currentMonthKey } from '../utils/format'

export const UNCATEGORIZED = 'Uncategorized'

const TREND_TOP_CATEGORIES = 7

export const useFinanceStore = defineStore('finance', () => {
  const snapshots = ref([])
  const loaded = ref(false)

  async function loadSnapshots() {
    snapshots.value = await window.api.snapshots.list()
    loaded.value = true
  }

  async function saveSnapshot(snapshot) {
    const plain = deepClone(snapshot)
    await window.api.snapshots.save(plain)
    await loadSnapshots()
  }

  async function deleteSnapshot(id) {
    await window.api.snapshots.delete(id)
    await loadSnapshots()
  }

  function totals(snapshot) {
    const sum = (items) => (items || []).reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
    const income = sum(snapshot.incomeItems)
    const manualExpenses = sum(snapshot.expenseItems)
    const cardSpend = useCreditCardStore().totalForMonth(snapshot.month)
    const expenses = manualExpenses + cardSpend
    const accounts = useAccountsStore()
    const assets = accounts.totalForMonth(snapshot.month, 'asset')
    const debts = accounts.totalForMonth(snapshot.month, 'debt')
    const houseFund = accounts.goalTotalForMonth(snapshot.month, 'house')
    const emergencyFund = accounts.goalTotalForMonth(snapshot.month, 'emergency')
    return {
      income,
      manualExpenses,
      cardSpend,
      expenses,
      netCashFlow: income - expenses,
      assets,
      debts,
      netWorth: assets - debts,
      houseFund,
      emergencyFund,
    }
  }

  const expenseCategories = computed(() => {
    const used = new Set(useCategoriesStore().categoryNames)
    for (const s of snapshots.value) {
      for (const item of s.expenseItems || []) {
        const category = (item.category || '').trim()
        if (category) used.add(category)
      }
    }
    return [...used].sort((a, b) => a.localeCompare(b))
  })

  const incomeSourceOptions = computed(() => {
    const used = new Set(useIncomeOptionsStore().incomeOptionNames)
    for (const s of snapshots.value) {
      for (const item of s.incomeItems || []) {
        const label = (item.label || '').trim()
        if (label) used.add(label)
      }
    }
    return [...used].sort((a, b) => a.localeCompare(b))
  })

  function categoryBreakdownForMonth(month) {
    const byCategory = new Map()
    const snapshot = snapshots.value.find((s) => s.month === month)
    for (const item of snapshot?.expenseItems || []) {
      const amount = Number(item.amount) || 0
      if (!amount) continue
      const category = (item.category || '').trim() || UNCATEGORIZED
      byCategory.set(category, (byCategory.get(category) || 0) + amount)
    }
    for (const { category, amount } of useCreditCardStore().allCardsCategoryBreakdown(month)) {
      byCategory.set(category, (byCategory.get(category) || 0) + amount)
    }
    return [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  function incomeBreakdownForMonths(months) {
    const bySource = new Map()
    for (const month of months) {
      const snapshot = snapshots.value.find((s) => s.month === month)
      for (const item of snapshot?.incomeItems || []) {
        const amount = Number(item.amount) || 0
        if (!amount) continue
        const source = (item.label || '').trim() || UNCATEGORIZED
        bySource.set(source, (bySource.get(source) || 0) + amount)
      }
    }
    return [...bySource.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  function incomeBreakdownForMonth(month) {
    return incomeBreakdownForMonths([month])
  }

  function incomeBreakdownForYear(year) {
    const months = sortedSnapshots.value.map((s) => s.month).filter((m) => m.startsWith(year))
    return incomeBreakdownForMonths(months)
  }

  const availableYears = computed(() => {
    const years = new Set(sortedSnapshots.value.map((s) => s.month.slice(0, 4)))
    return [...years].sort().reverse()
  })

  const sortedSnapshots = computed(() =>
    [...snapshots.value].sort((a, b) => a.month.localeCompare(b.month))
  )

  const allLoggedMonths = computed(() => {
    const months = new Set(snapshots.value.map((s) => s.month))
    for (const b of useCreditCardStore().balances) months.add(b.month)
    return [...months].sort()
  })

  const categoryTrends = computed(() => {
    const months = allLoggedMonths.value
    if (!months.length) return { months: [], series: [] }

    const perMonth = months.map((month) => ({ month, breakdown: categoryBreakdownForMonth(month) }))

    const categoryTotals = new Map()
    for (const { breakdown } of perMonth) {
      for (const { category, amount } of breakdown) {
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount)
      }
    }

    const topCategories = [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TREND_TOP_CATEGORIES)
      .map(([category]) => category)
    const topSet = new Set(topCategories)

    const series = topCategories.map((category) => ({
      category,
      data: perMonth.map(({ breakdown }) => breakdown.find((b) => b.category === category)?.amount || 0),
    }))

    if (categoryTotals.size > topCategories.length) {
      series.push({
        category: 'Other',
        data: perMonth.map(({ breakdown }) => {
          const total = breakdown.reduce((acc, b) => acc + b.amount, 0)
          const topSum = breakdown.filter((b) => topSet.has(b.category)).reduce((acc, b) => acc + b.amount, 0)
          return total - topSum
        }),
      })
    }

    return { months, series }
  })

  const actualSnapshots = computed(() => sortedSnapshots.value.filter((s) => s.month <= currentMonthKey()))

  const latestSnapshot = computed(() =>
    actualSnapshots.value.length ? actualSnapshots.value[actualSnapshots.value.length - 1] : null
  )

  const currentHouseFund = computed(() => useAccountsStore().currentGoalTotal('house'))
  const currentEmergencyFund = computed(() => useAccountsStore().currentGoalTotal('emergency'))
  const houseFundRate = computed(() => useAccountsStore().houseFundRate)
  const emergencyFundRate = computed(() => useAccountsStore().emergencyFundRate)

  const netWorthHistory = computed(() =>
    sortedSnapshots.value.map((s) => ({ month: s.month, ...totals(s) }))
  )

  const avgMonthlySavings = computed(() => {
    const months = useSettingsStore().trailingAverageMonths
    const recent = actualSnapshots.value.slice(-months)
    if (!recent.length) return 0
    const sumNet = recent.reduce((acc, s) => acc + totals(s).netCashFlow, 0)
    return sumNet / recent.length
  })

  const avgMonthlyExpenses = computed(() => {
    const months = useSettingsStore().trailingAverageMonths
    const recent = actualSnapshots.value.slice(-months)
    if (!recent.length) return 0
    const sumExpenses = recent.reduce((acc, s) => acc + totals(s).expenses, 0)
    return sumExpenses / recent.length
  })

  const avgMonthlyIncome = computed(() => {
    const months = useSettingsStore().trailingAverageMonths
    const recent = actualSnapshots.value.slice(-months)
    if (!recent.length) return 0
    const sumIncome = recent.reduce((acc, s) => {
      const nonTransfer = (s.incomeItems || []).filter((i) => !i.isTransfer)
      return acc + nonTransfer.reduce((a, i) => a + (Number(i.amount) || 0), 0)
    }, 0)
    return sumIncome / recent.length
  })

  const recurringProjection = computed(() => {
    const snap = latestSnapshot.value
    if (!snap) return { incomeItems: [], expenseItems: [] }
    return {
      incomeItems:  (snap.incomeItems  || []).map((i) => ({ ...i })),
      expenseItems: (snap.expenseItems || []).filter((i) => i.recurring).map((i) => ({ ...i })),
    }
  })

  // ── Shared bandwidth computeds ────────────────────────────
  // Consumed by BandwidthWidget and CardSpendWidget — single source of truth.

  // Trailing average of income items whose labels ARE in primaryIncomeLabels.
  const primaryIncomeBasis = computed(() => {
    const settings = useSettingsStore()
    const labels = new Set(settings.primaryIncomeLabels.map((l) => l.toLowerCase()))
    if (!labels.size) return avgMonthlyIncome.value
    const months = settings.trailingAverageMonths
    const actual = actualSnapshots.value.slice(-months)
    if (!actual.length) return 0
    const total = actual.reduce((a, s) =>
      a + (s.incomeItems || [])
        .filter((i) => !i.isTransfer)
        .filter((i) => labels.has((i.label || '').toLowerCase()))
        .reduce((x, i) => x + (Number(i.amount) || 0), 0)
    , 0)
    return total / actual.length
  })

  // Trailing average of income items whose labels are NOT in primaryIncomeLabels.
  // This is the "savable" secondary income pool — meaningful only when
  // the household is targeting a one-primary-income lifestyle.
  const secondaryIncomeBasis = computed(() => {
    const settings = useSettingsStore()
    const labels = new Set(settings.primaryIncomeLabels.map((l) => l.toLowerCase()))
    if (!labels.size) return 0
    const months = settings.trailingAverageMonths
    const actual = actualSnapshots.value.slice(-months)
    if (!actual.length) return 0
    const total = actual.reduce((a, s) =>
      a + (s.incomeItems || [])
        .filter((i) => !i.isTransfer)
        .filter((i) => !labels.has((i.label || '').toLowerCase()))
        .reduce((x, i) => x + (Number(i.amount) || 0), 0)
    , 0)
    return total / actual.length
  })

  // Trailing average of non-recurring, non-account, non-excluded expenses.
  const avgNonRecurring = computed(() => {
    const settings = useSettingsStore()
    const months = settings.trailingAverageMonths
    const actual = actualSnapshots.value.slice(-months)
    if (!actual.length) return 0
    const excluded = new Set(
      settings.excludedVariableCategories.map((c) => c.toLowerCase())
    )
    const total = actual.reduce((a, s) => {
      const nonRec = (s.expenseItems || [])
        .filter((i) => !i.recurring && !i.accountId)
        .filter((i) => !excluded.has((i.category || '').toLowerCase()))
        .reduce((x, i) => x + (Number(i.amount) || 0), 0)
      return a + nonRec
    }, 0)
    return total / actual.length
  })

  // Fixed obligations from recurring expense items in the latest snapshot.
  const fixedObligations = computed(() =>
    recurringProjection.value.expenseItems
      .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  )

  // Suggested CC ceiling on primary income only — what's left for
  // discretionary card spending after fixed obligations and avg variable
  // cash expenses, using only primary income as the basis.
  const suggestedCCCeiling = computed(() =>
    primaryIncomeBasis.value - fixedObligations.value - avgNonRecurring.value
  )

  return {
    snapshots,
    loaded,
    loadSnapshots,
    saveSnapshot,
    deleteSnapshot,
    totals,
    houseFundRate,
    emergencyFundRate,
    expenseCategories,
    incomeSourceOptions,
    categoryBreakdownForMonth,
    incomeBreakdownForMonth,
    incomeBreakdownForYear,
    availableYears,
    sortedSnapshots,
    actualSnapshots,
    allLoggedMonths,
    categoryTrends,
    latestSnapshot,
    netWorthHistory,
    currentHouseFund,
    currentEmergencyFund,
    avgMonthlySavings,
    avgMonthlyExpenses,
    avgMonthlyIncome,
    recurringProjection,
    // Bandwidth computeds — shared across BandwidthWidget and CardSpendWidget
    primaryIncomeBasis,
    secondaryIncomeBasis,
    avgNonRecurring,
    fixedObligations,
    suggestedCCCeiling,
  }
})