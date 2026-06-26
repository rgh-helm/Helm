<script setup>
import { computed, ref } from 'vue'
import { useAccountsStore } from '../stores/accountsStore'
import AccountForm from '../components/AccountForm.vue'
import AccountRow from '../components/AccountRow.vue'
import AccountsHistoryChart from '../components/AccountsHistoryChart.vue'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'

const accountsStore = useAccountsStore()
const showForm = ref(false)
const editing = ref(null)
const newAccountKind = ref('asset')

function startCreate(kind) {
  editing.value = null
  newAccountKind.value = kind
  showForm.value = true
}

function startEdit(account) {
  editing.value = account
  showForm.value = true
}

function onSaved() {
  showForm.value = false
  editing.value = null
}

const totalAssets = computed(() => accountsStore.currentTotal('asset'))
const totalNonRetirementAssets = computed(() => accountsStore.currentNonRetirementTotal)
const totalDebts = computed(() => accountsStore.currentTotal('debt'))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-display text-2xl font-semibold">Accounts</h1>
      <p class="text-sm text-base-content/60">
        Persistent assets and debts — set each one up once, then just update its balance each
        month instead of retyping it.
      </p>
    </div>

    <div v-if="showForm" class="rounded-lg border border-primary/40 bg-base-200 p-5 max-w-xl">
      <h2 class="font-display font-semibold mb-3">{{ editing ? 'Edit account' : 'New account' }}</h2>
      <AccountForm :initial="editing" :defaultKind="newAccountKind" @saved="onSaved" @cancel="showForm = false" />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="rounded-lg border border-base-300 bg-base-200 p-4">
        <p class="text-xs text-base-content/60">Total assets</p>
        <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(totalAssets) }}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200 p-4">
        <p class="text-xs text-base-content/60">Non-retirement assets</p>
        <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(totalNonRetirementAssets) }}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200 p-4">
        <p class="text-xs text-base-content/60">Total debts</p>
        <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(totalDebts) }}</p>
      </div>
    </div>

    <div v-if="accountsStore.accountsHistory.length" class="rounded-lg border border-base-300 bg-base-200 p-5 backdrop-blur-lg">
      <h2 class="font-display font-semibold mb-3">Assets &amp; debts over time</h2>
      <AccountsHistoryChart :history="accountsStore.accountsHistory" />
    </div>

    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-lg font-semibold">Assets</h2>
        <button type="button" class="btn btn-primary btn-sm" @click="startCreate('asset')">+ Add asset</button>
      </div>
      <EmptyState
        v-if="!accountsStore.assetAccounts.length"
        variant="inline"
        emoji="🏦"
        title="No asset accounts yet"
        message="Add savings accounts, investments, or any account you want to track toward your net worth — like your HYSA or brokerage."
      >
        <button type="button" class="btn btn-primary btn-sm mt-1" @click="startCreate('asset')">Add an asset</button>
      </EmptyState>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <AccountRow v-for="a in accountsStore.assetAccounts" :key="a.id" :account="a" @edit="startEdit" />
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-lg font-semibold">Debts</h2>
        <button type="button" class="btn btn-primary btn-sm" @click="startCreate('debt')">+ Add debt</button>
      </div>
      <EmptyState
        v-if="!accountsStore.debtAccounts.length"
        variant="inline"
        emoji="📉"
        title="No debts tracked yet"
        message="Add loans, car payments, or any debt you're working down. The app will track payoff timelines and inject minimum payments into your monthly entries automatically."
      >
        <button type="button" class="btn btn-primary btn-sm mt-1" @click="startCreate('debt')">Add a debt</button>
      </EmptyState>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <AccountRow v-for="a in accountsStore.debtAccounts" :key="a.id" :account="a" @edit="startEdit" />
      </div>
    </div>
  </div>
</template>