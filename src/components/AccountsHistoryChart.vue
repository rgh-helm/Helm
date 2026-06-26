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
  // [{ month, totalAssets, nonRetirementAssets, totalDebts }]
  history: { type: Array, default: () => [] },
})

const data = computed(() => ({
  labels: props.history.map((h) => h.month),
  datasets: [
    {
      label: 'Total assets',
      data: props.history.map((h) => h.totalAssets),
      borderColor: '#1B4332',
      backgroundColor: 'rgba(27, 67, 50, 0.1)',
      fill: false,
      tension: 0.3,
      pointRadius: 3,
    },
    {
      label: 'Non-retirement assets',
      data: props.history.map((h) => h.nonRetirementAssets),
      borderColor: '#3A6E5A',
      backgroundColor: 'rgba(58, 110, 90, 0.1)',
      borderDash: [5, 4],
      fill: false,
      tension: 0.3,
      pointRadius: 3,
    },
    {
      label: 'Debts',
      data: props.history.map((h) => h.totalDebts),
      borderColor: '#B3402F',
      backgroundColor: 'rgba(179, 64, 47, 0.1)',
      fill: false,
      tension: 0.3,
      pointRadius: 3,
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
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