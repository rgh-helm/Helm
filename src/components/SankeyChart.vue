<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { formatCurrency } from '../utils/format'
import {
  Chart,
  Tooltip,
  Legend,
} from 'chart.js'
import { SankeyController, Flow } from 'chartjs-chart-sankey'

Chart.register(SankeyController, Flow, Tooltip, Legend)

const props = defineProps({
  month: { type: String, default: null },
})

const finance = useFinanceStore()
const settings = useSettingsStore()
const cards = useCreditCardStore()

const canvasRef = ref(null)
let chartInstance = null

const resolvedMonth = computed(() => props.month ?? finance.latestSnapshot?.month ?? null)

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'helm-dark'
}

function palette() {
  const dark = isDark()
  return {
    navy:    dark ? '#4D8FD6' : '#1B3A6B',
    brass:   dark ? '#D9A94A' : '#C99A3B',
    ocean:   dark ? '#6AAED6' : '#2E6DA4',
    success: dark ? '#4CAF7D' : '#2F7D52',
    warning: dark ? '#E0A458' : '#C77B26',
    text:    dark ? '#E4ECF7' : '#1A2130',
    border:  dark ? '#1E2D42' : '#DDE4EF',
    surface: dark ? '#0E1624' : '#ffffff',
  }
}

const sankeyData = computed(() => {
  const month = resolvedMonth.value
  if (!month) return null

  const snapshot = finance.snapshots.find(s => s.month === month)
  if (!snapshot) return null

  const incomeItems = snapshot.incomeItems || []
  const primaryLabels = new Set(settings.primaryIncomeLabels.map(l => l.toLowerCase()))

  const incomeByLabel = new Map()
  for (const item of incomeItems) {
    if (item.isTransfer) continue
    const amount = Number(item.amount) || 0
    if (!amount) continue
    const label = (item.label || 'Other Income').trim()
    incomeByLabel.set(label, (incomeByLabel.get(label) || 0) + amount)
  }

  const totalIncome = [...incomeByLabel.values()].reduce((a, b) => a + b, 0)
  if (totalIncome === 0) return null

  const breakdown = finance.categoryBreakdownForMonth(month)
  const totalExpenses = breakdown.reduce((a, b) => a + b.amount, 0)
  const netFlow = totalIncome - totalExpenses

  const flows = []
  const useAggregator = incomeByLabel.size > 1

  if (useAggregator) {
    for (const [label, amount] of incomeByLabel.entries())
      flows.push({ from: label, to: 'Total Income', flow: amount })
    for (const { category, amount } of breakdown)
      flows.push({ from: 'Total Income', to: category, flow: amount })
    if (netFlow !== 0)
      flows.push({ from: 'Total Income', to: 'Net Savings', flow: Math.abs(netFlow) })
  } else {
    const singleLabel = [...incomeByLabel.keys()][0] || 'Income'
    for (const { category, amount } of breakdown)
      flows.push({ from: singleLabel, to: category, flow: amount })
    if (netFlow !== 0)
      flows.push({ from: singleLabel, to: 'Net Savings', flow: Math.abs(netFlow) })
  }

  return { flows, totalIncome, totalExpenses, netFlow }
})

// For each expense category in the resolved month, determine the dominant
// source: the card name with the highest spend, or "Manual" if cash entries win.
const categorySourceMap = computed(() => {
  const month = resolvedMonth.value
  if (!month) return {}

  const snapshot = finance.snapshots.find(s => s.month === month)
  const result = {}

  // Tally manual expense items by category
  const manual = new Map()
  for (const item of snapshot?.expenseItems || []) {
    const amount = Number(item.amount) || 0
    if (!amount) continue
    const cat = (item.category || 'Uncategorized').trim()
    manual.set(cat, (manual.get(cat) || 0) + amount)
  }

  // Tally each card's contribution per category
  // cardTotals: Map<category, Map<cardName, amount>>
  const cardTotals = new Map()
  for (const balance of cards.balances.filter(b => b.month === month)) {
    const card = cards.cards.find(c => c.id === balance.cardId)
    const cardName = card?.name ?? 'Credit Card'
    for (const c of balance.categories || []) {
      const amount = Number(c.amount) || 0
      if (!amount) continue
      const cat = (c.category || 'Uncategorized').trim()
      if (!cardTotals.has(cat)) cardTotals.set(cat, new Map())
      const byCard = cardTotals.get(cat)
      byCard.set(cardName, (byCard.get(cardName) || 0) + amount)
    }
    // Uncategorized card balance (no itemized split)
    if (!balance.categories?.length && balance.amount) {
      const cat = 'Uncategorized'
      if (!cardTotals.has(cat)) cardTotals.set(cat, new Map())
      const byCard = cardTotals.get(cat)
      byCard.set(cardName, (byCard.get(cardName) || 0) + balance.amount)
    }
  }

  // For each category, pick the dominant source
  const allCats = new Set([...manual.keys(), ...cardTotals.keys()])
  for (const cat of allCats) {
    const manualAmt = manual.get(cat) || 0
    let dominant = { name: 'Manual', amount: manualAmt }
    const byCard = cardTotals.get(cat)
    if (byCard) {
      for (const [cardName, amt] of byCard) {
        if (amt > dominant.amount) dominant = { name: cardName, amount: amt }
      }
    }
    result[cat] = dominant.name
  }

  return result
})

