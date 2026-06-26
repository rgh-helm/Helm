<script setup>
import { computed, ref } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatCurrency } from '../utils/format'
import EmptyState from './EmptyState.vue'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  showPerCard: { type: Boolean, default: false },
})

const finance  = useFinanceStore()
const cards    = useCreditCardStore()
const settings = useSettingsStore()

// ── Primary-only toggle ───────────────────────────────────
const primaryOnly = ref(false)
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
  <div class="rounded-lg border border-base-300 bg-base-200 overflow-hidden">

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