<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { formatCurrency } from '../utils/format'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const props = defineProps({
  // [{ month, actualIncome, actualExpenses, plannedIncome, plannedExpenses }]
  // Each month is one Income bar + one Expense bar, and each of those is
  // itself a stack of two segments — actual (solid) on the bottom,
  // planned-but-not-logged-yet (faded) on top. A purely future month just
  // has a zero-height actual segment, so it still reads the same as
  // before; the new part is a month that's already partly logged can ALSO
  // carry a planned segment for whatever's still pending within it.
  entries: { type: Array, default: () => [] },
})
const emit = defineEmits(['bar-click'])

const data = computed(() => ({
  labels: props.entries.map((e) => e.month),
  datasets: [
    {
      label: 'Income',
      stack: 'income',
      data: props.entries.map((e) => e.actualIncome),
      backgroundColor: '#1B4332',
    },
    {
      label: 'Income (planned)',
      stack: 'income',
      data: props.entries.map((e) => e.plannedIncome),
      backgroundColor: 'rgba(27, 67, 50, 0.35)',
    },
    {
      label: 'Expenses',
      stack: 'expenses',
      data: props.entries.map((e) => e.actualExpenses),
      backgroundColor: '#C99A3B',
    },
    {
      label: 'Expenses (planned)',
      stack: 'expenses',
      data: props.entries.map((e) => e.plannedExpenses),
      backgroundColor: 'rgba(201, 154, 59, 0.35)',
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  // Lets a click anywhere on a bar segment count, not just the exact
  // pixel — 'nearest'+intersect:true is the standard Chart.js recipe for
  // "hit the element under the cursor."
  interaction: { mode: 'nearest', intersect: true },
  onHover: (event, elements) => {
    event.native.target.style.cursor = elements.length ? 'pointer' : 'default'
  },
  onClick: (event, elements) => {
    if (!elements.length) return
    const { datasetIndex, index } = elements[0]
    const month = data.value.labels[index]
    if (!month) return
    // datasetIndex 0/1 are the two Income segments, 2/3 are Expenses —
    // either segment of a bar opens the same combined breakdown, so
    // which exact segment was clicked doesn't matter beyond that.
    emit('bar-click', { month, type: datasetIndex < 2 ? 'income' : 'expense' })
  },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: { stacked: true },
    y: { stacked: true, ticks: { callback: (v) => formatCurrency(v) } },
  },
}
</script>

<template>
  <div class="h-64">
    <Bar :data="data" :options="options" />
  </div>
</template>