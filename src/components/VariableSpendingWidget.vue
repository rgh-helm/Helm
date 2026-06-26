<script setup>
import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatCurrency } from '../utils/format'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  // The month string (YYYY-MM) being viewed in Monthly Entry
  month: { type: String, required: true },
})

const finance  = useFinanceStore()
const settings = useSettingsStore()

// ── This month's snapshot ─────────────────────────────────
const snapshot = computed(() =>
  finance.actualSnapshots.find((s) => s.month === props.month) ?? null
)
const hasData = computed(() => snapshot.value !== null)

const actualMonthCount = computed(() =>
  Math.min(settings.trailingAverageMonths, finance.actualSnapshots.length)
)

// ── Variable spending ─────────────────────────────────────
const excluded = computed(() =>
  new Set(settings.excludedVariableCategories.map((c) => c.toLowerCase()))
)

const thisMonthVariable = computed(() => {
  if (!snapshot.value) return null
  return (snapshot.value.expenseItems || [])
    .filter((i) => !i.recurring && !i.accountId)
    .filter((i) => !excluded.value.has((i.category || '').toLowerCase()))
    .reduce((a, i) => a + (Number(i.amount) || 0), 0)
})

// avgNonRecurring is already on the store — no need to recompute
const avgVariable = computed(() => finance.avgNonRecurring)

const variableDelta = computed(() => {
  if (thisMonthVariable.value === null) return null
  return thisMonthVariable.value - avgVariable.value
})

// Bar fill: this month relative to 2× the average
// so the midpoint of the bar represents "exactly on average"
const variableBarPct = computed(() => {
  if (thisMonthVariable.value === null || avgVariable.value === 0) return 0
  return Math.min((thisMonthVariable.value / (avgVariable.value * 2)) * 100, 100)
})

const variableOver = computed(() =>
  variableDelta.value !== null && variableDelta.value > 0
)

// ── Income ────────────────────────────────────────────────
const thisMonthIncome = computed(() => {
  if (!snapshot.value) return null
  return (snapshot.value.incomeItems || [])
    .reduce((a, i) => a + (Number(i.amount) || 0), 0)
})

const avgIncome = computed(() => finance.avgMonthlyIncome || 0)

const incomeDelta = computed(() => {
  if (thisMonthIncome.value === null) return null
  return thisMonthIncome.value - avgIncome.value
})

// Bar fill: this month relative to 2× average income
const incomeBarPct = computed(() => {
  if (thisMonthIncome.value === null || avgIncome.value === 0) return 0
  return Math.min((thisMonthIncome.value / (avgIncome.value * 2)) * 100, 100)
})

const incomeUnder = computed(() =>
  incomeDelta.value !== null && incomeDelta.value < 0
)
</script>

<template>
  <div
    v-if="hasData"
    class="rounded-lg border border-base-300 bg-base-200 overflow-hidden"
  >
    <!-- Coloured top bar — green when both are healthy, grades to warning/error -->
    <div
      class="h-1 w-full"
      :class="variableOver || incomeUnder ? (variableOver && incomeUnder ? 'bg-error' : 'bg-warning') : 'bg-success'"
    ></div>

    <div class="px-5 pt-4 pb-5 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-base-300 gap-0">

      <!-- ── Income (left) ── -->
      <div class="pb-5 sm:pb-0 sm:pr-5">
        <div class="flex items-baseline justify-between mb-1">
          <p class="text-xs font-medium text-base-content/50 uppercase tracking-wide flex items-center gap-1" style="letter-spacing:0.06em">
            Income
            <InfoTip text="Total income logged this month vs. your trailing average. Includes all income items — transfer-flagged items are shown in the true total here but excluded from the average." />
          </p>
          <p class="text-[10px] text-base-content/35">
            {{ actualMonthCount }}mo avg:
            <span class="font-mono tabular-nums">{{ formatCurrency(avgIncome) }}</span>
          </p>
        </div>

        <div class="flex items-baseline justify-between mb-2">
          <span
            class="font-mono tabular-nums text-2xl font-bold"
            :class="incomeUnder ? 'text-error' : 'text-success'"
          >{{ formatCurrency(thisMonthIncome) }}</span>
          <span
            class="font-mono tabular-nums text-sm font-semibold"
            :class="incomeUnder ? 'text-error' : 'text-success'"
          >
            {{ incomeDelta > 0 ? '+' : '' }}{{ formatCurrency(incomeDelta) }}
          </span>
        </div>

        <div class="relative h-2 rounded-full bg-base-300 overflow-hidden">
          <div class="absolute top-0 left-1/2 bottom-0 w-px bg-base-content/20 z-10"></div>
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="incomeUnder ? 'bg-error/70' : 'bg-success/70'"
            :style="`width: ${incomeBarPct}%`"
          ></div>
        </div>
        <div class="flex justify-between text-[10px] text-base-content/30 mt-1">
          <span>$0</span><span>avg</span><span>2× avg</span>
        </div>

        <p class="text-[11px] mt-2 leading-snug"
           :class="incomeUnder ? 'text-error/70' : 'text-success/70'">
          {{ incomeUnder
            ? `${formatCurrency(Math.abs(incomeDelta))} below your typical income`
            : incomeDelta > 0
              ? `${formatCurrency(incomeDelta)} above your typical income`
              : 'Right on your income average' }}
        </p>
      </div>

      <!-- ── Variable spending (right) ── -->
      <div class="pt-5 sm:pt-0 sm:pl-5">
        <div class="flex items-baseline justify-between mb-1">
          <p class="text-xs font-medium text-base-content/50 uppercase tracking-wide flex items-center gap-1" style="letter-spacing:0.06em">
            Variable spending
            <InfoTip text="Non-recurring, non-transfer expenses for this month vs. your trailing average. Excludes recurring bills (rent, subscriptions) and debt payments — just the discretionary day-to-day spending." />
          </p>
          <p class="text-[10px] text-base-content/35">
            {{ actualMonthCount }}mo avg:
            <span class="font-mono tabular-nums">{{ formatCurrency(avgVariable) }}</span>
          </p>
        </div>

        <div class="flex items-baseline justify-between mb-2">
          <span
            class="font-mono tabular-nums text-2xl font-bold"
            :class="variableOver ? 'text-error' : 'text-success'"
          >{{ formatCurrency(thisMonthVariable) }}</span>
          <span
            class="font-mono tabular-nums text-sm font-semibold"
            :class="variableOver ? 'text-error' : 'text-success'"
          >
            {{ variableDelta > 0 ? '+' : '' }}{{ formatCurrency(variableDelta) }}
          </span>
        </div>

        <div class="relative h-2 rounded-full bg-base-300 overflow-hidden">
          <div class="absolute top-0 left-1/2 bottom-0 w-px bg-base-content/20 z-10"></div>
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="variableOver ? 'bg-error/70' : 'bg-success/70'"
            :style="`width: ${variableBarPct}%`"
          ></div>
        </div>
        <div class="flex justify-between text-[10px] text-base-content/30 mt-1">
          <span>$0</span><span>avg</span><span>2× avg</span>
        </div>

        <p class="text-[11px] mt-2 leading-snug"
           :class="variableOver ? 'text-error/70' : 'text-success/70'">
          {{ variableOver
            ? `${formatCurrency(variableDelta)} above your typical variable spend`
            : variableDelta < 0
              ? `${formatCurrency(Math.abs(variableDelta))} below your typical variable spend`
              : 'Right on your variable spending average' }}
        </p>
      </div>

    </div>
  </div>
</template>