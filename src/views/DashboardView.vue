<script setup>
import { computed, ref } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import NetWorthChart from '../components/NetWorthChart.vue'
import CashFlowChart from '../components/CashFlowChart.vue'
import CategoryBreakdownChart from '../components/CategoryBreakdownChart.vue'
import CategoryTrendsChart from '../components/CategoryTrendsChart.vue'
import IncomeBreakdownChart from '../components/IncomeBreakdownChart.vue'
import CardSpendWidget from '../components/CardSpendWidget.vue'
import DiagnosticCard from '../components/DiagnosticCard.vue'
import CashFlowTimeline   from '../components/CashFlowTimeline.vue'
import ScenarioSandbox    from '../components/ScenarioSandbox.vue'
import BandwidthWidget from '../components/BandwidthWidget.vue'
import EmptyState from '../components/EmptyState.vue'
import SetupChecklist from '../components/SetupChecklist.vue'
import NarrativeSummary from '../components/NarrativeSummary.vue'
import { formatCurrency, formatPercent, formatMonthLabel, currentMonthKey, shiftMonthKey } from '../utils/format'
import SankeyChart from '../components/SankeyChart.vue'

const finance = useFinanceStore()
const goals = useGoalsStore()
const cards = useCreditCardStore()
const settings = useSettingsStore()

const latest = computed(() => (finance.latestSnapshot ? finance.totals(finance.latestSnapshot) : null))
const topScenario = computed(() => {
  if (!goals.projections.length) return null
  return [...goals.projections].sort((a, b) => b.projection.progressPercent - a.projection.progressPercent)[0]
})
const latestCategoryBreakdown = computed(() =>
  finance.latestSnapshot ? finance.categoryBreakdownForMonth(finance.latestSnapshot.month) : []
)

const monthlyIncomeBreakdown = computed(() =>
  finance.latestSnapshot ? finance.incomeBreakdownForMonth(finance.latestSnapshot.month) : []
)
const selectedYear = ref(
  finance.latestSnapshot ? finance.latestSnapshot.month.slice(0, 4) : String(new Date().getFullYear())
)
const annualIncomeBreakdown = computed(() => finance.incomeBreakdownForYear(selectedYear.value))

// Project 6 months of recurring items ahead for the income/expense chart.
const PROJECTION_MONTHS = 6
const actualMonths = computed(() => new Set(finance.netWorthHistory.map((h) => h.month)))
const chartMonths = computed(() => {
  const months = [...finance.netWorthHistory.map((h) => h.month)]
  const { incomeItems, expenseItems } = finance.recurringProjection
  const hasRecurring = incomeItems.length > 0 || expenseItems.length > 0
  if (hasRecurring) {
    let m = currentMonthKey()
    for (let i = 0; i < PROJECTION_MONTHS; i++) {
      if (!actualMonths.value.has(m)) months.push(m)
      m = shiftMonthKey(m, 1)
    }
  }
  return months
})

const historyByMonth = computed(() => new Map(finance.netWorthHistory.map((h) => [h.month, h])))

// Each month's actual totals plus a projected "planned" segment for
// unlogged months, built from recurring items rather than forecast items.
const chartSeries = computed(() => {
  const { incomeItems, expenseItems } = finance.recurringProjection
  const plannedIncomeTotal  = incomeItems .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const plannedExpenseTotal = expenseItems.reduce((a, i) => a + (Number(i.amount) || 0), 0)
  return chartMonths.value.map((month) => {
    const actual = historyByMonth.value.get(month)
    const isActual = !!actual
    return {
      month,
      actualIncome:    actual ? actual.income   : 0,
      actualExpenses:  actual ? actual.expenses : 0,
      plannedIncome:   !isActual ? plannedIncomeTotal  : 0,
      plannedExpenses: !isActual ? plannedExpenseTotal : 0,
    }
  })
})
const hasPlannedAmounts = computed(() =>
  chartSeries.value.some((s) => s.plannedIncome > 0 || s.plannedExpenses > 0)
)

// Drill-down state for clicking a bar in the Income vs. Expenses chart —
// set by CashFlowChart's bar-click event, cleared by the panel's close
// button. Clicking either the actual or planned segment of a bar opens
// the same panel — the value is seeing the whole picture for that
// month/type together, clearly labeled, not just whichever segment
// happened to get clicked.
const selectedBreakdown = ref(null) // { month, type: 'income'|'expense' }

