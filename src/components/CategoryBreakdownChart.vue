<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { formatCurrency } from '../utils/format'
import { categoryColor } from '../utils/chartColors'
import { useCategoriesStore } from '../stores/categoriesStore'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  breakdown: { type: Array, default: () => [] }, // [{ category, amount }], pre-sorted desc
})

const categoriesStore = useCategoriesStore()

const total = computed(() => props.breakdown.reduce((acc, b) => acc + b.amount, 0))

const data = computed(() => ({
  labels: props.breakdown.map((b) => b.category),
  datasets: [
    {
      data: props.breakdown.map((b) => b.amount),
      backgroundColor: props.breakdown.map((b) => categoryColor(b.category, categoriesStore.categories)),
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
  <p v-else class="text-sm text-base-content/50 py-8 text-center">No expenses logged for this month.</p>
</template>