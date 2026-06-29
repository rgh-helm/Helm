<script setup>
import { computed, ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatCurrency, currentMonthKey, previousMonthKey } from '../utils/format'
import CategoryBreakdownChart from './CategoryBreakdownChart.vue'
import CardMonthPanel from './CardMonthPanel.vue'

const props = defineProps({
  stats: { type: Object, required: true },
})
const emit = defineEmits(['edit'])

const cards = useCreditCardStore()
const settings = useSettingsStore()
const showManage = ref(false)
const showHistory = ref(false)
const showBreakdown = ref(false)

const thisMonth = currentMonthKey()
const lastMonth = previousMonthKey()

function isEditableViaHistory(month) {
  return month !== lastMonth && month !== thisMonth
}

const editingMonth = ref(null)
const backfillMonth = ref('')

function openEditor(month) {
  editingMonth.value = month
}

async function removeCard() {
  if (confirm(`Delete "${props.stats.card.name}"? This removes its full balance history too.`)) {
    await cards.deleteCard(props.stats.card.id)
  }
}

async function removeBalance(id, month) {
  if (confirm('Delete this monthly balance entry?')) {
    await cards.deleteBalance(id)
    if (editingMonth.value === month) editingMonth.value = null
  }
}

const target = computed(() => props.stats.card.targetBudget)
const overPercent = computed(() => {
  if (!target.value || props.stats.currentMonthAmount == null) return 0
  return Math.min((props.stats.currentMonthAmount / target.value) * 100, 100)
})

const creditLimit = computed(() => props.stats.card.creditLimit ?? null)
const utilizationAmount = computed(() =>
  props.stats.currentMonthAmount ?? props.stats.latestAmount ?? 0
)
const utilizationPct = computed(() =>
  creditLimit.value ? (utilizationAmount.value / creditLimit.value) * 100 : null
)
const utilizationColor = computed(() => {
  const pct = utilizationPct.value
  if (pct === null) return 'text-base-content/50'
  if (pct >= 30) return 'text-error'
  if (pct >= 20) return 'text-warning'
  return 'text-success'
})

const autoPayHint = computed(() => {
  const dueDay = props.stats.card.statementDueDay
  if (!dueDay) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const history = [...props.stats.history].sort((a, b) => b.month.localeCompare(a.month))
  for (const entry of history) {
    const [y, m] = entry.month.split('-').map(Number)
    const dueDate = new Date(y, m, dueDay)
    dueDate.setHours(0, 0, 0, 0)
    if (dueDate >= today) {
      const dateLabel = dueDate.toLocaleDateString('default', { month: 'long', day: 'numeric' })
      return { label: `auto-pays ${dateLabel}`, amount: formatCurrency(entry.amount), isEstimate: false }
    }
  }

  const avgAmount = props.stats.average ?? null
  if (!avgAmount) return null
  const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  const dateLabel = nextDue.toLocaleDateString('default', { month: 'long', day: 'numeric' })
  return { label: `auto-pays ${dateLabel}`, amount: `~${formatCurrency(avgAmount)}`, isEstimate: true }
})

