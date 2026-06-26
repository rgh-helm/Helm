<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGoalsStore } from '../stores/goalsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import ScenarioForm from '../components/ScenarioForm.vue'
import ScenarioCard from '../components/ScenarioCard.vue'
import { formatCurrency, formatPercent, currentMonthKey } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'

const goals = useGoalsStore()
const accountsStore = useAccountsStore()
const finance = useFinanceStore()
const route = useRoute()

const showForm = ref(false)
const editing = ref(null)

function startCreate() {
  editing.value = null
  showForm.value = true
}

function startEdit(scenario) {
  editing.value = scenario
  showForm.value = true
}

async function remove(id) {
  if (confirm('Delete this scenario?')) {
    await goals.deleteScenario(id)
  }
}

function onSaved() {
  showForm.value = false
  editing.value = null
}

// When navigated here from the DiagnosticCard "Adjust contribution" link,
// automatically open the edit form for the pinned scenario so the user
// lands right where they need to be.
onMounted(() => {
  const targetId = route.query.editScenario
  if (!targetId) return
  const match = goals.projections.find((p) => p.scenario.id === targetId)
  if (match) startEdit(match.scenario)
})

// Combined contribution target + this month's actual across every tracked
// account of a goal type — only counts accounts that actually have a
// target set, so an untracked account doesn't silently drag the total
// down. Full account management (add/edit/delete, history, backfill)
// lives on the Accounts page now — this is just a summary.
const thisMonth = currentMonthKey()

function targetSummary(accounts) {
  const tracked = accounts.filter((a) => a.monthlyTargetContribution != null)
  if (!tracked.length) return null
  const target = tracked.reduce((acc, a) => acc + a.monthlyTargetContribution, 0)
  let sum = 0
  let anyData = false
  for (const a of tracked) {
    const v = accountsStore.contributionForMonth(a.id, thisMonth)
    if (v != null) {
      sum += v
      anyData = true
    }
  }
  return { target, actual: anyData ? sum : null }
}

const houseTargetSummary = computed(() => targetSummary(accountsStore.houseAccounts))
const emergencyTargetSummary = computed(() => targetSummary(accountsStore.emergencyAccounts))
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-semibold">Goals</h1>
        <p class="text-sm text-base-content/60">Compare house and emergency-fund scenarios side by side.</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" @click="startCreate">+ New goal</button>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-display font-semibold">Fund Accounts</h2>
        <RouterLink to="/accounts" class="btn btn-ghost btn-xs">Manage accounts →</RouterLink>
      </div>
      <p class="text-xs text-base-content/60">
        Balances and growth rates here come from whichever accounts are tagged to House Fund /
        Emergency Fund on the <RouterLink to="/accounts" class="link link-primary">Accounts</RouterLink>
        page — add, edit, or set contribution targets there.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="rounded-md border border-base-300 bg-base-100 px-3 py-2">
          <h3 class="text-sm font-semibold">House Fund</h3>
          <p class="font-mono tabular-nums text-lg font-semibold">{{ formatCurrency(finance.currentHouseFund) }}</p>
          <p class="text-xs text-base-content/60">{{ formatPercent(finance.houseFundRate, 2) }} blended rate</p>
          <p v-if="houseTargetSummary" class="text-xs text-base-content/60 mt-1">
            Target {{ formatCurrency(houseTargetSummary.target) }}/mo
            <template v-if="houseTargetSummary.actual != null">
              · this month:
              <span :class="houseTargetSummary.actual >= houseTargetSummary.target ? 'text-success' : 'text-error'">
                {{ formatCurrency(houseTargetSummary.actual) }}
              </span>
            </template>
          </p>
        </div>
        <div class="rounded-md border border-base-300 bg-base-100 px-3 py-2">
          <h3 class="text-sm font-semibold">Emergency Fund</h3>
          <p class="font-mono tabular-nums text-lg font-semibold">{{ formatCurrency(finance.currentEmergencyFund) }}</p>
          <p class="text-xs text-base-content/60">{{ formatPercent(finance.emergencyFundRate, 2) }} blended rate</p>
          <p v-if="emergencyTargetSummary" class="text-xs text-base-content/60 mt-1">
            Target {{ formatCurrency(emergencyTargetSummary.target) }}/mo
            <template v-if="emergencyTargetSummary.actual != null">
              · this month:
              <span :class="emergencyTargetSummary.actual >= emergencyTargetSummary.target ? 'text-success' : 'text-error'">
                {{ formatCurrency(emergencyTargetSummary.actual) }}
              </span>
            </template>
          </p>
        </div>
      </div>
    </div>

    <div v-if="showForm" class="rounded-lg border border-primary/40 bg-base-200 p-5 max-w-xl">
      <h2 class="font-display font-semibold mb-3">{{ editing ? 'Edit goal' : 'New goal' }}</h2>
      <ScenarioForm :initial="editing" @saved="onSaved" @cancel="showForm = false" />
    </div>

    <EmptyState
      v-if="!goals.scenarios.length && !showForm"
      emoji="🎯"
      title="No goals yet"
      message="Create a savings goal — like a house down payment or emergency fund — and the app will project how long it'll take based on your current savings rate."
    >
      <button type="button" class="btn btn-primary btn-sm mt-1" @click="startCreate">Create a goal</button>
    </EmptyState>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      <ScenarioCard
        v-for="{ scenario, projection } in goals.projections"
        :key="scenario.id"
        :scenario="scenario"
        :projection="projection"
        @edit="startEdit"
        @delete="remove"
      />
    </div>
  </div>
</template>