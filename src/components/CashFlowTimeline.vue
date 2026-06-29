<script setup>
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { currentMonthKey, shiftMonthKey, formatCurrency, formatMonthLabel } from '../utils/format'
import {
  cardPaymentInfo as _cardPaymentInfo,
  getItemsForMonth as _getItemsForMonth,
  simulateMonth,
  UNDATED_INCOME_DEFAULT_DAY,
  WHAT_IF_SHIFT,
} from '../composables/useTimelineSimulation'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const props = defineProps({
  // When provided by DataEntryView, show this month instead of the real
  // current month. Falls back to currentMonthKey() when used standalone.
  month: { type: String, default: null },
})

const accounts  = useAccountsStore()
const finance   = useFinanceStore()
const settings  = useSettingsStore()
const cards     = useCreditCardStore()

// ── Range toggle ──────────────────────────────────────────
const rangeMonths = ref(1)

// ── Date context ──────────────────────────────────────────
// activeMonth is the month being displayed (may differ from today).
// calToday is always the real current calendar month — used to decide
// whether to show the "today" marker and which what-if tests to run.
const calToday    = currentMonthKey()
const todayDate   = new Date()
const activeMonth = computed(() => props.month ?? calToday)

const isDisplayingToday = computed(() => activeMonth.value === calToday)
const todayDayOfMonth   = computed(() =>
  isDisplayingToday.value ? todayDate.getDate() : null
)

const transactionAccount = computed(() => accounts.transactionAccount)

// The logged balance for the previous month — ground truth when available.
const loggedOpeningBalance = computed(() => {
  if (!transactionAccount.value) return null
  return accounts.balanceForAccountMonth(
    transactionAccount.value.id,
    shiftMonthKey(activeMonth.value, -1)
  )
})

// When no logged balance exists for the previous month, walk back until
// we find a logged balance then simulate forward month-by-month to arrive
// at a projected opening. Caps at 12 months back to avoid runaway loops.
const projectedOpeningBalance = computed(() => {
  if (!transactionAccount.value) return null

  // Find the most recent month that has a logged balance, up to 12 months back
  const MAX_LOOKBACK = 12
  let anchorMonth = null
  let anchorBalance = null
  for (let i = 1; i <= MAX_LOOKBACK; i++) {
    const m = shiftMonthKey(activeMonth.value, -i)
    const logged = accounts.balanceForAccountMonth(transactionAccount.value.id, m)
    if (logged !== null) {
      anchorMonth = m
      anchorBalance = logged
      break
    }
  }
  if (anchorMonth === null) return null

  // Simulate forward from the anchor up to (but not including) activeMonth
  let balance = anchorBalance
  let m = shiftMonthKey(anchorMonth, 1)
  while (m < activeMonth.value) {
    const sim = simulateMonth(m, balance, getItemsForMonth(m))
    balance = sim.closingBalance
    m = shiftMonthKey(m, 1)
  }
  return balance
})

const openingBalance = computed(() =>
  loggedOpeningBalance.value ?? projectedOpeningBalance.value
)

// True when the opening balance is estimated rather than confirmed —
// drives the soft reminder banner in the template.
const openingBalanceIsProjected = computed(() =>
  loggedOpeningBalance.value === null && projectedOpeningBalance.value !== null
)

// Thin wrappers that bind the local store instances to the composable fns.
const cardPaymentInfo  = (cardId, card, monthKey) => _cardPaymentInfo(cardId, card, monthKey, cards)

const getItemsForMonth = (monthKey) =>
  _getItemsForMonth(monthKey, { financeStore: finance, cardsStore: cards })


// ── Multi-month chain ─────────────────────────────────────
const monthSimulations = computed(() => {
  if (openingBalance.value === null || !transactionAccount.value) return []

  const sims = []
  let balance = openingBalance.value

  for (let i = 0; i < rangeMonths.value; i++) {
    const m = shiftMonthKey(activeMonth.value, i)
    // For fully elapsed past months, prefer the logged end-of-month balance
    // over the simulated closing balance — it's the ground truth. But for
    // the current and future months, carry the simulation forward: a logged
    // balance mid-month is not an end-of-month figure and would cause a
    // visible jump at the month boundary (e.g. June sim closes at $2,776
    // but July opens at the mid-June logged $4,302).
    if (i > 0) {
      const prevMonth = shiftMonthKey(activeMonth.value, i - 1)
      const isPastMonth = prevMonth < calToday
      if (isPastMonth) {
        const logged = accounts.balanceForAccountMonth(transactionAccount.value.id, prevMonth)
        if (logged !== null) balance = logged
      }
    }
    const sim = simulateMonth(m, balance, getItemsForMonth(m))
    sims.push(sim)
    balance = sim.closingBalance
  }
  return sims
})

