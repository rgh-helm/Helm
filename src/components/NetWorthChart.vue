<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { formatCurrency } from '../utils/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const props = defineProps({
  history: { type: Array, default: () => [] },
})

const data = computed(() => ({
  labels: props.history.map((h) => h.month),
  datasets: [
    {
      label: 'Net worth',
      data: props.history.map((h) => h.netWorth),
      borderColor: '#1B4332',
      backgroundColor: 'rgba(27, 67, 50, 0.12)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => formatCurrency(ctx.parsed.y),
      },
    },
  },
  scales: {
    y: {
      ticks: { callback: (v) => formatCurrency(v) },
    },
  },
}
</script>

<template>
  <div class="h-64">
    <Line :data="data" :options="options" />
  </div>
</template>