function onBarClick(payload) {
  selectedBreakdown.value = payload
}

const breakdown = computed(() => {
  if (!selectedBreakdown.value) return null
  const { month, type } = selectedBreakdown.value

  const snapshot = finance.snapshots.find((s) => s.month === month)
  let actual = []
  if (snapshot) {
    if (type === 'income') {
      actual = (snapshot.incomeItems || []).map((i) => ({ label: i.label || '(no label)', category: null, amount: i.amount }))
    } else {
      actual = (snapshot.expenseItems || []).map((i) => ({
        label: i.label || '(no label)',
        category: i.category,
        amount: i.amount,
      }))
      // Mirrors exactly what financeStore.totals() sums for this month.
      const cardSpend = cards.totalForMonth(month)
      if (cardSpend > 0) actual.push({ label: 'Credit card spending', category: null, amount: cardSpend })
    }
  }

  const planned = []
  if (!snapshot) {
    // Unlogged month — show recurring items as the projected breakdown
    const { incomeItems, expenseItems } = finance.recurringProjection
    if (type === 'income') {
      incomeItems.forEach((i) => planned.push({ label: i.label || '(no label)', category: null, amount: i.amount }))
    } else {
      expenseItems.forEach((i) => planned.push({ label: i.label || '(no label)', category: i.category, amount: i.amount }))
    }
  }

  const actualTotal = actual.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
  const plannedTotal = planned.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)

  return { actual, planned, actualTotal, plannedTotal, total: actualTotal + plannedTotal }
})
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="font-display text-2xl font-semibold">Dashboard</h1>
      <p class="text-sm text-base-content/60">Your financial baseline at a glance.</p>
    </div>

    <EmptyState
      v-if="!finance.sortedSnapshots.length"
      emoji="📅"
      title="No data yet — let's log your first month"
      message="Once you add a monthly snapshot, the dashboard fills in with your income, spending, net worth, and savings bandwidth. It gets smarter every month you log."
      action-label="Log this month →"
      action-to="/entry"
    />

    <template v-else>
      <SetupChecklist />

      <NarrativeSummary />

      <DiagnosticCard />

      <SankeyChart :month="finance.latestSnapshot?.month" />

      <BandwidthWidget />

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg shadow-secondary/5">
          <p class="text-xs text-base-content/60">Net worth</p>
          <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(latest.netWorth) }}</p>
        </div>
        <div class="rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg shadow-secondary/5">
          <p class="text-xs text-base-content/60">Non-retirement cash flow (last month)</p>
          <p
            class="font-mono tabular-nums text-2xl font-semibold"
            :class="latest.netCashFlow >= 0 ? 'text-success' : 'text-error'"
          >
            {{ formatCurrency(latest.netCashFlow) }}
          </p>
          <p class="text-xs text-base-content/40 mt-1">Already net of your retirement transfer</p>
        </div>
        <div class="rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg shadow-secondary/5">
          <p class="text-xs text-base-content/60">Avg monthly savings ({{ settings.trailingAverageMonths }}mo)</p>
          <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(finance.avgMonthlySavings) }}</p>
        </div>
      </div>

      <CashFlowTimeline />

      <!-- ── Forecast Sandbox ── -->
      <ScenarioSandbox />

      <CardSpendWidget />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-lg border border-base-300 bg-base-200 p-5">
          <h2 class="font-display font-semibold mb-3">Net worth over time</h2>
          <NetWorthChart :history="finance.netWorthHistory" />
        </div>
        <div class="rounded-lg border border-base-300 bg-base-200 p-5">
          <h2 class="font-display font-semibold mb-1">Income vs. expenses</h2>
          <p class="text-xs text-base-content/60 mb-3">
            Click a bar to see what's behind it.
            <template v-if="hasPlannedAmounts">
              The lighter top portion of a bar is planned-ahead amounts from
              <RouterLink to="/entry" class="link link-primary">Monthly Entry</RouterLink>'s "Planning ahead" — not
              logged yet.
            </template>
          </p>
          <CashFlowChart :entries="chartSeries" @bar-click="onBarClick" />

          <div v-if="selectedBreakdown && breakdown" class="mt-4 rounded-lg border border-base-300 bg-base-200/40 p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-display text-sm font-semibold">
                {{ selectedBreakdown.type === 'income' ? 'Income' : 'Expenses' }} —
                {{ formatMonthLabel(selectedBreakdown.month) }}
              </h3>
              <button type="button" class="btn btn-ghost btn-xs btn-circle" @click="selectedBreakdown = null">✕</button>
            </div>

            <p v-if="!breakdown.actual.length && !breakdown.planned.length" class="text-sm text-base-content/50">
              Nothing here.
            </p>

            <template v-else>
              <div v-if="breakdown.actual.length" class="mb-3">
                <p class="text-xs font-medium text-base-content/60 mb-1">Actual</p>
                <div class="space-y-1">
                  <div v-for="(item, i) in breakdown.actual" :key="`a${i}`" class="flex items-center justify-between text-sm">
                    <span>
                      {{ item.label }}<span v-if="item.category" class="text-base-content/50"> · {{ item.category }}</span>
                    </span>
                    <span class="font-mono tabular-nums">{{ formatCurrency(item.amount) }}</span>
                  </div>
                </div>
              </div>

              <div v-if="breakdown.planned.length" class="mb-3">
                <p class="text-xs font-medium text-base-content/60 mb-1">Planned (not logged yet)</p>
                <div class="space-y-1">
                  <div
                    v-for="(item, i) in breakdown.planned"
                    :key="`p${i}`"
                    class="flex items-center justify-between text-sm text-base-content/80"
                  >
                    <span>
                      {{ item.label }}<span v-if="item.category" class="text-base-content/50"> · {{ item.category }}</span>
                    </span>
                    <span class="font-mono tabular-nums">{{ formatCurrency(item.amount) }}</span>
                  </div>
                </div>
              </div>

              <div class="divider my-1"></div>
              <div class="flex items-center justify-between text-sm font-medium">
                <span>Total</span>
                <span class="font-mono tabular-nums">{{ formatCurrency(breakdown.total) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200 p-5">
        <h2 class="font-display font-semibold mb-3">Spending by category — {{ finance.latestSnapshot.month }}</h2>
        <CategoryBreakdownChart :breakdown="latestCategoryBreakdown" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-lg border border-base-300 bg-base-200 p-5">
          <h2 class="font-display font-semibold mb-3">Income by source — {{ finance.latestSnapshot.month }}</h2>
          <IncomeBreakdownChart
            :breakdown="monthlyIncomeBreakdown"
            empty-message="No income logged this month."
          />
        </div>
        <div class="rounded-lg border border-base-300 bg-base-200 p-5">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-display font-semibold">Income by source — {{ selectedYear }}</h2>
            <select v-if="finance.availableYears.length > 1" class="select select-bordered select-xs" v-model="selectedYear">
              <option v-for="y in finance.availableYears" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
          <IncomeBreakdownChart
            :breakdown="annualIncomeBreakdown"
            :empty-message="`No income logged in ${selectedYear}.`"
          />
        </div>
      </div>

      <div class="rounded-lg border border-base-300 bg-base-200 p-5">
        <h2 class="font-display font-semibold mb-1">Category trends</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Every logged month, manual expenses and card spend combined. Top categories by all-time
          total are shown individually; the rest are grouped as "Other."
        </p>
        <CategoryTrendsChart :months="finance.categoryTrends.months" :series="finance.categoryTrends.series" />
      </div>

      <div v-if="topScenario" class="rounded-lg border border-base-300 bg-base-200 p-5">
        <h2 class="font-display font-semibold mb-2">Leading scenario: {{ topScenario.scenario.name }}</h2>
        <div class="flex items-center gap-3">
          <progress
            class="progress progress-primary w-full"
            :value="topScenario.projection.progressPercent"
            max="100"
          ></progress>
          <span class="text-sm font-mono tabular-nums whitespace-nowrap">
            {{ formatPercent(topScenario.projection.progressPercent) }}
          </span>
        </div>
        <RouterLink to="/goals" class="link link-primary text-sm mt-2 inline-block">View all scenarios →</RouterLink>
      </div>
    </template>
  </div>
</template>