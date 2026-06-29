<script setup>
import { computed, ref } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore }  from '../stores/settingsStore'
import { useAccountsStore }  from '../stores/accountsStore'
import { formatCurrency } from '../utils/format'
import EmptyState from './EmptyState.vue'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  showPerCard: { type: Boolean, default: false },
})

const finance   = useFinanceStore()
const accounts  = useAccountsStore()
const cards    = useCreditCardStore()
const settings = useSettingsStore()

// ── Primary-only toggle ───────────────────────────────────
const primaryOnly = ref(true)
const hasPrimaryFilter = computed(() => settings.primaryIncomeLabels.length > 0)

// ── Income basis ──────────────────────────────────────────
const activeincomeBasis = computed(() =>
  primaryOnly.value && hasPrimaryFilter.value
    ? finance.primaryIncomeBasis
    : finance.avgMonthlyIncome || 0
)

// ── Fixed obligations & variable expenses (from store) ────
const fixedObligations = computed(() => finance.fixedObligations)
const avgNonRecurring  = computed(() => finance.avgNonRecurring)

const actualMonthCount = computed(() =>
  Math.min(settings.trailingAverageMonths, finance.actualSnapshots.length)
)

// Low sample size warning — avgs based on fewer than 6 months are flagged
const lowSampleWarning = computed(() => {
  const n = actualMonthCount.value
  if (n >= 6) return null
  return `Averages based on only ${n} month${n === 1 ? '' : 's'} of data — more history will improve accuracy.`
})

// ── Suggested CC ceiling ──────────────────────────────────
// In Primary Only mode we use the store's precomputed value (primary income
// basis). In Combined mode we recompute against combined income so the
// toggle still works correctly for the all-income view.
const suggestedCC = computed(() =>
  primaryOnly.value && hasPrimaryFilter.value
    ? finance.suggestedCCCeiling
    : finance.avgMonthlyIncome - fixedObligations.value - avgNonRecurring.value
)

// ── Secondary income callout ──────────────────────────────
const showSecondaryCallout = computed(() =>
  primaryOnly.value && hasPrimaryFilter.value && finance.secondaryIncomeBasis > 0
)

// ── Current card picture ──────────────────────────────────
const currentCCBudgetTotal = computed(() =>
  cards.cards.reduce((a, c) => a + (Number(c.targetBudget) || 0), 0)
)

const avgCCSpendTotal = computed(() =>
  cards.cardsWithStats.reduce((a, cs) => a + (cs.average || 0), 0)
)

// ── This month's expense breakdown ────────────────────────
// Splits the current month's logged expenses into four groups:
//   Debts       — items with accountId linking to a debt account
//   Recurring   — recurring: true, no accountId (rent, tithing, etc.)
//   Variable    — neither recurring nor accountId (day-to-day spend)
//   Credit Cards — actual logged card balance for the month when available,
//                  falls back to trailing avg (marked as estimated)
const currentMonthSnapshot = computed(() =>
  finance.actualSnapshots.at(-1) ?? null
)

const debtAccountIds = computed(() =>
  new Set(accounts.accounts.filter((a) => a.kind === 'debt').map((a) => a.id))
)

const currentMonthCCTotal = computed(() => {
  const snap = currentMonthSnapshot.value
  if (!snap) return { amount: avgCCSpendTotal.value, isEstimate: true }
  const logged = cards.totalForMonth(snap.month)
  if (logged > 0) return { amount: logged, isEstimate: false }
  return { amount: avgCCSpendTotal.value, isEstimate: true }
})

const currentMonthBreakdown = computed(() => {
  const snap = currentMonthSnapshot.value
  if (!snap) return null

  let debts = 0, recurring = 0, variable = 0
  for (const e of (snap.expenseItems || [])) {
    const amt = Number(e.amount) || 0
    if (e.accountId && debtAccountIds.value.has(e.accountId)) debts += amt
    else if (e.recurring) recurring += amt
    else variable += amt
  }
  const { amount: creditCards, isEstimate: ccIsEstimate } = currentMonthCCTotal.value
  const total = debts + recurring + variable + creditCards

  return { debts, recurring, variable, creditCards, ccIsEstimate, total }
})

