<script setup>
import { computed, ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { currentMonthKey, previousMonthKey, shiftMonthKey, formatCurrency } from '../utils/format'
import EmptyState from './EmptyState.vue'
import InfoTip from './InfoTip.vue'

const cards    = useCreditCardStore()
const finance  = useFinanceStore()
const settings = useSettingsStore()

const month = currentMonthKey()
const lastMonth = previousMonthKey()

// ── View toggle ───────────────────────────────────────────
const view = ref('spend') // 'spend' | 'statements'

// ── Per-card spend data ───────────────────────────────────
const cardData = computed(() =>
  cards.cards.map((card) => {
    const spent = cards.balanceForCardMonth(card.id, month) ?? 0
    const budget = card.targetBudget ?? null
    const limit = card.creditLimit ?? null
    const rawPct = budget && budget > 0 ? (spent / budget) * 100 : null
    const pct = rawPct !== null ? Math.min(rawPct, 100) : null
    const overBudget = budget ? spent > budget : false
    const remaining = budget !== null ? budget - spent : null
    const utilizationPct = limit ? (spent / limit) * 100 : null
    return { card, spent, budget, limit, pct, rawPct, overBudget, remaining, utilizationPct }
  })
)

const totalSpent = computed(() => cardData.value.reduce((acc, d) => acc + d.spent, 0))
const totalBudget = computed(() => {
  const sum = cardData.value.reduce((acc, d) => acc + (d.budget ?? 0), 0)
  return sum > 0 ? sum : null
})
const totalRawPct = computed(() =>
  totalBudget.value ? (totalSpent.value / totalBudget.value) * 100 : null
)
const totalPct = computed(() =>
  totalRawPct.value !== null ? Math.min(totalRawPct.value, 100) : null
)
const totalOverBudget = computed(() =>
  totalBudget.value ? totalSpent.value > totalBudget.value : false
)
const totalRemaining = computed(() =>
  totalBudget.value !== null ? totalBudget.value - totalSpent.value : null
)

// ── Statements due this month ─────────────────────────────
// For each card with a statementDueDay, the statement being paid this month
// is last month's balance. We show: due date, amount, paid status.
const statementsThisMonth = computed(() => {
  const today = new Date()
  const todayDay = today.getDate()

  return cards.cards
    .filter((c) => c.statementDueDay)
    .map((card) => {
      const dueDay = card.statementDueDay
      const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay)
      const dueDateLabel = dueDate.toLocaleDateString('default', { month: 'long', day: 'numeric' })
      const isPast = todayDay > dueDay
      const isToday = todayDay === dueDay

      // The statement being paid this month is last month's balance
      const statementRecord = cards.balanceRecordForCardMonth(card.id, lastMonth)
      const amount = statementRecord?.amount ?? null
      const settlementDate = statementRecord?.settlementDate ?? null

      // Parse settlementDate into a human label if present
      let settledLabel = null
      if (settlementDate) {
        const [sy, sm, sd] = settlementDate.split('-').map(Number)
        const d = new Date(sy, sm - 1, sd)
        settledLabel = d.toLocaleDateString('default', { month: 'long', day: 'numeric' })
      }

      // If no last month statement, fall back to trailing average
      const fallbackAmount = cards.cardsWithStats.find(cs => cs.card.id === card.id)?.average ?? null

      return {
        card,
        dueDay,
        dueDateLabel,
        isPast,
        isToday,
        amount,
        fallbackAmount,
        hasStatement: statementRecord !== null,
        settlementDate,
        settledLabel,
      }
    })
    .sort((a, b) => a.dueDay - b.dueDay)
})

const hasAnyStatements = computed(() =>
  cards.cards.some((c) => c.statementDueDay)
)

// ── Secondary income savings impact ──────────────────────
const hasPrimaryFilter = computed(() => settings.primaryIncomeLabels.length > 0)
const showSecondaryImpact = computed(() =>
  hasPrimaryFilter.value && finance.secondaryIncomeBasis > 0
)

const ccOverage = computed(() =>
  Math.max(0, totalSpent.value - finance.suggestedCCCeiling)
)
const secondaryAfterOverage = computed(() =>
  finance.secondaryIncomeBasis - ccOverage.value
)

function strokeProps(pct, r) {
  const circ = 2 * Math.PI * r
  const offset = pct !== null ? circ * (1 - pct / 100) : circ
  return { circ, offset }
}

