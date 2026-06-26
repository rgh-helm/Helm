<script setup>
import { ref } from 'vue'
import { useAccountsStore } from '../stores/accountsStore'

// One account's balance entry for one specific month — deliberately much
// simpler than CardMonthPanel (no itemizing, no Paid status, no CSV
// import): an asset/debt balance is just a number, not a statement with
// its own categorized transactions or billing-cycle concept.
const props = defineProps({
  accountId: { type: Number, required: true },
  month: { type: String, required: true },
  label: { type: String, required: true },
})
const emit = defineEmits(['saved'])

const accountsStore = useAccountsStore()
const entryAmount = ref('')
const saving = ref(false)

// Pre-fill from whatever's already logged for this account+month, if
// anything. Runs once at setup time — by the time this component exists,
// the parent only renders accounts after accountsStore.loadAll() has
// already resolved (same assumption CardMonthPanel relies on).
function loadExistingEntry() {
  const existing = accountsStore.balanceForAccountMonth(props.accountId, props.month)
  entryAmount.value = existing ?? ''
}
loadExistingEntry()

async function logBalance() {
  saving.value = true
  try {
    await accountsStore.saveBalance({
      accountId: props.accountId,
      month: props.month,
      amount: parseFloat(entryAmount.value) || 0,
    })
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="border-t border-base-300 pt-3">
    <label class="text-xs text-base-content/60 block mb-1">{{ label }} ({{ month }})</label>
    <div class="flex gap-2">
      <input
        type="number"
        step="0.01"
        class="input input-sm input-bordered flex-1 font-mono tabular-nums"
        v-model="entryAmount"
        placeholder="0.00"
      />
      <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="logBalance">
        {{ saving ? 'Saving…' : 'Log' }}
      </button>
    </div>
  </div>
</template>