// ── What-if stress tests (first/current month only) ──────
const currentMonthItems = computed(() => getItemsForMonth(activeMonth.value))

const whatIfIncomeLate = computed(() => {
  if (openingBalance.value === null) return null
  return simulateMonth(activeMonth.value, openingBalance.value, currentMonthItems.value, {
    incomeShift: WHAT_IF_SHIFT,
    undatedIncomeDay: UNDATED_INCOME_DEFAULT_DAY + WHAT_IF_SHIFT,
  })
})

const whatIfExpenseEarly = computed(() => {
  if (openingBalance.value === null) return null
  return simulateMonth(activeMonth.value, openingBalance.value, currentMonthItems.value, {
    expenseShift: -WHAT_IF_SHIFT,
  })
})

const whatIfWarnings = computed(() => {
  const threshold = settings.lowBalanceThreshold
  const warnings  = []

  const check = (sim, scenario) => {
    if (!sim) return
    if (sim.hasOverdraft) {
      warnings.push({ scenario, type: 'overdraft', day: sim.overdraftDay, amount: sim.lowestBalance })
    } else if (sim.lowestBalance < threshold) {
      warnings.push({ scenario, type: 'low', day: sim.lowestDay, amount: sim.lowestBalance })
    }
  }

  check(whatIfIncomeLate.value,    `income ${WHAT_IF_SHIFT} days late`)
  check(whatIfExpenseEarly.value,  `expenses ${WHAT_IF_SHIFT} days early`)
  return warnings
})

// ── Aggregate chart data ──────────────────────────────────
const globalData = computed(() => {
  const allBalances       = []
  const allEvents         = []
  const allLabels         = []
  const boundaryIndices   = []
  const dayIndexToContext = []

  let idx = 0
  for (const sim of monthSimulations.value) {
    const [y, m] = sim.monthKey.split('-').map(Number)
    const monthName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' })

    // Prepend the opening balance as a "before day 1" anchor point for the
    // first month only. This makes the "Opens" note match the chart's
    // leftmost value, and the day-1 step (rent, etc.) is visually clear.
    if (idx === 0) {
      allBalances.push(sim.openingBalance)
      allEvents.push([])
      allLabels.push('Start')
      dayIndexToContext.push({ monthName, day: 0, monthKey: sim.monthKey, isStart: true })
      idx++
    }

    if (idx > 1) boundaryIndices.push(idx)

    for (let d = 1; d <= sim.daysInMonth; d++) {
      allBalances.push(sim.balances[d - 1])
      allEvents.push(sim.events[d - 1])
      dayIndexToContext.push({ monthName, day: d, monthKey: sim.monthKey })
      // Label every 7 days starting from the 1st; label the 1st with "Mon 1"
      if (d === 1)          allLabels.push(`${monthName} 1`)
      else if (d % 7 === 1) allLabels.push(String(d))
      else                  allLabels.push('')
      idx++
    }
  }

  return { allBalances, allEvents, allLabels, boundaryIndices, dayIndexToContext }
})

// ── Aggregate status badges ───────────────────────────────
const overallStatus = computed(() => {
  const all = monthSimulations.value
  if (!all.length) return null
  const firstOverdraft = all.find((s) => s.hasOverdraft)
  if (firstOverdraft) return { type: 'overdraft', sim: firstOverdraft }
  const firstLow = all.find((s) => s.hasLowBalance)
  if (firstLow) return { type: 'low', sim: firstLow }
  return { type: 'ok' }
})

// ── Chart colours ─────────────────────────────────────────
const C_SUCCESS = 'rgba(79, 174, 133, 1)'
const C_ERROR   = 'rgba(224, 105, 90, 1)'
const C_SUCCESS_FILL = 'rgba(79, 174, 133, 0.12)'
const C_ERROR_FILL   = 'rgba(224, 105, 90, 0.12)'