const TRACK = 'oklch(var(--b3))'
function ringColor(pct, overBudget, hasBudget) {
  if (!hasBudget) return 'oklch(var(--bc) / 0.18)'
  if (overBudget) return 'var(--color-error, #E0695A)'
  if (pct > 80) return 'var(--color-warning, #E0A458)'
  return 'var(--color-success, #4FAE85)'
}

function formatRemaining(remaining) {
  if (remaining === null) return null
  const abs = formatCurrency(Math.abs(remaining))
  return remaining >= 0 ? `+${abs}` : `-${abs}`
}
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-5 shadow-lg shadow-secondary/5">

    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="font-display font-semibold">Cards this month</h2>
        <p class="text-xs text-base-content/50 mt-0.5 flex items-center gap-1">
          Spend vs. budget per card
          <InfoTip text="Rings show this month's spending as a percentage of each card's budget. The secondary income impact section shows how much of your savable income has been consumed by card spending beyond the suggested ceiling." />
        </p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <!-- View toggle -->
        <div v-if="hasAnyStatements" class="flex rounded-lg border border-base-300 overflow-hidden">
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium transition-colors"
            :class="view === 'spend'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
            @click="view = 'spend'"
          >Spend</button>
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium transition-colors"
            :class="view === 'statements'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
            @click="view = 'statements'"
          >Statements</button>
        </div>
        <RouterLink to="/cards" class="link link-primary text-xs whitespace-nowrap">Manage →</RouterLink>
      </div>
    </div>

    <EmptyState
      v-if="!cards.cards.length"
      variant="inline"
      emoji="💳"
      title="No cards tracked yet"
      message="Add your credit cards and monthly budgets — the widget will show you how your spending stacks up and what it means for your savings."
      action-label="Add a card →"
      action-to="/cards"
    />

    <template v-else>

      <!-- ══ SPEND VIEW ══ -->
      <template v-if="view === 'spend'">
        <div class="flex flex-wrap items-center gap-8">

          <!-- Collective ring -->
          <div class="flex flex-col items-center gap-2 shrink-0">
            <div class="h-5 flex items-center justify-center">
              <span
                v-if="totalRemaining !== null"
                class="font-mono tabular-nums text-xs font-semibold px-1.5 py-0.5 rounded-full"
                :class="totalOverBudget ? 'bg-error/15 text-error' : 'bg-success/15 text-success'"
              >{{ formatRemaining(totalRemaining) }}</span>
            </div>

            <div class="relative" style="width:132px;height:132px">
              <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r="54" fill="none" :stroke="TRACK" stroke-width="12" stroke-linecap="round" />
                <circle
                  v-if="totalBudget && totalPct !== null"
                  cx="66" cy="66" r="54"
                  fill="none"
                  :stroke="ringColor(totalPct, totalOverBudget, true)"
                  stroke-width="12"
                  stroke-linecap="round"
                  :stroke-dasharray="strokeProps(totalPct, 54).circ"
                  :stroke-dashoffset="strokeProps(totalPct, 54).offset"
                  transform="rotate(-90 66 66)"
                  style="transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)"
                />
                <circle
                  v-else
                  cx="66" cy="66" r="54"
                  fill="none"
                  stroke="oklch(var(--bc) / 0.18)"
                  stroke-width="10"
                  stroke-dasharray="9 7"
                  transform="rotate(-90 66 66)"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span
                  class="font-mono tabular-nums font-semibold leading-none"
                  :class="totalOverBudget ? 'text-error' : 'text-base-content'"
                  style="font-size:1rem"
                >{{ formatCurrency(totalSpent) }}</span>
                <span v-if="totalBudget" class="text-[11px] text-base-content/40 leading-none">
                  of {{ formatCurrency(totalBudget) }}
                </span>
                <span
                  v-if="totalPct !== null"
                  class="text-[11px] font-mono tabular-nums leading-none mt-0.5"
                  :class="totalOverBudget ? 'text-error' : 'text-base-content/50'"
                >{{ Math.round(totalRawPct) }}%</span>
              </div>
            </div>

            <div class="text-center">
              <p class="text-xs font-medium text-base-content/70">All cards</p>
              <p v-if="!totalBudget" class="text-[10px] text-base-content/35 mt-0.5">No budgets set</p>
            </div>
          </div>

          <!-- Vertical divider -->
          <div class="hidden sm:block self-stretch w-px bg-base-300 my-1"></div>

          <!-- Per-card rings -->
          <div class="flex flex-wrap gap-5 flex-1">
            <div v-for="d in cardData" :key="d.card.id" class="flex flex-col items-center gap-1.5">
              <div class="h-5 flex items-center justify-center">
                <span
                  v-if="d.remaining !== null"
                  class="font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  :class="d.overBudget ? 'bg-error/15 text-error' : 'bg-success/15 text-success'"
                >{{ formatRemaining(d.remaining) }}</span>
              </div>

              <div class="relative" style="width:80px;height:80px">
                <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
                  <circle cx="40" cy="40" r="32" fill="none" :stroke="TRACK" stroke-width="8" stroke-linecap="round" />
                  <circle
                    v-if="d.budget && d.pct !== null"
                    cx="40" cy="40" r="32"
                    fill="none"
                    :stroke="ringColor(d.pct, d.overBudget, true)"
                    stroke-width="8"
                    stroke-linecap="round"
                    :stroke-dasharray="strokeProps(d.pct, 32).circ"
                    :stroke-dashoffset="strokeProps(d.pct, 32).offset"
                    transform="rotate(-90 40 40)"
                    style="transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)"
                  />
                  <circle
                    v-else
                    cx="40" cy="40" r="32"
                    fill="none"
                    stroke="oklch(var(--bc) / 0.18)"
                    stroke-width="6"
                    stroke-dasharray="7 5"
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    class="font-mono tabular-nums font-semibold leading-none"
                    :class="[d.overBudget ? 'text-error' : 'text-base-content', d.spent >= 1000 ? 'text-[10px]' : 'text-xs']"
                  >{{ formatCurrency(d.spent) }}</span>
                </div>
              </div>

              <p class="text-xs font-medium text-base-content/70 text-center leading-tight" style="max-width:80px" :title="d.card.name">
                {{ d.card.name }}
              </p>
              <p v-if="d.budget" class="text-[10px] text-base-content/40 leading-none">
                {{ d.rawPct !== null ? Math.round(d.rawPct) + '%' : '—' }}
                of {{ formatCurrency(d.budget) }}
              </p>
              <p v-else class="text-[10px] text-base-content/30 leading-none">no budget</p>
              <p
                v-if="d.utilizationPct !== null"
                class="text-[10px] font-mono tabular-nums leading-none mt-0.5"
                :class="d.utilizationPct >= 30 ? 'text-error/70' : d.utilizationPct >= 20 ? 'text-warning/70' : 'text-success/70'"
                :title="`Credit utilization: ${d.utilizationPct.toFixed(1)}% of ${formatCurrency(d.card.creditLimit)} limit`"
              >
                {{ d.utilizationPct.toFixed(1) }}% util
              </p>
            </div>
          </div>
        </div>

        <!-- Secondary income savings impact -->
        <div v-if="showSecondaryImpact" class="mt-5 pt-5 border-t border-base-300">
          <p class="text-xs font-medium text-base-content/50 uppercase tracking-wide mb-3" style="letter-spacing:0.06em">
            Impact on secondary income savings
          </p>
          <div class="space-y-1.5 mb-4">
            <div class="flex items-center justify-between text-sm">
              <span class="text-base-content/60">Secondary income (avg)</span>
              <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(finance.secondaryIncomeBasis) }}</span>
            </div>
            <div class="flex items-center justify-between text-sm pl-3 border-l-2 border-base-300">
              <div>
                <span class="text-base-content/60">Card spend over ceiling</span>
                <span class="text-[10px] text-base-content/35 ml-1">
                  ({{ formatCurrency(totalSpent) }} spent − {{ formatCurrency(finance.suggestedCCCeiling) }} ceiling)
                </span>
              </div>
              <span
                class="font-mono tabular-nums"
                :class="ccOverage > 0 ? 'text-error' : 'text-base-content/40'"
              >{{ ccOverage > 0 ? `−${formatCurrency(ccOverage)}` : '—' }}</span>
            </div>
            <div class="border-t border-base-300 pt-2 flex items-center justify-between">
              <span class="text-sm font-medium">Left to save this month</span>
              <span
                class="font-mono tabular-nums text-xl font-bold"
                :class="secondaryAfterOverage >= finance.secondaryIncomeBasis * 0.9
                  ? 'text-info'
                  : secondaryAfterOverage >= 0
                    ? 'text-warning'
                    : 'text-error'"
              >{{ formatCurrency(secondaryAfterOverage) }}</span>
            </div>
          </div>
          <p v-if="ccOverage === 0" class="text-xs text-info/80 leading-snug">
            Card spend is within the suggested ceiling — secondary income of
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(finance.secondaryIncomeBasis) }}</span>
            is fully available to save this month.
          </p>
          <p v-else-if="secondaryAfterOverage >= 0" class="text-xs text-warning/80 leading-snug">
            Spending
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(ccOverage) }}</span>
            over the ceiling this month reduces your savings target from
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(finance.secondaryIncomeBasis) }}</span>
            to
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(secondaryAfterOverage) }}</span>.
          </p>
          <p v-else class="text-xs text-error/80 leading-snug">
            Card spend is
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(ccOverage) }}</span>
            over ceiling — this has fully consumed secondary income and is drawing
            <span class="font-mono tabular-nums font-semibold">{{ formatCurrency(Math.abs(secondaryAfterOverage)) }}</span>
            from primary income reserves.
          </p>
        </div>
      </template>

      <!-- ══ STATEMENTS VIEW ══ -->
      <template v-else>
        <p class="text-xs text-base-content/40 mb-4">
          Last month's statements auto-paying this month — sorted by payment date.
        </p>

        <div v-if="!statementsThisMonth.length" class="py-4 text-center text-sm text-base-content/40">
          No cards have an auto-pay day set.
          <RouterLink to="/cards" class="link link-primary ml-1">Add one →</RouterLink>
        </div>

        <div v-else class="flex flex-wrap gap-3">
          <div
            v-for="s in statementsThisMonth"
            :key="s.card.id"
            class="flex-1 min-w-[140px] rounded-xl border px-4 py-3 flex flex-col gap-1.5 transition-colors"
            :class="s.hasStatement
              ? 'border-success/25 bg-success/5'
              : 'border-dashed border-base-300 bg-base-200'">

            <!-- Card name -->
            <p class="text-xs font-medium text-base-content/60 truncate" :title="s.card.name">
              {{ s.card.name }}
            </p>

            <!-- Amount -->
            <div class="flex items-baseline gap-1">
              <p class="font-mono tabular-nums font-bold text-lg leading-none"
                 :class="s.hasStatement ? 'text-base-content' : 'text-base-content/40'">
                {{ s.amount !== null
                    ? formatCurrency(s.amount)
                    : s.fallbackAmount !== null
                      ? `~${formatCurrency(s.fallbackAmount)}`
                      : '—' }}
              </p>
              <span v-if="!s.hasStatement && s.fallbackAmount !== null" class="text-[10px] text-base-content/30">est.</span>
            </div>

            <!-- Auto-pay timing -->
            <div class="text-[11px] leading-snug mt-0.5">
              <template v-if="s.settledLabel">
                <span class="text-success/70 font-medium">Settled {{ s.settledLabel }}</span>
              </template>
              <template v-else-if="s.isPast">
                <span class="text-base-content/40">Expected {{ s.dueDateLabel }}</span>
              </template>
              <template v-else-if="s.isToday">
                <span class="text-warning font-medium">Auto-pays today</span>
              </template>
              <template v-else>
                <span class="text-base-content/45">Expected {{ s.dueDateLabel }}</span>
              </template>
            </div>

            <!-- Logged vs estimated indicator -->
            <p v-if="s.hasStatement" class="text-[10px] text-success/70">✓ amount logged</p>
            <p v-else class="text-[10px] text-base-content/30">amount not logged yet</p>
          </div>
        </div>

        <!-- Total row -->
        <div v-if="statementsThisMonth.length" class="mt-4 pt-3 border-t border-base-300 flex items-center justify-between">
          <span class="text-xs text-base-content/50">
            {{ statementsThisMonth.filter(s => s.hasStatement).length }} of {{ statementsThisMonth.length }} logged
          </span>
          <span class="font-mono tabular-nums text-sm font-semibold">
            {{ formatCurrency(statementsThisMonth.reduce((a, s) => a + (s.amount ?? s.fallbackAmount ?? 0), 0)) }}
            <span class="text-xs font-normal text-base-content/40 ml-1">total auto-paying</span>
          </span>
        </div>
      </template>

    </template>
  </div>
</template>