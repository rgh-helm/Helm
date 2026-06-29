<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '../stores/financeStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { currentMonthKey, formatCurrency, formatMonthLabel } from '../utils/format'
import { formatMonthYear, projectScenario } from '../utils/projections'
import { projectPayoff, formatPayoffDate } from '../utils/debtPayoff'
import InfoTip from './InfoTip.vue'

const finance = useFinanceStore()
const goals = useGoalsStore()
const cards = useCreditCardStore()
const accounts = useAccountsStore()
const settings = useSettingsStore()
const router = useRouter()

const month = currentMonthKey()

// ── Is this month logged? ─────────────────────────────────
const currentSnap = computed(() =>
  finance.actualSnapshots.find((s) => s.month === month) ?? null
)
const isLogged = computed(() => !!currentSnap.value)

// ── Deployable cash ───────────────────────────────────────
const deployable = computed(() => {
  if (isLogged.value) {
    return finance.totals(currentSnap.value).netCashFlow
  }
  // Estimate from the recurring items in the last logged snapshot —
  // income items all carry forward, only recurring-flagged expenses do.
  // Debt payments are already in recurringExpenses (logged as recurring
  // line items), so we don't separately subtract account minimums.
  const { incomeItems, expenseItems } = finance.recurringProjection
  const recurringIncome   = incomeItems .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const recurringExpenses = expenseItems.reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const cardSpend = cards.totalForMonth(month)
  return recurringIncome - recurringExpenses - cardSpend
})

const deployableDelta = computed(() => deployable.value - finance.avgMonthlySavings)

// ── Savings rate ──────────────────────────────────────────
const savingsRate = computed(() => {
  if (isLogged.value) {
    const t = finance.totals(currentSnap.value)
    return t.income > 0 ? (t.netCashFlow / t.income) * 100 : null
  }
  return finance.avgMonthlyIncome > 0
    ? (deployable.value / finance.avgMonthlyIncome) * 100
    : null
})

const trailingSavingsRate = computed(() =>
  finance.avgMonthlyIncome > 0
    ? (finance.avgMonthlySavings / finance.avgMonthlyIncome) * 100
    : null
)

const savingsRateDelta = computed(() =>
  savingsRate.value !== null && trailingSavingsRate.value !== null
    ? savingsRate.value - trailingSavingsRate.value
    : null
)

// ── Category variance ─────────────────────────────────────
const categoryVariance = computed(() => {
  if (!isLogged.value) return []
  const trailingCount = settings.trailingAverageMonths
  const trailing = finance.actualSnapshots
    .filter((s) => s.month < month)
    .slice(-trailingCount)
  if (!trailing.length) return []

  const sumByCategory = new Map()
  for (const s of trailing) {
    for (const { category, amount } of finance.categoryBreakdownForMonth(s.month)) {
      sumByCategory.set(category, (sumByCategory.get(category) || 0) + amount)
    }
  }
  const avgByCategory = new Map(
    [...sumByCategory.entries()].map(([c, s]) => [c, s / trailingCount])
  )
  const currentByCategory = new Map(
    finance.categoryBreakdownForMonth(month).map(({ category, amount }) => [category, amount])
  )
  const allCats = new Set([...currentByCategory.keys(), ...avgByCategory.keys()])
  const deltas = []
  for (const category of allCats) {
    const curr = currentByCategory.get(category) || 0
    const avg = avgByCategory.get(category) || 0
    const delta = curr - avg
    if (Math.abs(delta) > 5) deltas.push({ category, current: curr, avg, delta })
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4)
})

// ── Pinned goal scenario ──────────────────────────────────
const pinnedScenarioId = ref(localStorage.getItem('diagnosticPinnedScenarioId') ?? null)

function setPinnedScenario(id) {
  pinnedScenarioId.value = id || null
  if (id) localStorage.setItem('diagnosticPinnedScenarioId', id)
  else localStorage.removeItem('diagnosticPinnedScenarioId')
}

const pinnedProjection = computed(() => {
  if (!goals.projections.length) return null
  const pinned = pinnedScenarioId.value
    ? goals.projections.find((p) => p.scenario.id === pinnedScenarioId.value)
    : null
  return (
    pinned ??
    [...goals.projections].sort(
      (a, b) => b.projection.progressPercent - a.projection.progressPercent
    )[0]
  )
})

function goAdjustContribution() {
  if (!pinnedProjection.value) return
  router.push({ name: 'goals', query: { editScenario: pinnedProjection.value.scenario.id } })
}

// ── Debt-to-savings chain ─────────────────────────────────
// For each tracked debt, project when it clears and what happens to the
// pinned goal's date when that payment gets freed up and redirected to
// savings. Only shows debts that clear within 5 years — debts further
// out than that are real but too far away to be actionable here.
const DEBT_HORIZON_MONTHS = 60