// ── Today marker plugin ───────────────────────────────────
// Closes over todayDayOfMonth from the component scope — safe because
// the plugin object lives as long as this component instance does.
const todayMarkerPlugin = {
  id: 'todayMarker',
  afterDraw(chart) {
    if (!todayDayOfMonth.value || rangeMonths.value > 1) return
    const { ctx, scales: { x, y } } = chart
    const xPos = x.getPixelForValue(todayDayOfMonth.value) // +1 offset from day-0 Start point
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(xPos, y.top)
    ctx.lineTo(xPos, y.bottom)
    ctx.strokeStyle = 'rgba(150,150,150,0.45)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font      = '10px sans-serif'
    ctx.fillStyle = 'rgba(150,150,150,0.7)'
    ctx.textAlign = 'center'
    ctx.fillText('today', xPos, y.top - 4)
    ctx.restore()
  },
}

// ── Month boundary plugin ─────────────────────────────────
const monthBoundaryPlugin = {
  id: 'monthBoundaries',
  afterDraw(chart) {
    const boundaries = globalData.value.boundaryIndices
    if (!boundaries.length) return
    const { ctx, scales: { x, y } } = chart
    ctx.save()
    ctx.setLineDash([3, 5])
    ctx.strokeStyle = 'rgba(150,150,150,0.3)'
    ctx.lineWidth   = 1
    for (const bi of boundaries) {
      const xPos = x.getPixelForValue(bi)
      ctx.beginPath()
      ctx.moveTo(xPos, y.top)
      ctx.lineTo(xPos, y.bottom)
      ctx.stroke()
    }
    ctx.restore()
  },
}

// ── Chart.js datasets & options ───────────────────────────
const chartData = computed(() => {
  const { allBalances, allLabels } = globalData.value
  const totalDays = allBalances.length

  return {
    labels: allLabels,
    datasets: [
      {
        label: 'Balance',
        data: allBalances,
        borderWidth: 2,
        // Highlight today's point when in single-month view
        pointRadius: allBalances.map((_, i) =>
          rangeMonths.value === 1 && i === (todayDayOfMonth.value ?? 0) ? 5 : 0
        ),
        pointBackgroundColor: 'white',
        pointBorderColor: C_ERROR,
        pointBorderWidth: 2,
        tension: 0.15,
        fill: 'origin',
        segment: {
          borderColor:     (ctx) => ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0 ? C_ERROR   : C_SUCCESS,
          backgroundColor: (ctx) => ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0 ? C_ERROR_FILL : C_SUCCESS_FILL,
        },
      },
      // Zero baseline
      {
        label: '',
        data: Array(totalDays).fill(0),
        borderColor: 'rgba(150,150,150,0.25)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      },
    ],
  }
})

const chartOptions = computed(() => {
  // Capture reactive values so the tooltip callback closes over them correctly.
  const events  = globalData.value.allEvents
  const context = globalData.value.dayIndexToContext

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title(items) {
            const i = items[0]?.dataIndex
            if (i == null) return ''
            const ctx = context[i]
            if (!ctx) return ''
            return ctx.isStart ? 'Month start' : `${ctx.monthName} ${ctx.day}`
          },
          label(item) {
            if (item.datasetIndex !== 0) return null
            return ` Balance  ${formatCurrency(item.parsed.y)}`
          },
          afterBody(items) {
            const i = items[0]?.dataIndex
            if (i == null) return []
            const dayEvents = events[i] || []
            if (!dayEvents.length) return []

            const lines = ['']
            for (const e of dayEvents) {
              const sign   = e.itemType === 'income' ? '+' : '−'
              const amount = formatCurrency(e.amount)
              const label  = e.isDailyBurn ? `${e.label} (${amount})` : e.label
              lines.push(`${sign}${amount}  ${label}`)
            }
            return lines
          },
          labelColor(item) {
            if (item.datasetIndex !== 0) return { borderColor: 'transparent', backgroundColor: 'transparent' }
            return {
              borderColor: 'transparent',
              backgroundColor: item.parsed.y < 0 ? C_ERROR : C_SUCCESS,
            }
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 0,
          font: { size: 11 },
          color: 'rgba(150,150,150,0.7)',
          // Only show ticks that have a label
          callback(val, index) {
            return globalData.value.allLabels[index] || null
          },
        },
      },
      y: {
        grid: {
          color:     (ctx) => ctx.tick.value === 0 ? 'rgba(150,150,150,0.3)' : 'rgba(150,150,150,0.08)',
          lineWidth: (ctx) => ctx.tick.value === 0 ? 1.5 : 1,
        },
        ticks: {
          font: { size: 11 },
          color: 'rgba(150,150,150,0.7)',
          callback: (v) => formatCurrency(v),
        },
      },
    },
  }
})

