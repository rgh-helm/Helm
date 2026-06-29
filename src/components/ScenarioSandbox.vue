<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler,
} from 'chart.js'
import { useScenarioStore }    from '../stores/scenarioStore'
import { useAccountsStore }    from '../stores/accountsStore'
import { useFinanceStore }     from '../stores/financeStore'
import { useCreditCardStore }  from '../stores/creditCardStore'
import { useSettingsStore }    from '../stores/settingsStore'
import {
  buildMonthChain, simulateMonth, getItemsForMonth,
} from '../composables/useTimelineSimulation'
import {
  currentMonthKey, shiftMonthKey, formatCurrency, formatMonthLabel,
} from '../utils/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const props = defineProps({
  month: { type: String, default: null },
})

const scenarioStore = useScenarioStore()
const accounts      = useAccountsStore()
const finance       = useFinanceStore()
const cards         = useCreditCardStore()
const settings      = useSettingsStore()

const calToday    = currentMonthKey()
const activeMonth = computed(() => props.month ?? calToday)
const rangeMonths = ref(6)

// ── Scenario management ───────────────────────────────────
const editingName  = ref(false)
const nameInput    = ref('')
const editingNotes = ref(false)
const notesInput   = ref('')

onMounted(async () => {
  await scenarioStore.loadScenarios()
})

async function createScenario() {
  await scenarioStore.saveScenario({
    name: 'New scenario',
    notes: '',
    adjustments: [],
  })
}

async function renameScenario() {
  if (!scenarioStore.activeScenario) return
  await scenarioStore.saveScenario({
    ...scenarioStore.activeScenario,
    name: nameInput.value.trim() || 'Untitled',
  })
  editingName.value = false
}

function startRename() {
  nameInput.value = scenarioStore.activeScenario?.name ?? ''
  editingName.value = true
}

async function saveNotes() {
  if (!scenarioStore.activeScenario) return
  await scenarioStore.saveScenario({
    ...scenarioStore.activeScenario,
    notes: notesInput.value,
  })
  editingNotes.value = false
}

function startNotes() {
  notesInput.value = scenarioStore.activeScenario?.notes ?? ''
  editingNotes.value = true
}

async function confirmDelete() {
  if (!scenarioStore.activeScenario) return
  if (confirm(`Delete "${scenarioStore.activeScenario.name}"?`)) {
    await scenarioStore.deleteScenario(scenarioStore.activeScenario.id)
  }
}

// ── Adjustment UI ─────────────────────────────────────────
const ADJ_TYPES = [
  { value: 'cc_reduce_pct',    label: 'Reduce all CC spend by %' },
  { value: 'cc_reduce_card',   label: 'Reduce one card by $' },
  { value: 'transfer_savings', label: 'Transfer to savings monthly' },
  { value: 'add_expense',      label: 'Add a recurring expense' },
  { value: 'remove_expense',   label: 'Remove an expense' },
  { value: 'change_income',    label: 'Change an income amount' },
  { value: 'one_time_expense', label: 'One-time expense in a month' },
]

async function addAdjustment(type) {
  const defaults = {
    cc_reduce_pct:    { value: 10 },
    cc_reduce_card:   { cardId: cards.cards[0]?.id ?? null, value: 50 },
    transfer_savings: { value: 500, dayOfMonth: 28 },
    add_expense:      { label: '', amount: 0, dayOfMonth: null },
    remove_expense:   { label: '' },
    change_income:    { label: '', amount: 0 },
    one_time_expense: { label: '', amount: 0, month: activeMonth.value, dayOfMonth: null },
  }
  await scenarioStore.addAdjustment({ type, ...defaults[type] })
}

async function removeAdj(id) {
  await scenarioStore.removeAdjustment(id)
}

async function patchAdj(id, patch) {
  await scenarioStore.updateAdjustment(id, patch)
}

