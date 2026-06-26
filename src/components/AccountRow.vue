<script setup>
import { computed, ref } from 'vue'
import { useAccountsStore } from '../stores/accountsStore'
import { formatCurrency, formatPercent, currentMonthKey } from '../utils/format'
import { projectPayoff, formatMonthsDuration, formatPayoffDate } from '../utils/debtPayoff'
import AccountMonthPanel from './AccountMonthPanel.vue'

const props = defineProps({
  account: { type: Object, required: true },
})
const emit = defineEmits(['edit'])

const accountsStore = useAccountsStore()
const showHistory = ref(false)
const thisMonth = currentMonthKey()

const history = computed(() => accountsStore.balancesForAccount(props.account.id))
const balance = computed(() => accountsStore.currentBalance(props.account.id))

const goalBadge = computed(() => {
  if (props.account.goalType === 'house') return 'House Fund'
  if (props.account.goalType === 'emergency') return 'Emergency Fund'
  return null
})

// Combined minimum + extra payment against the current balance and
// interest rate — null for asset accounts, where payoff isn't a
// meaningful concept.
const payoffProjection = computed(() => {
  if (props.account.kind !== 'debt') return null
  const monthlyPayment = (props.account.minimumPayment || 0) + (props.account.extraMonthlyPayment || 0)
  return projectPayoff({
    balance: balance.value,
    annualRatePercent: props.account.interestRatePercent,
    monthlyPayment,
  })
})

// This month's actual contribution against the target, if one's set — the
// per-account met/short comparison the old Fund Account cards showed,
// carried over here. null means either no target is set, or there's no
// earlier data point yet to diff against (e.g. the account's first-ever
// logged month).
const actualThisMonth = computed(() => {
  if (props.account.monthlyTargetContribution == null) return null
  return accountsStore.contributionForMonth(props.account.id, thisMonth)
})

// "This month" already has a dedicated, always-visible panel below — a
// second editor for the same data via history would just be confusing,
// same reasoning as Credit Cards' last-month/this-month panels.
function isEditableViaHistory(month) {
  return month !== thisMonth
}

const editingMonth = ref(null)
const backfillMonth = ref('')

function openEditor(month) {
  editingMonth.value = month
}

async function removeAccount() {
  if (confirm(`Delete "${props.account.name}"? This also deletes its full balance history — that can't be undone.`)) {
    await accountsStore.deleteAccount(props.account.id)
  }
}

