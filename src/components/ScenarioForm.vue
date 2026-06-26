<script setup>
import { computed, ref, watch } from 'vue'
import { useGoalsStore } from '../stores/goalsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { formatPercent } from '../utils/format'

const props = defineProps({
  initial: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'cancel'])

const goals = useGoalsStore()
const settings = useSettingsStore()
const finance = useFinanceStore()
const accountsStore = useAccountsStore()

function blank() {
  return {
    id: null,
    type: 'house',
    name: '',
    // house fields
    homePrice: 400000,
    downPaymentPercent: 20,
    closingCostsPercent: 2,
    // emergency fields
    emergencyMode: 'months',
    monthsOfExpenses: 3,
    targetAmount: 15000,
    // shared fields
    monthlyContribution: null,
    targetDate: '',
  }
}

const form = ref(props.initial ? { ...blank(), ...props.initial } : blank())
const useTargetDate = ref(!!form.value.targetDate)

watch(
  () => props.initial,
  (val) => {
    form.value = val ? { ...blank(), ...val } : blank()
    useTargetDate.value = !!form.value.targetDate
  }
)

// The growth rate is no longer typed per scenario — it's the
// balance-weighted average of whichever accounts (house or emergency)
// feed this goal, so every scenario of the same type shares one
// consistent, account-derived assumption. Managed at Accounts.
const relevantAccounts = computed(() =>
  form.value.type === 'emergency' ? accountsStore.emergencyAccounts : accountsStore.houseAccounts
)
const blendedRate = computed(() =>
  form.value.type === 'emergency' ? finance.emergencyFundRate : finance.houseFundRate
)

async function save() {
  const payload = { ...form.value }
  if (useTargetDate.value) {
    payload.monthlyContribution = null
  } else {
    payload.targetDate = ''
  }
  await goals.saveScenario(payload)
  emit('saved')
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label-text font-medium text-sm">Goal type</label>
      <div class="join w-full">
        <button
          type="button"
          class="btn btn-sm join-item flex-1"
          :class="form.type === 'house' ? 'btn-primary' : 'btn-outline'"
          @click="form.type = 'house'"
        >
          House
        </button>
        <button
          type="button"
          class="btn btn-sm join-item flex-1"
          :class="form.type === 'emergency' ? 'btn-primary' : 'btn-outline'"
          @click="form.type = 'emergency'"
        >
          Emergency Fund
        </button>
      </div>
    </div>

    <div>
      <label class="label-text font-medium text-sm">Goal name</label>
      <input
        type="text"
        class="input input-bordered input-sm w-full"
        v-model="form.name"
        :placeholder="form.type === 'house' ? 'e.g. Starter home, Dream home' : 'e.g. Emergency Fund'"
        required
      />
    </div>

    <template v-if="form.type === 'house'">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label-text font-medium text-sm">Home price</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="form.homePrice"
            min="0"
            required
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Down payment %</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="form.downPaymentPercent"
            min="0"
            max="100"
            required
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Closing costs %</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="form.closingCostsPercent"
            min="0"
            max="100"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-2">
          <input type="radio" class="radio radio-sm" value="months" v-model="form.emergencyMode" />
          <span class="label-text text-sm">Base target on months of expenses</span>
        </label>
        <label class="label cursor-pointer justify-start gap-2">
          <input type="radio" class="radio radio-sm" value="flat" v-model="form.emergencyMode" />
          <span class="label-text text-sm">Use a flat dollar target</span>
        </label>
      </div>

      <div v-if="form.emergencyMode === 'months'">
        <label class="label-text font-medium text-sm">Months of expenses</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.monthsOfExpenses"
          min="1"
          max="24"
        />
        <p class="text-xs text-base-content/60 mt-1">
          Target = this number × your trailing {{ settings.trailingAverageMonths }}-month average monthly expenses.
        </p>
      </div>
      <div v-else>
        <label class="label-text font-medium text-sm">Target amount</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.targetAmount"
          min="0"
        />
      </div>
    </template>

    <div class="rounded-md bg-base-200 px-3 py-2">
      <p class="text-xs text-base-content/60">Assumed growth rate</p>
      <p class="text-sm font-mono tabular-nums font-medium">
        {{ relevantAccounts.length ? formatPercent(blendedRate, 2) : '0%' }}
        <span class="font-sans font-normal text-xs text-base-content/60">
          {{
            relevantAccounts.length
              ? `blended from ${relevantAccounts.length} ${relevantAccounts.length === 1 ? 'account' : 'accounts'}`
              : `— no ${form.type === 'emergency' ? 'emergency' : 'house'} fund accounts set up yet`
          }}
        </span>
      </p>
      <p class="text-xs text-base-content/60 mt-1">
        Set up accounts and their assumed rates on the
        <RouterLink to="/accounts" class="link link-primary">Accounts</RouterLink> page — every
        goal of this type shares this same blended rate.
      </p>
    </div>

    <div class="form-control">
      <label class="label cursor-pointer justify-start gap-2">
        <input type="checkbox" class="toggle toggle-sm" v-model="useTargetDate" />
        <span class="label-text text-sm">Target a specific date instead of a monthly amount</span>
      </label>
    </div>

    <div v-if="useTargetDate">
      <label class="label-text font-medium text-sm">Target date</label>
      <input type="month" class="input input-bordered input-sm w-full" v-model="form.targetDate" />
      <p class="text-xs text-base-content/60 mt-1">We'll calculate the monthly amount needed to hit this date.</p>
    </div>
    <div v-else>
      <label class="label-text font-medium text-sm">Monthly contribution (optional)</label>
      <input
        type="number"
        class="input input-bordered input-sm w-full"
        v-model.number="form.monthlyContribution"
        placeholder="Leave blank to use your recent average savings rate"
      />
    </div>

    <div class="flex gap-2 pt-2">
      <button type="submit" class="btn btn-primary btn-sm">Save goal</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>