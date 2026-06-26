<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { formatCurrency } from '../utils/format'
import { categoryColor } from '../utils/chartColors'
import { useCategoriesStore } from '../stores/categoriesStore'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const props = defineProps({
  months: { type: Array, default: () => [] }, // ["2026-03", "2026-04", ...]
  series: { type: Array, default: () => [] }, // [{ category, data: number[] }] — one entry per month, same order as months
})

const categoriesStore = useCategoriesStore()

// "Other" is a catch-all bucket, not a real category — keep it visually
// distinct (neutral gray) rather than letting the hash-based palette
// assign it a color that's also "really" some specific category's color.
const OTHER_COLOR = '#9CA3AF'

const data = computed(() => ({
  labels: props.months,
  datasets: props.series.map((s) => ({
    label: s.category,
    data: s.data,
    backgroundColor: s.category === 'Other' ? OTHER_COLOR : categoryColor(s.category, categoriesStore.categories),
  })),
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } },
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
  <div v-if="months.length" class="h-72">
    <Bar :data="data" :options="options" />
  </div>
  <p v-else class="text-sm text-base-content/50 py-8 text-center">
    Not enough history yet for a trend — log a couple more months.
  </p>
</template>