const currentMonthIncome = computed(() => {
  const snap = currentMonthSnapshot.value
  if (!snap) return null
  return (snap.incomeItems || []).reduce((a, i) => a + (Number(i.amount) || 0), 0)
})

// ── Scenario columns ───────────────────────────────────────
// "Right now" — this month's actual income vs actual expenses, broken down
const colRightNow = computed(() => {
  if (!currentMonthBreakdown.value || currentMonthIncome.value === null) return null
  const income = currentMonthIncome.value
  const expenses = currentMonthBreakdown.value.total
  return {
    income, expenses, net: income - expenses,
    rawBreakdown: currentMonthBreakdown.value,
    label: 'Right now', sublabel: 'This month actual',
  }
})

// "Combined income" — full expense breakdown vs this month's actual combined income
const colCombined = computed(() => {
  if (!currentMonthBreakdown.value || currentMonthIncome.value === null) return null
  const income = currentMonthIncome.value
  return {
    income,
    breakdown: currentMonthBreakdown.value,
    net: income - currentMonthBreakdown.value.total,
    label: 'Combined income',
    sublabel: 'Current reality',
  }
})

// "Primary income goal" — same actual income but filtered to primary sources only;
// secondary shown as the saveable amount
const colPrimary = computed(() => {
  if (!currentMonthBreakdown.value || currentMonthIncome.value === null || !hasPrimaryFilter.value) return null
  const snap = currentMonthSnapshot.value
  const primaryLabels = new Set(
    (settings.primaryIncomeLabels || []).map((l) => l.toLowerCase())
  )
  const income = (snap?.incomeItems || [])
    .filter((i) => primaryLabels.has((i.label || '').toLowerCase()))
    .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const saveable = currentMonthIncome.value - income
  return {
    income,
    breakdown: currentMonthBreakdown.value,
    net: income - currentMonthBreakdown.value.total,
    saveable: saveable > 0 ? saveable : null,
    label: 'Primary only',
    sublabel: 'Single-income goal',
  }
})

const scenarioColumns = computed(() =>
  [colRightNow.value, colCombined.value, colPrimary.value].filter(Boolean)
)

// ── HYSA opportunity ──────────────────────────────────────
const hysaOpportunity = computed(() => suggestedCC.value - currentCCBudgetTotal.value)