// ── Card payment marker plugin ────────────────────────────
// Draws a vertical line + label for each card auto-pay that lands in
// the currently-displayed month, using settlementDate when reconciled
// or statementDueDay as a fallback.
const cardPaymentPlugin = {
  id: 'cardPaymentMarkers',
  afterDraw(chart) {
    if (rangeMonths.value > 1) return // too busy in multi-month view
    const { ctx, scales: { x, y } } = chart
    const sims = monthSimulations.value
    if (!sims.length) return

    // +1 because globalData prepends a "Start" anchor at index 0
    const dayOffset = 1
    const daysInMonth = sims[0].daysInMonth
    const paintedDays = new Set()

    // Collect all payments that land in the active month (normal + spill-ins)
    const markers = []
    for (const card of cards.cards) {
      if (!card.statementDueDay) continue

      // Normal: expected in activeMonth
      const info = cardPaymentInfo(card.id, card, activeMonth.value)
      if (info && info.month === activeMonth.value && info.amount > 0) {
        markers.push({ card, day: info.day, isReconciled: !!cards.balanceRecordForCardMonth(card.id, shiftMonthKey(activeMonth.value, -1))?.settlementDate })
        continue
      }
      // Spill-in: expected last month, settled into activeMonth
      const prevInfo = cardPaymentInfo(card.id, card, shiftMonthKey(activeMonth.value, -1))
      if (prevInfo && prevInfo.month === activeMonth.value && prevInfo.amount > 0) {
        markers.push({ card, day: prevInfo.day, isReconciled: true })
      }
    }

    for (const { card, day, isReconciled } of markers) {
      const clampedDay = Math.min(day, daysInMonth)
      const xIndex = clampedDay - 1 + dayOffset
      const xPos = x.getPixelForValue(xIndex)

      // Solid line for reconciled settlement, dashed for expected
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(xPos, y.top)
      ctx.lineTo(xPos, y.bottom)
      ctx.strokeStyle = isReconciled ? 'rgba(224, 105, 90, 0.7)' : 'rgba(224, 105, 90, 0.4)'
      ctx.setLineDash(isReconciled ? [] : [2, 3])
      ctx.lineWidth = isReconciled ? 2 : 1.5
      ctx.stroke()

      // Label — stack multiple cards on same day vertically
      const labelY = y.top + 10 + (paintedDays.has(clampedDay) ? 14 : 0)
      paintedDays.add(clampedDay)

      ctx.font = isReconciled ? 'bold 9px sans-serif' : '9px sans-serif'
      ctx.textAlign = 'right'
      ctx.setLineDash([])
      const labelX = xPos - 4
      const textWidth = ctx.measureText(card.name).width
      const pad = 3
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.roundRect(labelX - textWidth - pad, labelY - 9, textWidth + pad * 2, 12, 3)
      ctx.fill()
      ctx.fillStyle = isReconciled ? 'rgba(224, 105, 90, 1)' : 'rgba(224, 105, 90, 0.85)'
      ctx.fillText(card.name, labelX, labelY)
      ctx.restore()
    }
  },
}

const localPlugins = [todayMarkerPlugin, monthBoundaryPlugin, cardPaymentPlugin]