const debtImpacts = computed(() => {
  if (!pinnedProjection.value) return []
  const proj = pinnedProjection.value.projection
  if (!proj.projectedDate) return []

  const context = {
    currentHouseFund: finance.currentHouseFund,
    currentEmergencyFund: finance.currentEmergencyFund,
    avgMonthlySavings: finance.avgMonthlySavings,
    avgMonthlyExpenses: finance.avgMonthlyExpenses,
    houseFundRate: finance.houseFundRate,
    emergencyFundRate: finance.emergencyFundRate,
  }

  const results = []
  for (const debt of accounts.debtAccounts) {
    const balance = accounts.currentBalance(debt.id)
    if (!balance || !debt.minimumPayment) continue

    const payoff = projectPayoff({
      balance,
      annualRatePercent: debt.interestRatePercent || 0,
      monthlyPayment: debt.minimumPayment,
    })
    if (!payoff.possible || payoff.months > DEBT_HORIZON_MONTHS) continue

    // Re-project the pinned goal with this debt's payment redirected to savings.
    // Force monthlyContribution to the new value so the scenario's own
    // override (if any) doesn't swallow the boost.
    const newMonthlyContrib = proj.effectiveMonthlyContribution + debt.minimumPayment
    const modifiedScenario = {
      ...pinnedProjection.value.scenario,
      monthlyContribution: newMonthlyContrib,
    }
    const newProj = projectScenario(modifiedScenario, context)
    if (!newProj.projectedDate) continue

    const monthsEarlier = Math.round(
      (proj.projectedDate - newProj.projectedDate) / (1000 * 60 * 60 * 24 * 30.44)
    )
    if (monthsEarlier <= 0) continue

    results.push({
      name: debt.name,
      monthsToPayoff: payoff.months,
      payoffDate: formatPayoffDate(payoff.months),
      freedAmount: debt.minimumPayment,
      newProjectedDate: newProj.projectedDate,
      monthsEarlier,
    })
  }

  return results.sort((a, b) => a.monthsToPayoff - b.monthsToPayoff).slice(0, 2)
})

// ── Formatting helpers ────────────────────────────────────
function formatPct(v) {
  return v !== null && v !== undefined ? v.toFixed(1) + '%' : '—'
}

function signedCurrency(v) {
  return (v >= 0 ? '+' : '') + formatCurrency(v)
}
</script>

