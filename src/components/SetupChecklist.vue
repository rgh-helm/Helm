<script setup>
import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { currentMonthKey } from '../utils/format'

const finance  = useFinanceStore()
const cards    = useCreditCardStore()
const goals    = useGoalsStore()
const settings = useSettingsStore()

const steps = computed(() => [
  {
    id: 'first_month',
    label: 'Log your first month',
    detail: 'Head to Monthly Entry and record your income and expenses.',
    done: finance.actualSnapshots.length > 0,
    to: '/entry',
  },
  {
    id: 'primary_labels',
    label: 'Tag your primary income',
    detail: 'In Settings, label which income sources belong to the primary earner so bandwidth calculations can separate them.',
    done: settings.primaryIncomeLabels.length > 0,
    to: '/settings',
  },
  {
    id: 'add_card',
    label: 'Add a credit card',
    detail: 'Track your card spending against a monthly budget in the Credit Cards screen.',
    done: cards.cards.length > 0,
    to: '/cards',
  },
  {
    id: 'cc_budget',
    label: 'Set a card budget',
    detail: 'Apply the suggested CC ceiling from the Bandwidth widget, or set your own budget on each card.',
    done: cards.cards.some((c) => (c.targetBudget ?? 0) > 0),
    to: '/cards',
  },
  {
    id: 'log_current_month',
    label: 'Log the current month',
    detail: 'Keep your data current — log this month\'s numbers so the dashboard reflects where you are right now.',
    done: finance.actualSnapshots.some((s) => s.month === currentMonthKey()),
    to: '/entry',
  },
  {
    id: 'first_goal',
    label: 'Create a savings goal',
    detail: 'Add a goal in the Goals screen to start projecting your timeline to a house down payment or emergency fund.',
    done: goals.scenarios.length > 0,
    to: '/goals',
  },
])

const completedCount = computed(() => steps.value.filter((s) => s.done).length)
const allDone = computed(() => completedCount.value === steps.value.length)
const progressPct = computed(() => (completedCount.value / steps.value.length) * 100)
</script>

<template>
  <div
    v-if="!settings.checklistDismissed"
    class="rounded-lg border border-base-300 bg-base-200 overflow-hidden"
  >
    <!-- Header -->
    <div class="px-5 pt-5 pb-4 border-b border-base-300 flex items-start justify-between gap-3">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h2 class="font-display font-semibold">Getting started</h2>
          <span class="text-xs text-base-content/40 font-mono tabular-nums">
            {{ completedCount }}/{{ steps.length }}
          </span>
        </div>
        <!-- Progress bar -->
        <div class="h-1.5 rounded-full bg-base-300 overflow-hidden w-full max-w-xs">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500"
            :style="`width: ${progressPct}%`"
          ></div>
        </div>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-xs text-base-content/30 hover:text-base-content/60 shrink-0"
        title="Dismiss checklist"
        @click="settings.setChecklistDismissed(true)"
      >✕</button>
    </div>

    <!-- All done state -->
    <div v-if="allDone" class="px-5 py-6 text-center">
      <p class="text-2xl mb-2">🎉</p>
      <p class="font-display font-semibold text-base-content/80">You're all set up!</p>
      <p class="text-sm text-base-content/50 mt-1 mb-4">
        The dashboard is fully populated. You can dismiss this checklist now.
      </p>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="settings.setChecklistDismissed(true)"
      >Dismiss checklist</button>
    </div>

    <!-- Step list -->
    <ul v-else class="divide-y divide-base-300">
      <li
        v-for="step in steps"
        :key="step.id"
        class="flex items-start gap-3 px-5 py-3.5 transition-colors"
        :class="step.done ? 'opacity-50' : 'hover:bg-base-200/40'"
      >
        <!-- Check circle -->
        <div class="shrink-0 mt-0.5">
          <svg
            v-if="step.done"
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4 text-success"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div v-else class="w-4 h-4 rounded-full border-2 border-base-300"></div>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium" :class="step.done ? 'line-through text-base-content/40' : ''">
            {{ step.label }}
          </p>
          <p v-if="!step.done" class="text-xs text-base-content/50 mt-0.5 leading-snug">
            {{ step.detail }}
          </p>
        </div>

        <!-- Action link -->
        <RouterLink
          v-if="!step.done"
          :to="step.to"
          class="btn btn-ghost btn-xs shrink-0 text-primary"
        >Go →</RouterLink>
      </li>
    </ul>
  </div>
</template>