// ── Summary stats for the first/current month ─────────────
const currentSim = computed(() => monthSimulations.value[0] ?? null)
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-5 shadow-lg shadow-secondary/5">

    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="font-display font-semibold">Daily Balance Timeline</h2>
        <p class="text-xs text-base-content/50 mt-0.5">
          <span v-if="transactionAccount">{{ transactionAccount.name }} · </span>
          {{ formatMonthLabel(activeMonth) }}
          <span v-if="rangeMonths > 1"> + {{ rangeMonths - 1 }} months ahead</span>
          <span class="ml-1">·
            {{ monthSimulations.some(s => finance.actualSnapshots.find(a => a.month === s.monthKey)) ? 'actuals' : '' }}
            {{ monthSimulations.some(s => !finance.actualSnapshots.find(a => a.month === s.monthKey)) ? '+ forecast' : '' }}
          </span>
        </p>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <!-- Range toggle -->
        <div class="flex rounded-lg border border-base-300 overflow-hidden">
          <button
            v-for="r in [1, 3, 6]"
            :key="r"
            class="px-2.5 py-1 text-xs font-medium transition-colors"
            :class="rangeMonths === r
              ? 'bg-primary text-primary-content'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
            @click="rangeMonths = r"
          >{{ r }}mo</button>
        </div>

        <!-- Status badge -->
        <span v-if="overallStatus?.type === 'overdraft'" class="badge badge-error gap-1 whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Overdraft risk
        </span>
        <span v-else-if="overallStatus?.type === 'low'" class="badge badge-warning gap-1 whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Low balance risk
        </span>
        <span v-else-if="overallStatus?.type === 'ok'" class="badge badge-success gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Clears the month
        </span>
      </div>
    </div>

    <!-- No transaction account -->
    <div v-if="!transactionAccount" class="py-8 text-center text-sm text-base-content/40">
      <p>Tag an account as your <span class="font-medium">transaction account</span> to enable this chart.</p>
      <RouterLink to="/accounts" class="link link-primary mt-1 inline-block text-xs">Go to Accounts →</RouterLink>
    </div>

    <!-- No opening balance at all (two months back also missing) -->
    <div v-else-if="openingBalance === null" class="py-8 text-center text-sm text-base-content/40">
      <p>Log <span class="font-medium">{{ transactionAccount.name }}</span>'s balance for {{ formatMonthLabel(shiftMonthKey(activeMonth, -1)) }} to set the opening balance.</p>
      <RouterLink to="/accounts" class="link link-primary mt-1 inline-block text-xs">Go to Accounts →</RouterLink>
    </div>

    <!-- Chart -->
    <template v-else>
      <!-- Soft nudge when opening balance is projected, not confirmed -->
      <div v-if="openingBalanceIsProjected" class="flex items-center justify-between gap-3 mb-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
        <p class="text-xs text-warning/80">
          Opening balance is projected from {{ formatMonthLabel(shiftMonthKey(activeMonth, -1)) }}'s simulation —
          <span class="font-medium">log the actual end-of-month balance</span> to confirm.
        </p>
        <RouterLink to="/accounts" class="text-xs text-warning font-medium whitespace-nowrap hover:underline">Log balance →</RouterLink>
      </div>
      <div style="height:220px">
        <Line :data="chartData" :options="chartOptions" :plugins="localPlugins" />
      </div>

      <!-- What-if warnings -->
      <div v-if="whatIfWarnings.length && rangeMonths === 1" class="mt-3 space-y-1.5">
        <div
          v-for="w in whatIfWarnings"
          :key="w.scenario"
          class="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
          :class="w.type === 'overdraft' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span>
            If {{ w.scenario }} →
            <span class="font-semibold">
              {{ w.type === 'overdraft'
                  ? `overdraft on day ${w.day}`
                  : `dips to ${formatCurrency(w.amount)} on day ${w.day}` }}
            </span>
            <span class="opacity-70"> ({{ formatCurrency(settings.lowBalanceThreshold) }} threshold)</span>
          </span>
        </div>
      </div>

      <!-- Footnote row -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        <p v-if="currentSim && currentSim.undatedItemCount > 0" class="text-[10px] text-base-content/35">
          {{ currentSim.datedItemCount }} item{{ currentSim.datedItemCount === 1 ? '' : 's' }} dated
          · {{ currentSim.undatedItemCount }} undated
          (income assumed day {{ UNDATED_INCOME_DEFAULT_DAY }}, expenses spread daily)
        </p>
        <p v-else-if="currentSim && currentSim.datedItemCount > 0" class="text-[10px] text-success/60">
          All items dated — timeline fully pinned.
        </p>
        <RouterLink v-if="whatIfWarnings.length === 0 && currentSim?.undatedItemCount > 0" to="/entry" class="text-[10px] text-primary/60 hover:text-primary">
          Add day-of-month to items to improve accuracy →
        </RouterLink>

        <!-- Month-start and projected month-end, consistent with the chart -->
        <div class="ml-auto flex items-center gap-4 font-mono tabular-nums text-[11px]">
          <span class="text-base-content/40">
            Opens <span class="text-base-content/70 font-medium">{{ formatCurrency(openingBalance) }}</span>
          </span>
          <span v-if="monthSimulations.length" class="text-base-content/40">
            Closes
            <span
              class="font-medium"
              :class="monthSimulations.at(-1).closingBalance >= openingBalance ? 'text-success' : 'text-error'"
            >~{{ formatCurrency(Math.round(monthSimulations.at(-1).closingBalance / 100) * 100) }}</span>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>