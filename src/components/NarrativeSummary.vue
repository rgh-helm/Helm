<script setup>
import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatCurrency, currentMonthKey } from '../utils/format'

const finance  = useFinanceStore()
const cards    = useCreditCardStore()
const settings = useSettingsStore()

const month = currentMonthKey()

const currentSnap = computed(() =>
  finance.actualSnapshots.find((s) => s.month === month) ?? null
)
const isCurrentMonthLogged = computed(() => !!currentSnap.value)

// ── Income sentence ───────────────────────────────────────
const incomeSentence = computed(() => {
  const hasPrimary = settings.primaryIncomeLabels.length > 0
  const secondary = finance.secondaryIncomeBasis

  if (hasPrimary && secondary > 0) {
    return `Your primary income averages ${formatCurrency(finance.primaryIncomeBasis)}/mo, with ${formatCurrency(secondary)}/mo in secondary income treated as savings.`
  }
  if (finance.avgMonthlyIncome > 0) {
    return `Your average monthly income is ${formatCurrency(finance.avgMonthlyIncome)} over the last ${Math.min(settings.trailingAverageMonths, finance.actualSnapshots.length)} months.`
  }
  return null
})

// ── Bandwidth sentence ────────────────────────────────────
const bandwidthSentence = computed(() => {
  const ceiling = finance.suggestedCCCeiling
  if (ceiling <= 0) return null
  const totalBudget = cards.cards.reduce((a, c) => a + (Number(c.targetBudget) || 0), 0)

  if (totalBudget > 0) {
    const gap = ceiling - totalBudget
    if (Math.abs(gap) < 10) {
      return `Your card budget of ${formatCurrency(totalBudget)} sits right at the suggested ceiling — you're breaking even on primary income.`
    }
    if (gap > 0) {
      return `Your card budgets total ${formatCurrency(totalBudget)}, which is ${formatCurrency(gap)} under the suggested ceiling of ${formatCurrency(ceiling)} — that gap is your HYSA transfer target.`
    }
    return `Your card budgets total ${formatCurrency(totalBudget)}, which is ${formatCurrency(Math.abs(gap))} over the suggested ceiling of ${formatCurrency(ceiling)}.`
  }
  return `Based on your income and fixed expenses, ${formatCurrency(ceiling)} is available for card spending each month.`
})

// ── This month sentence ───────────────────────────────────
const thisMonthSentence = computed(() => {
  if (!isCurrentMonthLogged.value) {
    return `This month hasn't been logged yet — the figures above are estimated from your recurring items.`
  }

  const totals = finance.totals(currentSnap.value)
  const ccOverage = Math.max(0, cards.cards.reduce((a, c) => {
    const spent = cards.balanceForCardMonth?.(c.id, month) ?? 0
    return a + spent
  }, 0) - finance.suggestedCCCeiling)

  const hasPrimary = settings.primaryIncomeLabels.length > 0
  const secondary = finance.secondaryIncomeBasis

  if (hasPrimary && secondary > 0 && ccOverage > 0) {
    return `This month's card spending is ${formatCurrency(ccOverage)} over the ceiling, reducing your secondary income savings target to ${formatCurrency(secondary - ccOverage)}.`
  }
  if (hasPrimary && secondary > 0) {
    return `Card spending is within the ceiling this month — your full secondary income of ${formatCurrency(secondary)} is available to save.`
  }
  if (totals.netCashFlow >= 0) {
    return `This month you're on track with ${formatCurrency(totals.netCashFlow)} in net cash flow after all expenses.`
  }
  return `This month's expenses exceed income by ${formatCurrency(Math.abs(totals.netCashFlow))} — worth a closer look.`
})

const sentences = computed(() =>
  [incomeSentence.value, bandwidthSentence.value, thisMonthSentence.value].filter(Boolean)
)
</script>

<template>
  <div
    v-if="sentences.length"
    class="rounded-lg border border-base-300 bg-base-200 px-5 py-4 shadow-lg shadow-secondary/5"
  >
    <p class="text-xs font-medium text-base-content/40 uppercase tracking-wide mb-2" style="letter-spacing:0.06em">
      Summary
    </p>
    <p class="text-sm text-base-content/70 leading-relaxed">
      <template v-for="(sentence, i) in sentences" :key="i">{{ sentence }}{{ i < sentences.length - 1 ? ' ' : '' }}</template>
    </p>
  </div>
</template>