// ── Opening balance (same walk-back logic as CashFlowTimeline) ────────────
const loggedOpening = computed(() => {
  if (!accounts.transactionAccount) return null
  return accounts.balanceForAccountMonth(
    accounts.transactionAccount.id,
    shiftMonthKey(activeMonth.value, -1)
  )
})

const projectedOpening = computed(() => {
  if (!accounts.transactionAccount) return null
  const MAX = 12
  let anchorMonth = null, anchorBalance = null
  for (let i = 1; i <= MAX; i++) {
    const m = shiftMonthKey(activeMonth.value, -i)
    const logged = accounts.balanceForAccountMonth(accounts.transactionAccount.id, m)
    if (logged !== null) { anchorMonth = m; anchorBalance = logged; break }
  }
  if (anchorMonth === null) return null
  let balance = anchorBalance
  let m = shiftMonthKey(anchorMonth, 1)
  while (m < activeMonth.value) {
    const sim = simulateMonth(m, balance, getItemsForMonth(m, { financeStore: finance, cardsStore: cards }))
    balance = sim.closingBalance
    m = shiftMonthKey(m, 1)
  }
  return balance
})

const openingBalance = computed(() => loggedOpening.value ?? projectedOpening.value)

// ── Build both simulation chains ──────────────────────────
const chainArgs = computed(() => ({
  startMonth:    activeMonth.value,
  rangeMonths:   rangeMonths.value,
  openingBalance: openingBalance.value,
  calToday,
  accountsStore: accounts,
  financeStore:  finance,
  cardsStore:    cards,
}))

const baselineSims = computed(() => {
  if (openingBalance.value === null) return []
  return buildMonthChain({ ...chainArgs.value, adjustments: [] })
})

const scenarioSims = computed(() => {
  if (openingBalance.value === null || !scenarioStore.activeScenario) return []
  return buildMonthChain({
    ...chainArgs.value,
    adjustments: scenarioStore.activeAdjustments,
  })
})

// ── Chart data ────────────────────────────────────────────
function simsToSeries(sims) {
  const balances = []
  const labels   = []
  let first = true
  for (const sim of sims) {
    const [y, m] = sim.monthKey.split('-').map(Number)
    const monthName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' })
    if (first) {
      balances.push(sim.openingBalance)
      labels.push('Start')
      first = false
    }
    for (let d = 1; d <= sim.daysInMonth; d++) {
      balances.push(sim.balances[d - 1])
      if (d === 1)          labels.push(`${monthName} 1`)
      else if (d % 7 === 1) labels.push(String(d))
      else                  labels.push('')
    }
  }
  return { balances, labels }
}

const chartData = computed(() => {
  const base     = simsToSeries(baselineSims.value)
  const scenario = simsToSeries(scenarioSims.value)
  const labels   = base.labels.length >= scenario.labels.length ? base.labels : scenario.labels

  const scenarioDelta = scenarioSims.value.at(-1)?.closingBalance != null && baselineSims.value.at(-1)?.closingBalance != null
    ? scenarioSims.value.at(-1).closingBalance - baselineSims.value.at(-1).closingBalance
    : null

  return {
    labels,
    datasets: [
      {
        label: 'Baseline',
        data: base.balances,
        borderColor: 'rgba(148, 163, 184, 0.7)',
        backgroundColor: 'rgba(148, 163, 184, 0.05)',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      },
      {
        label: scenarioStore.activeScenario?.name ?? 'Scenario',
        data: scenario.balances,
        borderColor: 'rgba(79, 174, 133, 1)',
        backgroundColor: 'rgba(79, 174, 133, 0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: 'origin',
      },
    ],
    scenarioDelta,
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        title: (items) => items[0]?.label || '',
        label: (item) => {
          const v = item.raw
          return ` ${item.dataset.label}: ${formatCurrency(v)}`
        },
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
    y: {
      grid: { color: 'rgba(128,128,128,0.1)' },
      ticks: {
        font: { size: 10 },
        callback: (v) => `$${(v / 1000).toFixed(0)}k`,
      },
    },
  },
}))

