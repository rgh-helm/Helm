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
  history: { type: Array, default: () => [] }, // [{ month, total }]
})

const data = computed(() => ({
  labels: props.history.map((h) => h.month),
  datasets: [
    {
      label: 'Card spending',
      data: props.history.map((h) => h.total),
      borderColor: '#C99A3B',
      backgroundColor: 'rgba(201, 154, 59, 0.15)',
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
  <div class="h-56">
    <Line :data="data" :options="options" />
  </div>
</template>
