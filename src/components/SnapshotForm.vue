<script setup>
import { computed, ref, watch } from 'vue'
import LineItemEditor from './LineItemEditor.vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { formatCurrency, deepClone, shiftMonthKey, currentMonthKey, uid } from '../utils/format'
import { formatMonthLong } from '../utils/format'
import { getScheduledOccurrences } from '../utils/incomeSchedule'
import { useIncomeOptionsStore } from '../stores/incomeOptionsStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  initial:         { type: Object,  default: null  },
  // When DataEntryView controls navigation, it passes the selected month
  // here and hides the internal picker so there's only one source of truth.
  month:           { type: String,  default: null  },
  showMonthPicker: { type: Boolean, default: true  },
})
const emit = defineEmits(['saved'])

const finance      = useFinanceStore()
const cards        = useCreditCardStore()
const accountsStore = useAccountsStore()
const incomeOptionsStore = useIncomeOptionsStore()

// Expands all scheduled income sources into dated line items for a given
// month. Each generated item is tagged with scheduleSourceId so isBlank()
// and doPrefill can identify and regenerate them rather than treating them
// as manual user entries.
function buildScheduledIncome(monthKey) {
  const items = []
  for (const option of incomeOptionsStore.incomeOptions) {
    if (!option.schedule?.type) continue
    const occurrences = getScheduledOccurrences(option.schedule, monthKey)
    for (const occ of occurrences) {
      items.push({
        id:               uid(),
        label:            option.name,
        amount:           occ.amount,
        dayOfMonth:       occ.dayOfMonth,
        scheduleSourceId: option.id,
      })
    }
  }
  return items
}

// Creates a blank form for a given month, automatically injecting any
// debt accounts as pinned expense items so the user never has to manually
// re-enter Camry, Silverado, etc. each month. Items are tagged with
// `accountId` so LineItemEditor can render them in their own section.
function createBlankForMonth(monthKey) {
  const debtItems = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0)
    .map((account) => ({
      id:          uid(),
      label:       account.name,
      amount:      (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:    'Debt',
      recurring:   true,
      dayOfMonth:  account.paymentDayOfMonth ?? null,
      accountId:   account.id,
    }))
  return {
    id:           null,
    month:        monthKey,
    incomeItems:  buildScheduledIncome(monthKey),
    expenseItems: debtItems,
    notes:        '',
  }
}

function blank() {
  return createBlankForMonth(props.month ?? currentMonthKey())
}

const form = ref(props.initial ? deepClone(props.initial) : blank())

const monthChangeStatus = ref('')

// Injects any debt accounts not already present in the form (identified
// by accountId). Safe to call on any form state — it's a no-op for
// accounts already represented. Runs on both blank and existing months
// so debt obligations always appear at the top of the expense list.
function injectMissingDebtItems() {
  const existingIds = new Set(
    form.value.expenseItems.filter((i) => i.accountId).map((i) => i.accountId)
  )
  const toInject = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0 && !existingIds.has(a.id))
    .map((account) => ({
      id:         uid(),
      label:      account.name,
      amount:     (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:   'Debt',
      recurring:  true,
      dayOfMonth: account.paymentDayOfMonth ?? null,
      accountId:  account.id,
    }))
  if (toInject.length) {
    form.value.expenseItems = [...toInject, ...form.value.expenseItems]
  }
}

// Re-initialise whenever the parent changes target snapshot or month,
// then ensure debt items are present.
watch(
  [() => props.initial, () => props.month],
  ([initial]) => {
    form.value = initial ? deepClone(initial) : createBlankForMonth(props.month ?? currentMonthKey())
    monthChangeStatus.value = ''
    isDirty.value = false
    injectMissingDebtItems()
  }
)

// Also run when debt accounts first load (async) or change — so that
// if the store wasn't ready when the form initialised, items still appear.
watch(
  () => accountsStore.debtAccounts,
  () => injectMissingDebtItems(),
  { immediate: true }
)

