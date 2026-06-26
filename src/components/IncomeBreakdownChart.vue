<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { formatCurrency } from '../utils/format'
import { categoryColor } from '../utils/chartColors'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  breakdown: { type: Array, default: () => [] }, // [{ category, amount }], pre-sorted desc — "category" here means income source
  emptyMessage: { type: String, default: 'No income logged.' },
})

// Deliberately not wired to categoriesStore the way CategoryBreakdownChart
// is — income source names are a different namespace from expense
// categories (and don't have their own manual-color picker yet), so this
// always falls back to categoryColor's plain hash-based auto-coloring.
const total = computed(() => props.breakdown.reduce((acc, b) => acc + b.amount, 0))

const data = computed(() => ({
  labels: props.breakdown.map((b) => b.category),
  datasets: [
    {
      data: props.breakdown.map((b) => b.amount),
      backgroundColor: props.breakdown.map((b) => categoryColor(b.category)),
      borderWidth: 1,
      borderColor: '#FFFFFF',
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const pct = total.value ? Math.round((ctx.parsed / total.value) * 100) : 0
          return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`
        },
      },
    },
  },
}
</script>

<template>
  <div v-if="breakdown.length" class="h-64">
    <Doughnut :data="data" :options="options" />
  </div>
  <p v-else class="text-sm text-base-content/50 py-8 text-center">{{ emptyMessage }}</p>
</template>