// ── Income / expense label options ────────────────────────
const incomeLabels = computed(() => {
  const snap = finance.sortedSnapshots.at(-1)
  if (!snap) return []
  return [...new Set((snap.incomeItems || []).map((i) => i.label).filter(Boolean))]
})

const expenseLabels = computed(() => {
  const snap = finance.sortedSnapshots.at(-1)
  if (!snap) return []
  return [...new Set((snap.expenseItems || []).map((i) => i.label).filter(Boolean))]
})

function labelForAdj(adj) {
  switch (adj.type) {
    case 'cc_reduce_pct':    return `Reduce all CC spend by ${adj.value}%`
    case 'cc_reduce_card': {
      const card = cards.cards.find((c) => c.id === adj.cardId)
      return `Reduce ${card?.name ?? 'card'} by ${formatCurrency(adj.value)}/mo`
    }
    case 'transfer_savings': return `Transfer ${formatCurrency(adj.value)} to savings/mo`
    case 'add_expense':      return `Add "${adj.label}" ${formatCurrency(adj.amount)}/mo`
    case 'remove_expense':   return `Remove "${adj.label}"`
    case 'change_income':    return `Set "${adj.label}" income to ${formatCurrency(adj.amount)}`
    case 'one_time_expense': return `One-time: "${adj.label}" ${formatCurrency(adj.amount)} in ${formatMonthLabel(adj.month)}`
    default: return adj.type
  }
}
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4 shadow-lg shadow-secondary/5">

    <!-- ── Header ── -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h3 class="font-display text-base font-semibold text-base-content/80">Forecast Sandbox</h3>
      <div class="flex items-center gap-2">
        <!-- Range selector -->
        <div class="join">
          <button v-for="n in [1,3,6,12]" :key="n"
            class="join-item btn btn-xs"
            :class="rangeMonths === n ? 'btn-primary' : 'btn-ghost'"
            @click="rangeMonths = n">
            {{ n }}mo
          </button>
        </div>
      </div>
    </div>

    <!-- ── No transaction account ── -->
    <div v-if="!accounts.transactionAccount" class="py-6 text-center text-sm text-base-content/40">
      Set a transaction account to enable the sandbox.
    </div>

    <template v-else>
      <!-- ── Scenario picker ── -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          v-for="s in scenarioStore.scenarios" :key="s.id"
          class="btn btn-sm"
          :class="scenarioStore.activeId === s.id ? 'btn-primary' : 'btn-ghost border border-base-300'"
          @click="scenarioStore.activeId = s.id">
          {{ s.name }}
        </button>
        <button class="btn btn-sm btn-ghost border border-dashed border-base-300 text-base-content/40"
          @click="createScenario">
          + New scenario
        </button>
      </div>

      <!-- ── No scenarios yet ── -->
      <div v-if="!scenarioStore.activeScenario" class="py-6 text-center text-sm text-base-content/40">
        Create a scenario to start exploring what-if changes.
      </div>

      <template v-else>
        <!-- ── Scenario header ── -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <!-- Name -->
            <div v-if="!editingName" class="flex items-center gap-2">
              <span class="font-medium text-sm">{{ scenarioStore.activeScenario.name }}</span>
              <button class="btn btn-ghost btn-xs text-base-content/40" @click="startRename">rename</button>
              <button class="btn btn-ghost btn-xs text-error/50" @click="confirmDelete">delete</button>
            </div>
            <div v-else class="flex items-center gap-2">
              <input class="input input-sm input-bordered text-sm w-48" v-model="nameInput"
                @keydown.enter="renameScenario" @keydown.escape="editingName = false" />
              <button class="btn btn-sm btn-primary" @click="renameScenario">Save</button>
              <button class="btn btn-sm btn-ghost" @click="editingName = false">Cancel</button>
            </div>

            <!-- Notes -->
            <div v-if="!editingNotes" class="mt-1">
              <p v-if="scenarioStore.activeScenario.notes"
                class="text-xs text-base-content/50 leading-snug whitespace-pre-wrap">
                {{ scenarioStore.activeScenario.notes }}
              </p>
              <button class="text-xs text-base-content/30 hover:text-base-content/50 mt-0.5"
                @click="startNotes">
                {{ scenarioStore.activeScenario.notes ? 'edit notes' : '+ add notes' }}
              </button>
            </div>
            <div v-else class="mt-1 flex flex-col gap-1">
              <textarea class="textarea textarea-bordered textarea-sm text-xs w-full max-w-sm h-20"
                v-model="notesInput" placeholder="What is this scenario exploring?" />
              <div class="flex gap-2">
                <button class="btn btn-xs btn-primary" @click="saveNotes">Save</button>
                <button class="btn btn-xs btn-ghost" @click="editingNotes = false">Cancel</button>
              </div>
            </div>
          </div>

          <!-- Closing balance delta -->
          <div v-if="chartData.scenarioDelta !== null" class="text-right shrink-0">
            <p class="text-[10px] text-base-content/40">vs baseline at {{ rangeMonths }}mo</p>
            <p class="font-mono tabular-nums font-bold text-lg leading-none"
              :class="chartData.scenarioDelta >= 0 ? 'text-success' : 'text-error'">
              {{ chartData.scenarioDelta >= 0 ? '+' : '' }}{{ formatCurrency(chartData.scenarioDelta) }}
            </p>
          </div>
        </div>

        <!-- ── Chart ── -->
        <div class="relative h-52 w-full">
          <Line :data="chartData" :options="chartOptions" />
        </div>

        <!-- ── Adjustments list ── -->
        <div class="space-y-2">
          <p class="text-xs font-medium text-base-content/50 uppercase tracking-wide">Adjustments</p>

          <!-- Empty state -->
          <p v-if="!scenarioStore.activeAdjustments.length"
            class="text-xs text-base-content/35 italic">
            No adjustments yet — add one below to see how it affects the forecast.
          </p>

          <!-- Adjustment rows -->
          <div v-for="adj in scenarioStore.activeAdjustments" :key="adj._id"
            class="rounded-lg border border-base-300 bg-base-100 px-3 py-2.5 space-y-2">

            <!-- Row header: type label + remove -->
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-base-content/70">
                {{ ADJ_TYPES.find(t => t.value === adj.type)?.label ?? adj.type }}
              </span>
              <button class="btn btn-ghost btn-xs text-error/50" @click="removeAdj(adj._id)">✕</button>
            </div>

            <!-- cc_reduce_pct -->
            <div v-if="adj.type === 'cc_reduce_pct'" class="flex items-center gap-2">
              <input type="number" min="0" max="100" step="1"
                class="input input-xs input-bordered w-20 font-mono"
                :value="adj.value"
                @change="patchAdj(adj._id, { value: +$event.target.value })" />
              <span class="text-xs text-base-content/50">% reduction</span>
            </div>

            <!-- cc_reduce_card -->
            <div v-else-if="adj.type === 'cc_reduce_card'" class="flex items-center gap-2 flex-wrap">
              <select class="select select-xs select-bordered"
                :value="adj.cardId"
                @change="patchAdj(adj._id, { cardId: +$event.target.value })">
                <option v-for="c in cards.cards" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <span class="text-xs text-base-content/50">reduce by</span>
              <input type="number" min="0" step="1"
                class="input input-xs input-bordered w-24 font-mono"
                :value="adj.value"
                @change="patchAdj(adj._id, { value: +$event.target.value })" />
              <span class="text-xs text-base-content/50">$/mo</span>
            </div>

            <!-- transfer_savings -->
            <div v-else-if="adj.type === 'transfer_savings'" class="flex items-center gap-2 flex-wrap">
              <span class="text-xs text-base-content/50">$</span>
              <input type="number" min="0" step="1"
                class="input input-xs input-bordered w-28 font-mono"
                :value="adj.value"
                @change="patchAdj(adj._id, { value: +$event.target.value })" />
              <span class="text-xs text-base-content/50">on day</span>
              <input type="number" min="1" max="28" step="1"
                class="input input-xs input-bordered w-16 font-mono"
                :value="adj.dayOfMonth ?? 28"
                @change="patchAdj(adj._id, { dayOfMonth: +$event.target.value })" />
            </div>

            <!-- add_expense -->
            <div v-else-if="adj.type === 'add_expense'" class="flex items-center gap-2 flex-wrap">
              <input type="text" placeholder="Label" class="input input-xs input-bordered w-32"
                :value="adj.label"
                @change="patchAdj(adj._id, { label: $event.target.value })" />
              <input type="number" min="0" step="0.01" placeholder="Amount"
                class="input input-xs input-bordered w-24 font-mono"
                :value="adj.amount"
                @change="patchAdj(adj._id, { amount: +$event.target.value })" />
              <span class="text-xs text-base-content/50">day</span>
              <input type="number" min="1" max="31" placeholder="—"
                class="input input-xs input-bordered w-16 font-mono"
                :value="adj.dayOfMonth ?? ''"
                @change="patchAdj(adj._id, { dayOfMonth: $event.target.value ? +$event.target.value : null })" />
            </div>

            <!-- remove_expense -->
            <div v-else-if="adj.type === 'remove_expense'" class="flex items-center gap-2">
              <input type="text" placeholder="Exact expense label"
                class="input input-xs input-bordered w-48"
                :value="adj.label"
                @change="patchAdj(adj._id, { label: $event.target.value })" />
              <select class="select select-xs select-bordered text-xs"
                @change="patchAdj(adj._id, { label: $event.target.value })">
                <option value="">pick from list…</option>
                <option v-for="l in expenseLabels" :key="l" :value="l">{{ l }}</option>
              </select>
            </div>

            <!-- change_income -->
            <div v-else-if="adj.type === 'change_income'" class="flex items-center gap-2 flex-wrap">
              <select class="select select-xs select-bordered text-xs"
                :value="adj.label"
                @change="patchAdj(adj._id, { label: $event.target.value })">
                <option value="">pick income source…</option>
                <option v-for="l in incomeLabels" :key="l" :value="l">{{ l }}</option>
              </select>
              <span class="text-xs text-base-content/50">→</span>
              <input type="number" min="0" step="0.01"
                class="input input-xs input-bordered w-28 font-mono"
                :value="adj.amount"
                @change="patchAdj(adj._id, { amount: +$event.target.value })" />
              <span class="text-xs text-base-content/50">$/mo</span>
            </div>

            <!-- one_time_expense -->
            <div v-else-if="adj.type === 'one_time_expense'" class="flex items-center gap-2 flex-wrap">
              <input type="text" placeholder="Label" class="input input-xs input-bordered w-32"
                :value="adj.label"
                @change="patchAdj(adj._id, { label: $event.target.value })" />
              <input type="number" min="0" step="0.01"
                class="input input-xs input-bordered w-24 font-mono"
                :value="adj.amount"
                @change="patchAdj(adj._id, { amount: +$event.target.value })" />
              <span class="text-xs text-base-content/50">in</span>
              <input type="month"
                class="input input-xs input-bordered font-mono"
                :value="adj.month"
                @change="patchAdj(adj._id, { month: $event.target.value })" />
            </div>

            <!-- Summary pill -->
            <p class="text-[10px] text-base-content/35 font-mono">{{ labelForAdj(adj) }}</p>
          </div>

          <!-- Add adjustment menu -->
          <div class="dropdown">
            <div tabindex="0" role="button" class="btn btn-sm btn-ghost border border-dashed border-base-300 text-base-content/40 w-full">
              + Add adjustment
            </div>
            <ul tabindex="0" class="dropdown-content z-10 menu menu-sm bg-base-200 rounded-box w-64 shadow mt-1 p-1">
              <li v-for="t in ADJ_TYPES" :key="t.value">
                <button @click="addAdjustment(t.value)">{{ t.label }}</button>
              </li>
            </ul>
          </div>
        </div>

      </template>
    </template>
  </div>
</template>