// The month field is a navigation control, not just a label — changing it
// (whether starting a fresh entry, or while editing an existing one via
// History) re-resolves against whatever's actually saved for that month,
// rather than silently keeping the previous month's form contents around.
// Without this, switching from June to May to backfill it would leave
// June's still-typed-in numbers sitting under a "May" label — and worse,
// if editing an existing record (form.id already set), saving would
// rename that record to May by id, regardless of whether a real May entry
// already existed separately.
function handleMonthChange(newMonth) {
  if (!newMonth || newMonth === form.value.month) return
  const existing = finance.snapshots.find((s) => s.month === newMonth)
  if (existing) {
    form.value = deepClone(existing)
    monthChangeStatus.value = `Loaded your existing ${newMonth} entry.`
    isDirty.value = false
  } else {
    form.value = { ...blank(), month: newMonth }
    monthChangeStatus.value = `Starting a new, blank entry for ${newMonth}.`
    isDirty.value = false
  }
}

const cardSpendThisMonth = computed(() => cards.totalForMonth(form.value.month))

// Pass the current day to LineItemEditor so it can render the today
// separator and unscheduled totals — only meaningful for the current month.
const todayDay = computed(() => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return form.value.month === thisMonth ? now.getDate() : null
})

// Live totals computed from the in-progress form — update as you type
// so the predicted balance below stays current without needing a save.
const liveIncome = computed(() =>
  form.value.incomeItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
)
const liveExpenses = computed(() =>
  form.value.expenseItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0) +
  cardSpendThisMonth.value
)
const liveNetCashFlow = computed(() => liveIncome.value - liveExpenses.value)

const saving = ref(false)
const error = ref('')
const toast = useToast()

// Track whether the form has unsaved changes since last save/load
const isDirty = ref(false)
watch(() => form.value, () => { isDirty.value = true }, { deep: true })

// Pre-fill: let the user pick any past month that has income items or
// recurring expense items — not just the most recent one.
const prefillSources = computed(() =>
  finance.sortedSnapshots
    .filter((s) => {
      if (s.month >= form.value.month) return false
      const hasIncome = (s.incomeItems || []).length > 0
      const hasRecurring = (s.expenseItems || []).some((i) => i.recurring)
      return hasIncome || hasRecurring
    })
    .slice()
    .reverse() // newest first in the dropdown
)

const canPrefill = computed(() => prefillSources.value.length > 0)

// Default to the most recent valid source; user can change via the select.
const prefillSourceMonth = ref(null)
const selectedPrefillSource = computed(() => {
  const target = prefillSourceMonth.value ?? prefillSources.value[0]?.month
  return prefillSources.value.find((s) => s.month === target) ?? prefillSources.value[0] ?? null
})

function doPrefill() {
  const snap = selectedPrefillSource.value
  if (!snap) return
  // Fresh debt items from current account definitions
  const freshDebts = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0)
    .map((account) => ({
      id:         uid(),
      label:      account.name,
      amount:     (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:   'Debt',
      recurring:  true,
      dayOfMonth: account.paymentDayOfMonth ?? null,
      accountId:  account.id,
    }))
  // Fresh scheduled income for the TARGET month (not the source month's days)
  const scheduledIncome = buildScheduledIncome(form.value.month)
  const scheduledIds = new Set(
    incomeOptionsStore.incomeOptions
      .filter((o) => o.schedule?.type)
      .map((o) => o.id)
  )
  // Manual (non-scheduled) income items from source month
  const manualIncome = (snap.incomeItems || [])
    .filter((i) => !scheduledIds.has(i.scheduleSourceId))
    .map((i) => ({ ...deepClone(i), id: uid() }))

  form.value.incomeItems  = [...scheduledIncome, ...manualIncome]
  form.value.expenseItems = [
    ...freshDebts,
    ...(snap.expenseItems || [])
      .filter((i) => i.recurring && !i.accountId)
      .map((i) => ({ ...deepClone(i), id: uid() })),
  ]
  monthChangeStatus.value = `Pre-filled from ${snap.month}.`
}

// A form is "blank" if the user hasn't entered anything manually.
// Auto-injected debt obligation items (accountId) and scheduled income
// items (scheduleSourceId) don't count — they appear automatically and
// shouldn't suppress the pre-fill banner.
function isBlank() {
  const userExpenses = form.value.expenseItems.filter((i) => !i.accountId)
  const userIncome   = form.value.incomeItems.filter((i) => !i.scheduleSourceId)
  return userIncome.length === 0 && userExpenses.length === 0 && !form.value.notes.trim()
}