// Budget status label
const budgetStatus = computed(() => {
  if (!target.value) return null
  if (props.stats.currentMonthAmount == null) return { text: 'not logged', cls: 'text-base-content/35' }
  return props.stats.overBudget
    ? { text: 'over budget', cls: 'text-error' }
    : { text: 'on track', cls: 'text-success' }
})
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-4 flex flex-col gap-3">

    <!-- ── Always-visible summary ── -->
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="font-display text-base font-semibold leading-tight">{{ stats.card.name }}</h3>
          <span v-if="budgetStatus" class="text-xs" :class="budgetStatus.cls">{{ budgetStatus.text }}</span>
        </div>
        <p class="text-xs text-base-content/50 mt-0.5">
          <span v-if="target">Target: {{ formatCurrency(target) }}/mo</span>
          <span v-if="stats.card.statementDueDay" class="ml-2">· Due day {{ stats.card.statementDueDay }}</span>
          <span v-if="creditLimit" class="ml-2">· Limit: {{ formatCurrency(creditLimit) }}</span>
        </p>
      </div>
      <div class="flex gap-1 shrink-0">
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('edit', stats.card)">Edit</button>
        <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeCard">Delete</button>
      </div>
    </div>

    <!-- ── Key numbers row ── -->
    <div class="flex items-end gap-4">
      <div class="flex gap-4 flex-1 min-w-0">
        <div>
          <p class="text-[10px] text-base-content/50 uppercase tracking-wide">
            {{ stats.isCurrentMonth ? 'This month' : stats.latestMonth ?? 'Latest' }}
          </p>
          <p class="font-mono tabular-nums font-semibold text-sm">
            {{ (stats.isCurrentMonth ? stats.currentMonthAmount : stats.latestAmount) != null
                ? formatCurrency(stats.isCurrentMonth ? stats.currentMonthAmount : stats.latestAmount)
                : '—' }}
          </p>
        </div>
        <div>
          <p class="text-[10px] text-base-content/50 uppercase tracking-wide">{{ settings.trailingAverageMonths }}-mo avg</p>
          <p class="font-mono tabular-nums font-semibold text-sm">{{ formatCurrency(stats.average) }}</p>
        </div>
        <div v-if="utilizationPct !== null">
          <p class="text-[10px] text-base-content/50 uppercase tracking-wide">Utilization</p>
          <p class="font-mono tabular-nums font-semibold text-sm" :class="utilizationColor">
            {{ utilizationPct.toFixed(1) }}%
          </p>
        </div>
      </div>
    </div>

    <!-- ── Next payment (full width, no overflow risk) ── -->
    <div v-if="autoPayHint" class="flex items-baseline gap-1.5">
      <span class="text-[10px] text-base-content/50 uppercase tracking-wide shrink-0">Next payment</span>
      <span class="font-mono tabular-nums font-semibold text-xs" :class="autoPayHint.isEstimate ? 'text-base-content/40' : 'text-base-content/80'">
        {{ autoPayHint.amount }}
      </span>
      <span class="text-base-content/40 text-xs truncate">{{ autoPayHint.label }}</span>
    </div>

    <!-- ── Progress bars (compact) ── -->
    <div v-if="target || creditLimit" class="flex flex-col gap-1.5">
      <div v-if="target" class="flex items-center gap-2">
        <span class="text-[10px] text-base-content/40 w-16 shrink-0">vs target</span>
        <progress
          class="progress flex-1 h-1.5"
          :class="stats.isCurrentMonth ? (stats.overBudget ? 'progress-error' : 'progress-success') : 'progress-neutral opacity-30'"
          :value="overPercent" max="100"
        />
        <span class="text-[10px] text-base-content/40 w-8 text-right">{{ Math.round(overPercent) }}%</span>
      </div>
      <div v-if="creditLimit && utilizationPct !== null" class="flex items-center gap-2">
        <span class="text-[10px] text-base-content/40 w-16 shrink-0">utilization</span>
        <progress
          class="progress flex-1 h-1.5"
          :class="utilizationPct >= 30 ? 'progress-error' : utilizationPct >= 20 ? 'progress-warning' : 'progress-success'"
          :value="Math.min(utilizationPct, 100)" max="100"
        />
        <span class="text-[10px] text-base-content/40 w-8 text-right">{{ utilizationPct.toFixed(0) }}%</span>
      </div>
    </div>

    <!-- ── Manage toggle — always pushed to bottom via mt-auto ── -->
    <div class="mt-auto">
      <hr class="border-base-300 mb-2" />
      <button
        type="button"
        class="btn btn-ghost btn-xs w-full flex items-center justify-center gap-1 text-base-content/40 hover:text-base-content/70"
        @click="showManage = !showManage"
      >
        <span>{{ showManage ? 'Hide' : 'Manage' }}</span>
        <svg class="w-3 h-3 transition-transform" :class="showManage ? 'rotate-180' : ''" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 4l4 4 4-4"/>
        </svg>
      </button>
    </div>

    <!-- ── Collapsible manage zone ── -->
    <div
      class="overflow-hidden transition-all duration-300 ease-in-out"
      :style="showManage ? 'max-height: 1000px; opacity: 1;' : 'max-height: 0; opacity: 0;'"
    >
      <div class="flex flex-col gap-4">

        <CardMonthPanel
          :cardId="stats.card.id"
          :month="lastMonth"
          label="Last month's statement"
          :showSettlement="!!stats.card.statementDueDay"
        />
        <CardMonthPanel
          :cardId="stats.card.id"
          :month="thisMonth"
          label="This month so far"
        />

        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" class="btn btn-ghost btn-xs" @click="showHistory = !showHistory">
            {{ showHistory ? 'Hide history' : `View history (${stats.history.length})` }}
          </button>
          <button type="button" class="btn btn-ghost btn-xs" @click="showBreakdown = !showBreakdown">
            {{ showBreakdown ? 'Hide breakdown' : 'View breakdown' }}
          </button>
        </div>

        <div v-if="showBreakdown">
          <CategoryBreakdownChart :breakdown="cards.cardCategoryBreakdown(stats.card.id)" />
        </div>

        <div v-if="showHistory" class="space-y-3">
          <div class="flex items-center gap-2 flex-wrap">
            <label class="text-xs text-base-content/60">Edit or backfill a month</label>
            <input type="month" class="input input-bordered input-xs" v-model="backfillMonth" :max="thisMonth" />
            <button type="button" class="btn btn-ghost btn-xs" :disabled="!backfillMonth" @click="openEditor(backfillMonth)">Open</button>
          </div>

          <div v-if="editingMonth" class="rounded-lg border border-base-300 bg-base-200/40 p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-medium text-base-content/60">Editing {{ editingMonth }}</span>
              <button type="button" class="btn btn-ghost btn-xs" @click="editingMonth = null">Done</button>
            </div>
            <CardMonthPanel
              :key="editingMonth"
              :cardId="stats.card.id"
              :month="editingMonth"
              label="Statement"
              @saved="editingMonth = null"
            />
          </div>

          <div class="overflow-x-auto">
            <table class="table table-xs">
              <tbody>
                <tr v-for="entry in [...stats.history].reverse()" :key="entry.id">
                  <td>
                    {{ entry.month }}
                    <span v-if="entry.categories?.length" class="text-base-content/40">
                      ({{ entry.categories.length }} {{ entry.categories.length === 1 ? 'category' : 'categories' }})
                    </span>
                  </td>
                  <td class="text-right font-mono tabular-nums">{{ formatCurrency(entry.amount) }}</td>
                  <td class="text-right whitespace-nowrap">
                    <button v-if="isEditableViaHistory(entry.month)" type="button" class="btn btn-ghost btn-xs" @click="openEditor(entry.month)">Edit</button>
                    <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeBalance(entry.id, entry.month)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>