// ── Per-card apply ────────────────────────────────────────
const applying = ref(false)
async function applyPerCardSuggestions() {
  applying.value = true
  for (const r of perCardSuggestions.value) {
    if (r.suggestedBudget > 0) {
      await cards.saveCard({ ...r.card, targetBudget: r.suggestedBudget })
    }
  }
  applying.value = false
}
const perCardSuggestions = computed(() => {
  if (currentCCBudgetTotal.value <= 0) return []
  const target = Math.max(0, suggestedCC.value)
  return cards.cardsWithStats
    .filter((cs) => (Number(cs.card.targetBudget) || 0) > 0)
    .map((cs) => {
      const share = (Number(cs.card.targetBudget) || 0) / currentCCBudgetTotal.value
      return {
        card:            cs.card,
        currentBudget:   Number(cs.card.targetBudget) || 0,
        suggestedBudget: Math.round(share * target),
        avgSpend:        cs.average || 0,
      }
    })
})
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 overflow-hidden shadow-lg shadow-secondary/5">

    <!-- Header -->
    <div class="px-5 pt-5 pb-4 border-b border-base-300 flex items-center justify-between gap-3">
      <div>
        <h2 class="font-display font-semibold">Monthly Savings Bandwidth</h2>
        <p class="text-xs text-base-content/50 mt-0.5 flex items-center gap-1">
          What your income supports after obligations — and how much to route to savings
          <InfoTip text="Bandwidth = avg income − fixed recurring obligations − avg variable expenses. The result is the most you can spend on cards each month and still break even. Anything below that ceiling is available for HYSA transfers." />
        </p>
      </div>
      <div v-if="hasPrimaryFilter" class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="btn btn-xs"
          :class="!primaryOnly ? 'btn-primary' : 'btn-ghost'"
          @click="primaryOnly = false"
        >Combined</button>
        <button
          type="button"
          class="btn btn-xs"
          :class="primaryOnly ? 'btn-primary' : 'btn-ghost'"
          @click="primaryOnly = true"
        >Primary only</button>
      </div>
    </div>

    <div class="p-5 space-y-5">

      <EmptyState
        v-if="!finance.actualSnapshots.length"
        variant="inline"
        emoji="📊"
        title="Bandwidth unlocks after your first month"
        message="Log a monthly snapshot and the widget will calculate your suggested CC ceiling, savings bandwidth, and how your card spending compares."
        action-label="Log this month →"
        action-to="/entry"
      />

      <template v-else>
      <div class="space-y-2">

        <div class="flex items-center justify-between text-sm">
          <div>
            <span class="text-base-content/70">
              {{ primaryOnly && hasPrimaryFilter ? 'Primary income' : 'Avg monthly income' }}
            </span>
            <span class="text-[10px] text-base-content/35 ml-1">({{ actualMonthCount }}mo avg)</span>
          </div>
          <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(activeincomeBasis) }}</span>
        </div>

        <div class="flex items-center justify-between text-sm pl-3 border-l-2 border-base-300">
          <span class="text-base-content/60">Fixed obligations</span>
          <span class="font-mono tabular-nums text-error">−{{ formatCurrency(fixedObligations) }}</span>
        </div>

        <div class="flex items-center justify-between text-sm pl-3 border-l-2 border-base-300">
          <div>
            <span class="text-base-content/60">Avg variable expenses</span>
            <span class="text-[10px] text-base-content/35 ml-1">({{ actualMonthCount }}mo avg, non-recurring)</span>
          </div>
          <span class="font-mono tabular-nums text-error">−{{ formatCurrency(avgNonRecurring) }}</span>
        </div>

        <div class="border-t border-base-300 pt-2 flex items-center justify-between">
          <span class="text-sm font-medium">Suggested CC ceiling</span>
          <span
            class="font-mono tabular-nums text-xl font-bold"
            :class="suggestedCC >= 0 ? 'text-success' : 'text-error'"
          >{{ formatCurrency(suggestedCC) }}</span>
        </div>

        <p v-if="suggestedCC < 0" class="text-xs text-error/70 leading-snug mt-1">
          Fixed obligations and variable expenses already exceed average income — current CC
          spending is drawing from reserves.
        </p>
      </div>

      <!-- ── Low sample warning ── -->
      <div v-if="lowSampleWarning"
        class="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] text-warning/80">
        <span class="mt-0.5 shrink-0">⚠</span>
        <span>{{ lowSampleWarning }}</span>
      </div>

      <!-- ── This month vs income scenarios ── -->
      <div v-if="scenarioColumns.length" class="space-y-2">
        <p class="text-xs font-medium text-base-content/40 uppercase tracking-wide">
          This month vs income scenarios
          <span class="normal-case font-normal text-base-content/30 ml-1">logged + avg card spend</span>
        </p>
        <div class="grid gap-3" :class="scenarioColumns.length === 3 ? 'grid-cols-3' : 'grid-cols-2'">
          <div
            v-for="col in scenarioColumns"
            :key="col.label"
            class="rounded-lg border p-3 flex flex-col gap-2"
            :class="col.net >= 0 ? 'border-success/25 bg-success/5' : 'border-error/25 bg-error/5'"
          >
            <!-- Column header -->
            <div class="pb-1 border-b border-base-300">
              <p class="text-[11px] font-semibold text-base-content/70 leading-tight">{{ col.label }}</p>
              <p class="text-[10px] text-base-content/35 leading-tight">{{ col.sublabel }}</p>
            </div>

            <!-- Income -->
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] text-base-content/45">Income</span>
              <span class="font-mono tabular-nums text-xs font-medium text-base-content/80">
                {{ formatCurrency(col.income) }}
              </span>
            </div>

            <!-- Expense breakdown (middle + right cols have breakdown) -->
            <template v-if="col.breakdown">
              <div class="space-y-1 border-t border-base-300/60 pt-1">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-error/50"></span>Debts
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.breakdown.debts) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-warning/50"></span>Recurring
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.breakdown.recurring) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-info/50"></span>Variable
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.breakdown.variable) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-accent/50"></span>
                    Credit cards
                    <span v-if="col.breakdown.ccIsEstimate" class="text-base-content/25">~avg</span>
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.breakdown.creditCards) }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Simple expense total (right now col — no breakdown prop) -->
            <template v-else>
              <div class="space-y-1 border-t border-base-300/60 pt-1">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-error/50"></span>Debts
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.rawBreakdown.debts) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-warning/50"></span>Recurring
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.rawBreakdown.recurring) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-info/50"></span>Variable
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.rawBreakdown.variable) }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[10px] text-base-content/40 flex items-center gap-1">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-accent/50"></span>
                    Credit cards
                    <span v-if="col.rawBreakdown.ccIsEstimate" class="text-base-content/25">~avg</span>
                  </span>
                  <span class="font-mono tabular-nums text-[10px] text-base-content/60">
                    −{{ formatCurrency(col.rawBreakdown.creditCards) }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Net -->
            <div class="mt-auto border-t border-base-300 pt-2 flex items-center justify-between">
              <span class="text-[10px] font-medium text-base-content/50">Net</span>
              <span
                class="font-mono tabular-nums text-sm font-bold"
                :class="col.net >= 0 ? 'text-success' : 'text-error'"
              >
                {{ col.net >= 0 ? '+' : '' }}{{ formatCurrency(col.net) }}
              </span>
            </div>

            <!-- Secondary → savings callout (primary col only) -->
            <div v-if="col.saveable" class="rounded bg-success/10 px-2 py-1.5 -mt-1">
              <p class="text-[10px] text-success/70 font-medium">Secondary → savings</p>
              <p class="font-mono tabular-nums text-xs font-bold text-success">
                {{ formatCurrency(col.saveable) }}/mo
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Secondary income callout (Primary Only mode) ── -->
      <div
        v-if="showSecondaryCallout"
        class="rounded-md border border-info/25 bg-info/5 px-4 py-3 flex items-center justify-between gap-3"
      >
        <div>
          <p class="text-xs font-medium text-info">+ Secondary income available to save</p>
          <p class="text-[11px] text-base-content/50 mt-0.5 leading-snug">
            Not included in bandwidth above — treat this as your savings deposit each month
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="font-mono tabular-nums font-bold text-info text-lg leading-none">
            {{ formatCurrency(finance.secondaryIncomeBasis) }}
          </p>
          <p class="text-[10px] text-base-content/35 mt-0.5">{{ actualMonthCount }}mo avg</p>
        </div>
      </div>

      <!-- ── Comparison ── -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-md bg-base-100 p-3">
          <p class="text-[10px] text-base-content/50 mb-1">Your CC budget target</p>
          <p class="font-mono tabular-nums text-base font-semibold">
            {{ currentCCBudgetTotal > 0 ? formatCurrency(currentCCBudgetTotal) : '—' }}
          </p>
          <p
            v-if="currentCCBudgetTotal > 0"
            class="text-[10px] font-mono tabular-nums mt-1"
            :class="hysaOpportunity < 0 ? 'text-error' : 'text-success'"
          >
            {{ hysaOpportunity < 0
              ? `$${Math.round(Math.abs(hysaOpportunity)).toLocaleString()} over ceiling`
              : `$${Math.round(hysaOpportunity).toLocaleString()} under ceiling` }}
          </p>
        </div>

        <div class="rounded-md bg-base-100 p-3">
          <p class="text-[10px] text-base-content/50 mb-1">6mo avg actual CC spend</p>
          <p class="font-mono tabular-nums text-base font-semibold">
            {{ avgCCSpendTotal > 0 ? formatCurrency(avgCCSpendTotal) : '—' }}
          </p>
          <p
            v-if="avgCCSpendTotal > 0"
            class="text-[10px] font-mono tabular-nums mt-1"
            :class="avgCCSpendTotal > suggestedCC ? 'text-error' : 'text-success'"
          >
            {{ avgCCSpendTotal > suggestedCC
              ? `$${Math.round(avgCCSpendTotal - suggestedCC).toLocaleString()} over ceiling`
              : `$${Math.round(suggestedCC - avgCCSpendTotal).toLocaleString()} under ceiling` }}
          </p>
        </div>
      </div>

      <!-- ── HYSA opportunity ── -->
      <div
        class="rounded-md p-4 border"
        :class="hysaOpportunity >= 0
          ? 'border-success/30 bg-success/5'
          : 'border-warning/30 bg-warning/5'"
      >
        <p class="text-xs font-medium mb-1"
           :class="hysaOpportunity >= 0 ? 'text-success' : 'text-warning'">
          {{ hysaOpportunity >= 0 ? '✓ Room for HYSA transfers' : '⚠ Over break-even' }}
        </p>
        <p class="text-sm text-base-content/70 leading-snug">
          <template v-if="hysaOpportunity > 0">
            Your CC budgets are
            <span class="font-mono tabular-nums font-semibold text-success">{{ formatCurrency(hysaOpportunity) }}</span>
            below the break-even ceiling. That gap is your HYSA transfer target each month.
          </template>
          <template v-else-if="hysaOpportunity === 0">
            Your CC budget is exactly at break-even — nothing left over for HYSA.
            Trim any discretionary card spending to create transfer room.
          </template>
          <template v-else>
            The suggested ceiling of
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(suggestedCC) }}</span>
            is where you break even — $0 left over. Your current CC budget is
            <span class="font-mono tabular-nums font-semibold text-warning">{{ formatCurrency(Math.abs(hysaOpportunity)) }}</span>
            above that. Cut CC spending to the ceiling to reach net 0, then any
            further reduction becomes your HYSA transfer.
          </template>
        </p>
      </div>

      <!-- ── Per-card breakdown ── -->
      <template v-if="showPerCard && perCardSuggestions.length && suggestedCC > 0">
        <div class="border-t border-base-300 pt-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-medium text-base-content/40 uppercase tracking-wide" style="letter-spacing:0.06em">
              Suggested per-card allocation
              <span class="normal-case font-normal">(proportional to current budgets)</span>
            </p>
            <button
              type="button"
              class="btn btn-xs btn-outline"
              :class="applying ? 'loading' : ''"
              :disabled="applying"
              @click="applyPerCardSuggestions"
            >Apply all</button>
          </div>
          <div class="space-y-2">
            <div
              v-for="r in perCardSuggestions"
              :key="r.card.id"
              class="grid items-center gap-2 text-xs"
              style="grid-template-columns: 1fr auto auto auto"
            >
              <span class="text-base-content/70 truncate" :title="r.card.name">{{ r.card.name }}</span>
              <span class="font-mono tabular-nums text-base-content/35 line-through text-right">{{ formatCurrency(r.currentBudget) }}</span>
              <span class="text-base-content/30">→</span>
              <span class="font-mono tabular-nums font-medium text-right">{{ formatCurrency(r.suggestedBudget) }}</span>
            </div>
          </div>
        </div>
      </template>

      </template>

    </div>
  </div>
</template>