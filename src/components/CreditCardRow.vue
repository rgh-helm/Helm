<script setup>
import { computed, ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatCurrency, currentMonthKey, previousMonthKey } from '../utils/format'
import CategoryBreakdownChart from './CategoryBreakdownChart.vue'
import CardMonthPanel from './CardMonthPanel.vue'

const props = defineProps({
  stats: { type: Object, required: true }, // { card, history, latestAmount, latestMonth, currentMonthAmount, isCurrentMonth, average, overBudget }
})
const emit = defineEmits(['edit'])

const cards = useCreditCardStore()
const settings = useSettingsStore()
const showHistory = ref(false)
const showBreakdown = ref(false)

const thisMonth = currentMonthKey()
const lastMonth = previousMonthKey()

// Last month and this month each already have a dedicated, always-visible
// panel above — editing them again via history would just be a confusing
// second editor for the same data, so history's own Edit button is only
// offered for anything older than that.
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

// Credit utilization — current month balance vs credit limit
const creditLimit = computed(() => props.stats.card.creditLimit ?? null)
const utilizationAmount = computed(() =>
  props.stats.currentMonthAmount ?? props.stats.latestAmount ?? 0
)
const utilizationPct = computed(() =>
  creditLimit.value ? (utilizationAmount.value / creditLimit.value) * 100 : null
)
const utilizationColor = computed(() => {
  const pct = utilizationPct.value
  if (pct === null) return ''
  if (pct >= 30) return 'text-error'
  if (pct >= 20) return 'text-warning'
  return 'text-success'
})

// Auto-pay hint: "$120 auto-pays June 29th" — uses last month's logged
// amount if available, trailing average as fallback (shown with ~).
const autoPayHint = computed(() => {
  const dueDay = props.stats.card.statementDueDay
  if (!dueDay) return null

  const today = new Date()
  const todayDay = today.getDate()
  const month = today.getMonth()
  const year = today.getFullYear()

  // Upcoming auto-pay: if the due day hasn't passed yet this month it's
  // this month, otherwise next month.
  let billingDate
  if (todayDay <= dueDay) {
    billingDate = new Date(year, month, dueDay)
  } else {
    billingDate = new Date(year, month + 1, dueDay)
  }

  const dateLabel = billingDate.toLocaleDateString('default', { month: 'long', day: 'numeric' })

  // Amount: prefer last month's actual logged balance, fall back to average
  const lastMonthRecord = cards.balanceRecordForCardMonth(props.stats.card.id, lastMonth)
  const amount = lastMonthRecord?.amount ?? null
  const avgAmount = props.stats.average ?? null

  if (amount !== null) {
    return { label: `auto-pays ${dateLabel}`, amount: formatCurrency(amount), isEstimate: false }
  } else if (avgAmount) {
    return { label: `auto-pays ${dateLabel}`, amount: `~${formatCurrency(avgAmount)}`, isEstimate: true }
  } else {
    return { label: `auto-pays ${dateLabel}`, amount: null, isEstimate: false }
  }
})
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-100 p-5 flex flex-col gap-4">
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="font-display text-lg font-semibold">{{ stats.card.name }}</h3>
        </div>
        <p class="text-xs text-base-content/60">
          {{ target ? `Target: ${formatCurrency(target)}/mo` : 'No monthly target set' }}
          <span v-if="stats.card.statementDueDay" class="ml-2 opacity-75">· Due day {{ stats.card.statementDueDay }}</span>
          <span v-if="creditLimit" class="ml-2 opacity-75">· Limit: {{ formatCurrency(creditLimit) }}</span>
        </p>
        <p v-if="autoPayHint" class="text-xs mt-0.5">
          <span class="font-mono tabular-nums font-semibold" :class="autoPayHint.isEstimate ? 'text-base-content/40' : 'text-base-content/70'">
            {{ autoPayHint.amount ?? '—' }}
          </span>
          <span class="text-base-content/40 ml-1">{{ autoPayHint.label }}</span>
        </p>
      </div>
      <div class="flex gap-1">
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('edit', stats.card)">Edit</button>
        <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeCard">Delete</button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p class="text-xs text-base-content/60">
          {{ stats.isCurrentMonth ? 'This month' : stats.latestMonth ? `Last logged (${stats.latestMonth})` : 'Latest logged' }}
        </p>
        <p class="font-mono tabular-nums font-semibold">
          {{ (stats.isCurrentMonth ? stats.currentMonthAmount : stats.latestAmount) != null
              ? formatCurrency(stats.isCurrentMonth ? stats.currentMonthAmount : stats.latestAmount)
              : '—' }}
        </p>
      </div>
      <div>
        <p class="text-xs text-base-content/60">{{ settings.trailingAverageMonths }}-month average</p>
        <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(stats.average) }}</p>
      </div>
    </div>

    <div v-if="target">
      <div class="flex justify-between text-xs text-base-content/60 mb-1">
        <span>This month vs. target</span>
        <span v-if="stats.isCurrentMonth" :class="stats.overBudget ? 'text-error' : 'text-success'">
          {{ stats.overBudget ? 'Over budget' : 'On track' }}
        </span>
        <span v-else class="text-base-content/35 italic">not logged yet</span>
      </div>
      <progress
        class="progress w-full"
        :class="stats.isCurrentMonth
          ? (stats.overBudget ? 'progress-error' : 'progress-success')
          : 'progress-neutral opacity-30'"
        :value="overPercent"
        max="100"
      ></progress>
    </div>

    <!-- Credit utilization bar -->
    <div v-if="creditLimit && utilizationPct !== null">
      <div class="flex justify-between text-xs text-base-content/60 mb-1">
        <span>Credit utilization</span>
        <span :class="utilizationColor" class="font-mono tabular-nums font-medium">
          {{ utilizationPct.toFixed(1) }}%
          <span class="font-normal text-base-content/40">
            ({{ formatCurrency(utilizationAmount) }} of {{ formatCurrency(creditLimit) }})
          </span>
        </span>
      </div>
      <progress
        class="progress w-full"
        :class="utilizationPct >= 30 ? 'progress-error' : utilizationPct >= 20 ? 'progress-warning' : 'progress-success'"
        :value="Math.min(utilizationPct, 100)"
        max="100"
      ></progress>
      <p class="text-[10px] text-base-content/35 mt-1">
        Keep utilization under 30% for best credit score impact — ideally under 10%.
      </p>
    </div>

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

    <div v-if="stats.history.length" class="flex items-center gap-2 flex-wrap">
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
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="!backfillMonth"
          @click="openEditor(backfillMonth)"
        >
          Open
        </button>
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
                <button
                  v-if="isEditableViaHistory(entry.month)"
                  type="button"
                  class="btn btn-ghost btn-xs"
                  @click="openEditor(entry.month)"
                >
                  Edit
                </button>
                <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeBalance(entry.id, entry.month)">
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>