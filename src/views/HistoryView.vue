<script setup>
import { ref, computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { formatCurrency } from '../utils/format'
import SnapshotForm from '../components/SnapshotForm.vue'

const finance = useFinanceStore()
const editing = ref(null)

function startEdit(snapshot) {
  editing.value = snapshot
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function remove(id) {
  if (confirm('Delete this monthly entry? This cannot be undone.')) {
    await finance.deleteSnapshot(id)
  }
}

function onSaved() {
  editing.value = null
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-display text-2xl font-semibold">History</h1>
      <p class="text-sm text-base-content/60">Every month you've logged, most recent first.</p>
    </div>

    <div v-if="editing" class="rounded-lg border border-primary/40 bg-base-200 p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display font-semibold">Editing {{ editing.month }}</h2>
        <button type="button" class="btn btn-ghost btn-xs" @click="editing = null">Cancel</button>
      </div>
      <SnapshotForm :initial="editing" @saved="onSaved" />
    </div>

    <div class="overflow-x-auto rounded-lg border border-base-300 bg-base-200">
      <table class="table">
        <thead>
          <tr>
            <th>Month</th>
            <th class="text-right">Income</th>
            <th class="text-right">Expenses</th>
            <th class="text-right">Cash flow</th>
            <th class="text-right">Net worth</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in [...finance.sortedSnapshots].reverse()" :key="s.id">
            <td class="font-medium">{{ s.month }}</td>
            <td class="text-right font-mono tabular-nums">{{ formatCurrency(finance.totals(s).income) }}</td>
            <td class="text-right font-mono tabular-nums">{{ formatCurrency(finance.totals(s).expenses) }}</td>
            <td
              class="text-right font-mono tabular-nums"
              :class="finance.totals(s).netCashFlow >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatCurrency(finance.totals(s).netCashFlow) }}
            </td>
            <td class="text-right font-mono tabular-nums">{{ formatCurrency(finance.totals(s).netWorth) }}</td>
            <td class="text-right whitespace-nowrap">
              <button type="button" class="btn btn-ghost btn-xs" @click="startEdit(s)">Edit</button>
              <button type="button" class="btn btn-ghost btn-xs text-error" @click="remove(s.id)">Delete</button>
            </td>
          </tr>
          <tr v-if="!finance.sortedSnapshots.length">
            <td colspan="6" class="text-center py-10">
              <p class="text-base-content/50 text-sm mb-2">No months logged yet.</p>
              <RouterLink to="/entry" class="link link-primary text-sm">Log your first month →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>