function nodeColors(label, p, netFlow = 0) {
  if (label === 'Total Income' || label.toLowerCase().includes('income'))
    return p.navy
  if (label === 'Net Savings')
    return netFlow >= 0 ? p.success : p.error
  const palette = [p.brass, p.ocean, p.warning, '#7B68EE', '#20B2AA', '#CD853F', '#4682B4', '#DA70D6', '#8FBC8F', '#BC8F8F']
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) & 0xffffffff
  return palette[Math.abs(hash) % palette.length]
}

function buildChart() {
  if (!canvasRef.value) return
  const data = sankeyData.value
  if (!data) return

  const p = palette()

  const nodeColorMap = {}
  for (const f of data.flows) {
    nodeColorMap[f.from] = nodeColors(f.from, p, data.netFlow)
    nodeColorMap[f.to]   = nodeColors(f.to, p, data.netFlow)
  }

  if (chartInstance) { chartInstance.destroy(); chartInstance = null }

  chartInstance = new Chart(canvasRef.value, {
    type: 'sankey',
    data: {
      datasets: [{
        label: 'Cash Flow',
        data: data.flows,
        colorFrom: (ctx) => nodeColorMap[ctx.dataset.data[ctx.dataIndex]?.from] ?? p.navy,
        colorTo:   (ctx) => nodeColorMap[ctx.dataset.data[ctx.dataIndex]?.to]   ?? p.brass,
        colorMode: (ctx) => {
          const d = ctx.dataset.data[ctx.dataIndex]
          return d?.to === 'Net Savings' ? 'to' : 'from'
        },
        alpha: 0.45,
        borderWidth: 0,
        nodeWidth: 14,
        nodePadding: 14,
        font: { size: 0 },
        priority: { 'Net Savings': 1000 },
      }],
    },
    plugins: [{
      id: 'pillLabels',
      afterDraw(chart) {
        const ctx = chart.ctx
        const ctrl = chart.getDatasetMeta(0).controller
        const nodes = ctrl?._nodes
        if (!nodes?.size) return

        const ca = chart.chartArea
        const scaleX = (ca.right - ca.left) / ctrl._maxX
        const scaleY = (ca.bottom - ca.top) / ctrl._maxY
        const nodeWidth = chart.data.datasets[0].nodeWidth ?? 14

        ctx.save()
        ctx.font = '500 12px "Inter", ui-sans-serif, system-ui, sans-serif'
        ctx.textBaseline = 'middle'

        const chartMidX = (ca.left + ca.right) / 2

        for (const [key, node] of nodes) {
          const textW = ctx.measureText(key).width
          const pillW = textW + 14
          const pillH = 20

          const px = ca.left + node.x * scaleX
          const py = ca.top  + node.y * scaleY
          const pNodeH = node.size * scaleY
          const cy = py + pNodeH / 2
          const nodeRight = px + nodeWidth

          const pillX = nodeRight > chartMidX ? px - pillW - 6 : nodeRight + 6
          const pillY = cy - pillH / 2

          ctx.beginPath()
          ctx.roundRect(pillX, pillY, pillW, pillH, 10)
          ctx.fillStyle = 'rgba(255,255,255,0.88)'
          ctx.fill()

          ctx.fillStyle = '#1A2130'
          ctx.fillText(key, pillX + 7, cy)
        }

        ctx.restore()
      },
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.dataset.data[ctx.dataIndex]
              const pct = data.totalIncome > 0
                ? ` (${((d.flow / data.totalIncome) * 100).toFixed(1)}%)`
                : ''
              const source = categorySourceMap.value[d.to]
              const sourceStr = source ? `  ·  ${source}` : ''
              return ` ${d.from}  →  ${d.to}:  ${formatCurrency(d.flow)}${pct}${sourceStr}`
            },
          },
          backgroundColor: p.surface,
          titleColor: p.text,
          bodyColor: p.text,
          borderColor: p.border,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
        },
      },
    },
  })
}

watch(sankeyData, async () => { await nextTick(); buildChart() })

let themeObserver = null
onMounted(async () => {
  await nextTick()
  buildChart()
  themeObserver = new MutationObserver(() => buildChart())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})
onBeforeUnmount(() => { chartInstance?.destroy(); themeObserver?.disconnect() })

const summary = computed(() => sankeyData.value)
</script>

<template>
  <div class="card bg-base-200 border border-base-300 rounded-xl p-4 shadow-lg shadow-secondary/5">
    <div v-if="!resolvedMonth || !sankeyData" class="flex items-center justify-center h-40 text-base-content/40 text-sm">
      No data available for this month.
    </div>

    <div v-else class="flex flex-col gap-3">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-base-100 rounded-lg px-3 py-2">
          <div class="text-xs text-base-content/50 uppercase tracking-wide mb-0.5">Income</div>
          <div class="font-display text-primary font-semibold text-sm">{{ formatCurrency(summary.totalIncome) }}</div>
        </div>
        <div class="bg-base-100 rounded-lg px-3 py-2">
          <div class="text-xs text-base-content/50 uppercase tracking-wide mb-0.5">Expenses</div>
          <div class="font-display text-warning font-semibold text-sm">{{ formatCurrency(summary.totalExpenses) }}</div>
        </div>
        <div class="bg-base-100 rounded-lg px-3 py-2">
          <div class="text-xs text-base-content/50 uppercase tracking-wide mb-0.5">Net</div>
          <div class="font-display font-semibold text-sm" :class="summary.netFlow >= 0 ? 'text-success' : 'text-error'">
            {{ summary.netFlow >= 0 ? '+' : '' }}{{ formatCurrency(summary.netFlow) }}
          </div>
        </div>
      </div>

      <div class="relative w-full" style="height: 480px;">
        <canvas ref="canvasRef" />
      </div>
    </div>
  </div>
</template>