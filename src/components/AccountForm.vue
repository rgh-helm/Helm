<script setup>
import { computed, ref, watch } from 'vue'
import { useAccountsStore } from '../stores/accountsStore'

const props = defineProps({
  initial: { type: Object, default: null },
  // Pre-selects the kind when creating from a context that already
  // implies it (e.g. the "+ Add asset" vs "+ Add debt" button).
  defaultKind: { type: String, default: 'asset' },
})
const emit = defineEmits(['saved', 'cancel'])

const accountsStore = useAccountsStore()
const error = ref('')

function blank() {
  return {
    id: null,
    name: '',
    kind: props.defaultKind,
    goalType: null,
    annualReturnPercent: 0,
    monthlyTargetContribution: null,
    isRetirement: false,
    interestRatePercent: 0,
    minimumPayment: null,
    extraMonthlyPayment: null,
    paymentDayOfMonth: null,
    isTransactionAccount: false,
  }
}

const form = ref(props.initial ? { ...props.initial } : blank())

// Shown next to the transaction-account checkbox so picking it doesn't
// silently steal the flag from another account with no warning — only
// relevant when that other account isn't the one currently being edited.
const otherTransactionAccountName = computed(() => {
  const current = accountsStore.transactionAccount
  if (!current || current.id === form.value.id) return null
  return current.name
})

watch(
  () => props.initial,
  (val) => {
    form.value = val ? { ...val } : blank()
  }
)

async function save() {
  error.value = ''
  try {
    await accountsStore.saveAccount(form.value)
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label-text font-medium text-sm">Account name</label>
      <input
        type="text"
        class="input input-bordered input-sm w-full"
        v-model="form.name"
        placeholder="e.g. Checking, Savings, 401k, Car Loan"
        required
      />
    </div>

    <div>
      <label class="label-text font-medium text-sm">Type</label>
      <div class="join w-full">
        <button
          type="button"
          class="btn btn-sm join-item flex-1"
          :class="form.kind === 'asset' ? 'btn-primary' : 'btn-outline'"
          @click="form.kind = 'asset'"
        >
          Asset
        </button>
        <button
          type="button"
          class="btn btn-sm join-item flex-1"
          :class="form.kind === 'debt' ? 'btn-primary' : 'btn-outline'"
          @click="form.kind = 'debt'"
        >
          Debt
        </button>
      </div>
    </div>

    <template v-if="form.kind === 'asset'">
      <div>
        <label class="label-text font-medium text-sm">Counts toward a goal? (optional)</label>
        <div class="join w-full">
          <button
            type="button"
            class="btn btn-sm join-item flex-1"
            :class="form.goalType === null ? 'btn-primary' : 'btn-outline'"
            @click="form.goalType = null"
          >
            None
          </button>
          <button
            type="button"
            class="btn btn-sm join-item flex-1"
            :class="form.goalType === 'house' ? 'btn-primary' : 'btn-outline'"
            @click="form.goalType = 'house'"
          >
            House Fund
          </button>
          <button
            type="button"
            class="btn btn-sm join-item flex-1"
            :class="form.goalType === 'emergency' ? 'btn-primary' : 'btn-outline'"
            @click="form.goalType = 'emergency'"
          >
            Emergency Fund
          </button>
        </div>
      </div>

      <div>
        <label class="label cursor-pointer justify-start gap-3 px-0">
          <input type="checkbox" class="checkbox checkbox-sm" v-model="form.isRetirement" />
          <span class="label-text font-medium text-sm">Retirement account</span>
        </label>
        <p class="text-xs text-base-content/60 mt-1">
          Tag accounts like a 401k or IRA so they can be excluded from "non-retirement" totals
          and charts elsewhere in the app — purely a label, doesn't change any growth math.
        </p>
      </div>

      <div>
        <label class="label cursor-pointer justify-start gap-3 px-0">
          <input type="checkbox" class="checkbox checkbox-sm" v-model="form.isTransactionAccount" />
          <span class="label-text font-medium text-sm">Use for Monthly Entry predicted balance</span>
        </label>
        <p class="text-xs text-base-content/60 mt-1">
          Designates this as "the" account Monthly Entry logs against (e.g. Joint Checking) —
          shows a month-start and predicted month-end balance there based on that month's income
          and expenses. Only one account can carry this.
          <span v-if="otherTransactionAccountName && !form.isTransactionAccount">
            Currently set to <strong>{{ otherTransactionAccountName }}</strong> — checking this
            will move it here.
          </span>
        </p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Assumed annual growth rate %</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.annualReturnPercent"
          min="0"
          max="100"
          step="0.1"
        />
        <p class="text-xs text-base-content/60 mt-1">
          e.g. ~4-5% for a HYSA, ~7% for a long-horizon brokerage assumption, 0% for something
          like checking. If this is tagged to a goal above, it blends with any other accounts
          tagged to that same goal, weighted by current balance.
        </p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Monthly contribution target (optional)</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.monthlyTargetContribution"
          min="0"
          placeholder="Leave blank to skip tracking"
        />
        <p class="text-xs text-base-content/60 mt-1">
          Treats this account like a protected transfer — e.g. retirement contributions that
          happen automatically before discretionary spending gets a chance at the money.
        </p>
      </div>
    </template>

    <template v-else-if="form.kind === 'debt'">
      <div>
        <label class="label-text font-medium text-sm">Interest rate %/yr</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.interestRatePercent"
          min="0"
          step="0.1"
        />
        <p class="text-xs text-base-content/60 mt-1">Use the actual APR from your statement if you know it.</p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Minimum payment $/mo (optional)</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.minimumPayment"
          min="0"
          placeholder="Leave blank to skip tracking"
        />
        <p class="text-xs text-base-content/60 mt-1">
          What's contractually required each month — this is what Affordability's "Other Monthly
          Debts" auto-pull uses by default.
        </p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Extra monthly payment $/mo (optional)</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.extraMonthlyPayment"
          min="0"
          placeholder="Leave blank for none"
        />
        <p class="text-xs text-base-content/60 mt-1">
          On top of the minimum — your actual payoff plan. Shows up as a faster projected payoff
          below once an interest rate and at least the minimum payment are set.
        </p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Payment day of month (optional)</label>
        <div class="flex items-center gap-2 mt-1">
          <input
            type="number"
            class="input input-bordered input-sm w-24"
            v-model.number="form.paymentDayOfMonth"
            min="1"
            max="31"
            placeholder="e.g. 12"
          />
          <span class="text-xs text-base-content/50">of each month</span>
        </div>
        <p class="text-xs text-base-content/60 mt-1">
          The day this payment clears your checking account — pins it on the cash flow timeline
          and pre-fills the day column in Monthly Entry.
        </p>
      </div>
    </template>

    <div class="flex gap-2 pt-2">
      <button type="submit" class="btn btn-primary btn-sm">Save account</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('cancel')">Cancel</button>
    </div>
    <p v-if="error" class="text-sm text-error">{{ error }}</p>
  </form>
</template>