async function removeBalance(id, month) {
  if (confirm('Delete this monthly balance entry?')) {
    await accountsStore.deleteBalance(id)
    if (editingMonth.value === month) editingMonth.value = null
  }
}
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-5 flex flex-col gap-4">
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="font-display text-lg font-semibold">{{ account.name }}</h3>
          <span v-if="goalBadge" class="badge badge-ghost badge-sm">{{ goalBadge }}</span>
          <span v-if="account.isRetirement" class="badge badge-outline badge-sm">Retirement</span>
          <span v-if="account.isTransactionAccount" class="badge badge-primary badge-sm">Monthly Entry account</span>
        </div>
        <p v-if="account.kind === 'asset' && account.annualReturnPercent" class="text-xs text-base-content/60">
          {{ formatPercent(account.annualReturnPercent, 1) }} assumed growth
        </p>
        <p v-if="account.kind === 'debt' && account.interestRatePercent" class="text-xs text-base-content/60">
          {{ formatPercent(account.interestRatePercent, 1) }} APR
        </p>
        <p
          v-if="account.kind === 'debt' && (account.minimumPayment != null || account.extraMonthlyPayment)"
          class="text-xs text-base-content/60"
        >
          <template v-if="account.minimumPayment != null">{{ formatCurrency(account.minimumPayment) }}/mo min</template>
          <template v-if="account.extraMonthlyPayment"> + {{ formatCurrency(account.extraMonthlyPayment) }}/mo extra</template>
          <span v-if="account.paymentDayOfMonth" class="ml-2 opacity-75">· Due day {{ account.paymentDayOfMonth }}</span>
        </p>
        <p v-if="account.monthlyTargetContribution != null" class="text-xs text-base-content/60">
          Target {{ formatCurrency(account.monthlyTargetContribution) }}/mo
          <template v-if="actualThisMonth != null">
            —
            <span :class="actualThisMonth >= account.monthlyTargetContribution ? 'text-success' : 'text-error'">
              {{ formatCurrency(actualThisMonth) }} this month
              ({{ actualThisMonth >= account.monthlyTargetContribution ? 'met' : 'short' }})
            </span>
          </template>
          <span v-else class="text-base-content/40">— no data this month yet</span>
        </p>
      </div>
      <div class="flex gap-1">
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('edit', account)">Edit</button>
        <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeAccount">Delete</button>
      </div>
    </div>

    <div>
      <p class="text-xs text-base-content/60">Current balance</p>
      <p class="font-mono tabular-nums text-2xl font-semibold">{{ formatCurrency(balance) }}</p>
    </div>

    <div v-if="account.kind === 'debt' && balance > 0" class="rounded-lg bg-base-200/60 px-3 py-2">
      <template v-if="payoffProjection?.possible">
        <p class="text-sm">
          Paid off in <span class="font-medium">{{ formatMonthsDuration(payoffProjection.months) }}</span>
          (~{{ formatPayoffDate(payoffProjection.months) }})
        </p>
        <p class="text-xs text-base-content/60">
          {{ formatCurrency(payoffProjection.totalInterest) }} total interest at this payment
        </p>
      </template>
      <p v-else-if="payoffProjection?.reason === 'no-payment'" class="text-xs text-base-content/60">
        Set a minimum payment above to see a payoff projection.
      </p>
      <p v-else-if="payoffProjection?.reason === 'payment-too-low'" class="text-xs text-error">
        This payment doesn't cover the interest — the balance won't shrink. Increase it to see a
        payoff projection.
      </p>
      <p v-else-if="payoffProjection?.reason === 'too-long'" class="text-xs text-base-content/60">
        This payoff would take well over 50 years at the current payment.
      </p>
    </div>
    <p v-else-if="account.kind === 'debt' && balance <= 0" class="text-sm text-success font-medium">Paid off.</p>

    <AccountMonthPanel :accountId="account.id" :month="thisMonth" label="This month" />

    <button
      v-if="history.length"
      type="button"
      class="btn btn-ghost btn-xs self-start"
      @click="showHistory = !showHistory"
    >
      {{ showHistory ? 'Hide history' : `View history (${history.length})` }}
    </button>

    <div v-if="showHistory" class="space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-xs text-base-content/60">Edit or backfill a month</label>
        <input type="month" class="input input-bordered input-xs" v-model="backfillMonth" :max="thisMonth" />
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="!backfillMonth"
          @click="openEditor(backfillMonth)"
        >
          Open
        </button>
      </div>

      <div v-if="editingMonth" class="rounded-lg border border-base-300 bg-base-200/40 p-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-medium text-base-content/60">Editing {{ editingMonth }}</span>
          <button type="button" class="btn btn-ghost btn-xs" @click="editingMonth = null">Done</button>
        </div>
        <AccountMonthPanel
          :key="editingMonth"
          :accountId="account.id"
          :month="editingMonth"
          label="Balance"
          @saved="editingMonth = null"
        />
      </div>

      <div class="overflow-x-auto">
        <table class="table table-xs">
          <tbody>
            <tr v-for="entry in [...history].reverse()" :key="entry.id">
              <td>{{ entry.month }}</td>
              <td class="text-right font-mono tabular-nums">{{ formatCurrency(entry.amount) }}</td>
              <td class="text-right whitespace-nowrap">
                <button
                  v-if="isEditableViaHistory(entry.month)"
                  type="button"
                  class="btn btn-ghost btn-xs"
                  @click="openEditor(entry.month)"
                >
                  Edit
                </button>
                <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeBalance(entry.id, entry.month)">
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>