<template>
  <div
    class="rounded-lg border border-base-300 bg-base-200 overflow-hidden shadow-lg shadow-secondary/5"
    style="border-left: 4px solid oklch(var(--s))"
  >
    <div class="p-5">

      <!-- ── Header ── -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="font-display font-semibold">Month at a Glance</h2>
          <p class="text-xs text-base-content/50 mt-0.5 flex items-center gap-1">
            {{ formatMonthLabel(month) }}
            <InfoTip text="Available to save is your net cash flow this month — income minus all expenses including card spending. Savings rate is that figure as a percentage of income. Both show actuals if the month is logged, or estimates from recurring items if not." />
          </p>
        </div>
        <RouterLink
          v-if="!isLogged"
          to="/entry"
          class="btn btn-sm btn-warning btn-outline gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Log {{ formatMonthLabel(month) }}
        </RouterLink>
        <span v-else class="badge badge-success gap-1 text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Logged
        </span>
      </div>

      <!-- ── Three stat blocks ── -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">

        <!-- Deployable cash -->
        <div class="rounded-md bg-base-100/60 p-4">
          <p class="text-xs text-base-content/50 mb-2">
            Available to save
            <span class="opacity-60">· {{ isLogged ? 'actual' : 'estimated' }}</span>
          </p>
          <p
            class="font-mono tabular-nums text-2xl font-bold leading-none mb-1.5"
            :class="deployable >= 0 ? 'text-success' : 'text-error'"
          >{{ formatCurrency(deployable) }}</p>
          <p class="text-xs font-mono tabular-nums">
            <span :class="deployableDelta >= 0 ? 'text-success' : 'text-error'" class="font-medium">
              {{ signedCurrency(deployableDelta) }}
            </span>
            <span class="text-base-content/40"> vs {{ settings.trailingAverageMonths }}mo avg</span>
          </p>
          <p v-if="!isLogged" class="text-[10px] text-base-content/25 mt-2 leading-snug">
            avg income − recurring expenses − cards
          </p>
        </div>

        <!-- Savings rate -->
        <div class="rounded-md bg-base-100/60 p-4">
          <p class="text-xs text-base-content/50 mb-2">
            Savings rate
            <span class="opacity-60">· {{ isLogged ? 'actual' : 'estimated' }}</span>
          </p>
          <p
            class="font-mono tabular-nums text-2xl font-bold leading-none mb-1.5"
            :class="savingsRate !== null && savingsRate < 0 ? 'text-error' : ''"
          >{{ formatPct(savingsRate) }}</p>
          <p v-if="savingsRateDelta !== null" class="text-xs font-mono tabular-nums">
            <span :class="savingsRateDelta >= 0 ? 'text-success' : 'text-error'" class="font-medium"
              :title="'Percentage point difference between this month\'s savings rate and your trailing average'"
            >{{ savingsRateDelta >= 0 ? '↑' : '↓' }} {{ Math.abs(savingsRateDelta).toFixed(1) }}</span>
            <span class="text-base-content/40"> vs avg ({{ formatPct(trailingSavingsRate) }})</span>
          </p>
        </div>

        <!-- Pinned goal -->
        <div class="rounded-md bg-base-100/60 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs text-base-content/50">Goal</p>
            <div class="flex items-center gap-2">
              <select
                v-if="goals.projections.length > 1"
                class="text-[10px] text-base-content/50 bg-transparent border-0 outline-none cursor-pointer max-w-[100px] truncate"
                :value="pinnedProjection?.scenario.id"
                @change="(e) => setPinnedScenario(e.target.value)"
              >
                <option v-for="p in goals.projections" :key="p.scenario.id" :value="p.scenario.id">
                  {{ p.scenario.name }}
                </option>
              </select>
              <button
                v-if="pinnedProjection"
                type="button"
                class="text-[10px] text-primary hover:underline whitespace-nowrap"
                title="Open this scenario in the Goals planner to adjust your monthly contribution"
                @click="goAdjustContribution"
              >Adjust →</button>
            </div>
          </div>

          <template v-if="pinnedProjection">
            <p class="font-display text-sm font-semibold leading-tight mb-2 truncate" :title="pinnedProjection.scenario.name">
              {{ pinnedProjection.scenario.name }}
            </p>
            <div class="flex items-center gap-2 mb-2">
              <progress
                class="progress progress-primary flex-1 h-1.5"
                :value="pinnedProjection.projection.progressPercent"
                max="100"
              />
              <span class="font-mono tabular-nums text-xs text-base-content/60 whitespace-nowrap">
                {{ pinnedProjection.projection.progressPercent.toFixed(1) }}%
              </span>
            </div>
            <p v-if="pinnedProjection.projection.projectedDate" class="text-xs text-base-content/50">
              On track for
              <span class="font-semibold text-base-content/80">
                {{ formatMonthYear(pinnedProjection.projection.projectedDate) }}
              </span>
            </p>
            <p v-else class="text-xs text-error">Unreachable at current rate</p>
            <p class="text-[10px] text-base-content/30 mt-1 font-mono tabular-nums">
              {{ formatCurrency(pinnedProjection.projection.remaining) }} remaining ·
              {{ formatCurrency(pinnedProjection.projection.effectiveMonthlyContribution) }}/mo
            </p>
          </template>
          <p v-else class="text-sm text-base-content/35">
            No goals set.
            <RouterLink to="/goals" class="link link-primary">Add one →</RouterLink>
          </p>
        </div>
      </div>

      <!-- ── Debt-to-savings chain ── -->
      <div v-if="debtImpacts.length" class="mb-5 rounded-md border border-base-300 divide-y divide-base-300 bg-base-100/60">
        <div
          v-for="impact in debtImpacts"
          :key="impact.name"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-xs"
        >
          <span class="text-base-content/60">
            <span class="font-medium text-base-content/80">{{ impact.name }}</span>
            clears {{ impact.payoffDate }}, freeing
            <span class="font-mono tabular-nums font-medium text-success">+{{ formatCurrency(impact.freedAmount) }}/mo</span>
          </span>
          <span class="font-mono tabular-nums text-success font-medium whitespace-nowrap">
            → goal moves up {{ impact.monthsEarlier }} mo
            <span class="text-base-content/40 font-normal">({{ formatMonthYear(impact.newProjectedDate) }})</span>
          </span>
        </div>
      </div>

      <!-- ── Category variance ── -->
      <div class="border-t border-base-300 pt-4">
        <p class="text-xs font-medium text-base-content/40 mb-3 uppercase tracking-wide" style="letter-spacing:0.06em">
          Category variance vs {{ settings.trailingAverageMonths }}mo avg
        </p>

        <div v-if="categoryVariance.length" class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <div v-for="v in categoryVariance" :key="v.category" class="flex flex-col gap-0.5 bg-base-100/60 rounded-md p-3">
            <p class="text-[10px] text-base-content/45 truncate" :title="v.category">{{ v.category }}</p>
            <p
              class="font-mono tabular-nums text-base font-semibold leading-tight"
              :class="v.delta > 0 ? 'text-error' : 'text-success'"
            >{{ v.delta > 0 ? '+' : '' }}{{ formatCurrency(v.delta) }}</p>
            <div class="flex items-center gap-1.5">
              <div class="flex-1 h-1 rounded-full bg-base-300 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="v.delta > 0 ? 'bg-error/60' : 'bg-success/60'"
                  :style="{
                    width: Math.min((Math.abs(v.delta) / Math.abs(categoryVariance[0].delta)) * 100, 100) + '%'
                  }"
                ></div>
              </div>
              <span class="text-[10px] text-base-content/25 font-mono tabular-nums whitespace-nowrap">
                {{ formatCurrency(v.current) }}
              </span>
            </div>
          </div>
        </div>

        <p v-else-if="!isLogged" class="text-xs text-base-content/30 italic">
          Variance will appear once {{ formatMonthLabel(month) }} is logged.
        </p>

        <p v-else class="text-xs text-success/70 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Spending tracking close to your averages — no major movers this month.
        </p>
      </div>

    </div>
  </div>
</template>