async function save() {
  saving.value = true
  error.value = ''
  if (!props.initial && isBlank()) {
    error.value = "Nothing to save yet — add an income or expense line (or a note) first, or just use \"Planning ahead\" below without saving this month."
    saving.value = false
    return
  }
  try {
    await finance.saveSnapshot(form.value)
    emit('saved')
    isDirty.value = false
    monthChangeStatus.value = ''
    toast.success('Month saved')
    if (!props.initial) form.value = blank()
  } catch (err) {
    error.value = `Couldn't save this month: ${err.message || err}`
    toast.error(`Save failed: ${err.message || err}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <div v-if="showMonthPicker" class="flex items-center gap-3 flex-wrap">
      <label class="font-medium text-sm">Month</label>
      <input
        type="month"
        class="input input-bordered input-sm"
        :value="form.month"
        @change="handleMonthChange($event.target.value)"
        required
      />
      <span v-if="monthChangeStatus" class="text-xs text-base-content/60">{{ monthChangeStatus }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <!-- Pre-fill banner — only when starting a fresh entry with prefillable history -->
      <template v-if="canPrefill && isBlank()">
        <div class="lg:col-span-2 flex items-center justify-between gap-4 rounded-lg border border-base-300 bg-base-200/50 px-4 py-3">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm text-base-content/70 whitespace-nowrap">Pre-fill income + recurring expenses from</p>
            <select
              class="select select-sm select-bordered"
              :value="selectedPrefillSource?.month"
              @change="prefillSourceMonth = $event.target.value"
            >
              <option v-for="s in prefillSources" :key="s.month" :value="s.month">
                {{ formatMonthLong(s.month) }}
              </option>
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-outline shrink-0" @click="doPrefill">
            Pre-fill →
          </button>
        </div>
      </template>

      <LineItemEditor
        v-model="form.incomeItems"
        title="Income"
        placeholder="e.g. Salary, side income"
        :labelSuggestions="finance.incomeSourceOptions"
        :showDayOfMonth="true"
        :showTransfer="true"
        :currentDay="todayDay"
      />

      <div>
        <LineItemEditor
          v-model="form.expenseItems"
          title="Expenses"
          placeholder="e.g. Rent, autopay bills, cash spending"
          :categories="finance.expenseCategories"
          :showRecurring="true"
          :showDayOfMonth="true"
          :currentDay="todayDay"
          :cardTotal="cardSpendThisMonth"
        />
        <p class="text-xs text-base-content/60 mt-2">
          This list is for spending <em>not</em> on a tracked card — rent, autopay bills, cash. Credit card
          spending is logged on the
          <RouterLink to="/cards" class="link link-primary">Credit Cards</RouterLink> page and added
          automatically:
          <span class="font-mono tabular-nums font-medium">{{ formatCurrency(cardSpendThisMonth) }}</span>
          for {{ form.month }}.
        </p>
      </div>
    </div>

    <div class="rounded-lg border border-dashed border-base-300 px-4 py-3 bg-base-200">
      <p class="text-sm text-base-content/70">
        Assets and debts (checking, savings, 401k, loans, ...) are tracked on the
        <RouterLink to="/accounts" class="link link-primary">Accounts</RouterLink> page now — set
        each one up once and just update its balance each month, instead of retyping every
        account here.
      </p>
    </div>

    <div>
      <label class="font-medium text-sm block mb-1">Notes</label>
      <textarea
        class="textarea textarea-bordered w-full bg-base-200"
        rows="2"
        v-model="form.notes"
        placeholder="Anything worth remembering about this month"
      ></textarea>
    </div>

    <!-- Sticky save footer -->
    <div class="sticky bottom-0 z-10 -mx-1 px-1 pb-1 pt-3 pointer-events-none">
      <div class="rounded-xl border border-base-300 bg-base-200 shadow-lg px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto">
        <div class="text-xs text-base-content/40 leading-snug">
          <template v-if="isDirty">
            <span class="text-warning font-medium">Unsaved changes</span>
          </template>
          <template v-else>
            All changes saved
          </template>
        </div>
        <div class="flex items-center gap-3">
          <p v-if="error" class="text-xs text-error max-w-xs leading-snug">{{ error }}</p>
          <button
            type="submit"
            class="btn btn-primary btn-sm"
            :disabled="saving"
            :class="isDirty ? '' : 'btn-outline opacity-60'"
          >
            {{ saving ? 'Saving…' : 'Save month' }}
          </button>
        </div>
      </div>
    </div>

  </form>
</template>