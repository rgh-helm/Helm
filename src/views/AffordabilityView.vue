<script setup>
import { computed, ref } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { calculateAffordability, scoreAffordability } from '../utils/affordability'
import { formatCurrency, formatPercent, uid } from '../utils/format'
import LineItemEditor from '../components/LineItemEditor.vue'

const finance = useFinanceStore()
const goals = useGoalsStore()
const settings = useSettingsStore()
const accountsStore = useAccountsStore()
const defaults = settings.affordabilityDefaults

// Default to whatever's already on an existing House goal, if there is
// one — otherwise a generic placeholder.
const existingHouseGoal = goals.scenarios.find((s) => s.type === 'house')

const price = ref(existingHouseGoal?.homePrice || 400000)
const useCurrentSavings = ref(true)
const downPaymentManual = ref(Math.round((existingHouseGoal?.homePrice || 400000) * 0.2))
const annualRatePercent = ref(defaults.defaultMortgageRatePercent ?? 6.5)
const years = ref(defaults.defaultLoanTermYears ?? 30)
const propertyTaxRatePercent = ref(defaults.defaultPropertyTaxRatePercent ?? 1.1)
const annualInsurance = ref(defaults.defaultAnnualInsurance ?? 1500)
const monthlyHOA = ref(defaults.defaultMonthlyHOA ?? 0)
// Typical lender-charged PMI range is roughly 0.3-1.5%/yr of the loan
// amount depending on credit and down payment size; 0.5% is a reasonable
// starting estimate absent a real quote. Only actually applied below when
// down payment is under 20% — see calculateAffordability.
const pmiAnnualRatePercent = ref(defaults.defaultPmiRatePercent ?? 0.5)

// A free-form list instead of one number, so more than one income source
// (a second job, a spouse's income, ...) doesn't have to be hand-summed
// outside the app first. Settings' explicit gross income (if set) seeds
// the first row — it's the authoritative source once set. Falls back to
// the average of logged income only when nothing's been set in Settings
// yet, and even then that's a rough stand-in (logged income may not be
// gross/pre-tax — see the hint below the list).
function blankIncomeSource(label, amount) {
  return { id: uid(), label, amount }
}
// Seed from grossIncomeSources (multiple earners) if set, fall back to
// legacy grossMonthlyIncome single value, then to logged income estimate.
const incomeSources = ref(
  Array.isArray(defaults.grossIncomeSources) && defaults.grossIncomeSources.length
    ? defaults.grossIncomeSources.map((s) => blankIncomeSource(s.label || 'Income', s.amount || 0))
    : [
        blankIncomeSource(
          defaults.grossMonthlyIncome != null ? 'Primary income' : 'Estimated from logged income',
          defaults.grossMonthlyIncome ?? Math.round(finance.avgMonthlyIncome) ?? 0
        ),
      ]
)
const grossMonthlyIncome = computed(() =>
  incomeSources.value.reduce((acc, s) => acc + (Number(s.amount) || 0), 0)
)

// Defaults to pulling from tracked Debt accounts' minimum payments —
// matches how a lender actually calculates debt-to-income (required
// minimums, not whatever extra you're optionally choosing to pay toward
// payoff) — with an opt-in toggle for including extra payments too, and
// a manual override for debts that aren't tracked as accounts at all.
const useDebtAccountsForOtherDebt = ref(true)
const includeExtraDebtPayments = ref(false)
const otherMonthlyDebtManual = ref(defaults.defaultOtherMonthlyDebt ?? 0)
const debtAccountsMinimumTotal = computed(() => accountsStore.currentMinimumDebtPaymentTotal)
const debtAccountsFullTotal = computed(
  () => accountsStore.currentMinimumDebtPaymentTotal + accountsStore.currentExtraDebtPaymentTotal
)
const otherMonthlyDebt = computed(() => {
  if (!useDebtAccountsForOtherDebt.value) return otherMonthlyDebtManual.value || 0
  return includeExtraDebtPayments.value ? debtAccountsFullTotal.value : debtAccountsMinimumTotal.value
})

const closingCostsPercent = ref(existingHouseGoal?.closingCostsPercent ?? defaults.defaultClosingCostsPercent ?? 2)

const downPayment = computed(() =>
  useCurrentSavings.value ? finance.currentHouseFund : downPaymentManual.value || 0
)
const downPaymentPercent = computed(() => (price.value > 0 ? (downPayment.value / price.value) * 100 : 0))

const result = computed(() =>
  calculateAffordability({
    price: price.value,
    downPayment: downPayment.value,
    annualRatePercent: annualRatePercent.value,
    years: years.value,
    propertyTaxRatePercent: propertyTaxRatePercent.value,
    annualInsurance: annualInsurance.value,
    monthlyHOA: monthlyHOA.value,
    pmiAnnualRatePercent: pmiAnnualRatePercent.value,
    grossMonthlyIncome: grossMonthlyIncome.value,
    otherMonthlyDebt: otherMonthlyDebt.value,
    closingCostsPercent: closingCostsPercent.value,
  })
)

const score = computed(() => scoreAffordability(result.value))
const scoreBadgeClass = computed(() => {
  if (score.value === 'green') return 'badge-success'
  if (score.value === 'yellow') return 'badge-warning'
  if (score.value === 'red') return 'badge-error'
  return 'badge-ghost'
})
const scoreLabel = computed(() => {
  if (score.value === 'green') return 'Comfortably within guidelines'
  if (score.value === 'yellow') return 'Within stretch guidelines'
  if (score.value === 'red') return 'Above standard guidelines'
  return 'Enter your income to see a score'
})

const cashAvailable = computed(() => finance.currentHouseFund)
const cashGap = computed(() => Math.max(result.value.cashNeeded - cashAvailable.value, 0))
const cashCoveredPercent = computed(() =>
  result.value.cashNeeded > 0 ? Math.min((cashAvailable.value / result.value.cashNeeded) * 100, 100) : 100
)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-display text-2xl font-semibold">Home Affordability</h1>
      <p class="text-sm text-base-content/60 max-w-2xl">
        Punch in a price you're considering and see it against your real numbers — the standard
        28/36 lending guideline (housing ≤28% of gross income, total debt ≤36%) for the ongoing
        payment, and your actual House Fund balance for the cash you'd need upfront. This is a
        widely-used industry rule of thumb, not a pre-approval or a guarantee — actual
        qualification depends on credit, lender, and loan specifics this doesn't know about.
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
        <h2 class="font-display font-semibold">Assumptions</h2>

        <div>
          <label class="label-text font-medium text-sm">Home price</label>
          <input type="number" class="input input-bordered input-sm w-full" v-model.number="price" min="0" />
        </div>

        <div>
          <label class="label-text font-medium text-sm">Down payment</label>
          <label class="label cursor-pointer justify-start gap-2 py-1">
            <input type="checkbox" class="toggle toggle-sm" v-model="useCurrentSavings" />
            <span class="label-text text-sm">Use my current House Fund balance ({{ formatCurrency(finance.currentHouseFund) }})</span>
          </label>
          <input
            v-if="!useCurrentSavings"
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="downPaymentManual"
            min="0"
          />
          <p class="text-xs text-base-content/60 mt-1">
            {{ formatCurrency(downPayment) }} ({{ formatPercent(downPaymentPercent, 1) }} down)
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label-text font-medium text-sm">Interest rate %</label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              v-model.number="annualRatePercent"
              min="0"
              step="0.1"
            />
            <p class="text-xs text-base-content/60 mt-1">Use your actual quote if you have one.</p>
          </div>
          <div>
            <label class="label-text font-medium text-sm">Loan term</label>
            <div class="join w-full">
              <button
                type="button"
                class="btn btn-sm join-item flex-1"
                :class="years === 30 ? 'btn-primary' : 'btn-outline'"
                @click="years = 30"
              >
                30yr
              </button>
              <button
                type="button"
                class="btn btn-sm join-item flex-1"
                :class="years === 15 ? 'btn-primary' : 'btn-outline'"
                @click="years = 15"
              >
                15yr
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label-text font-medium text-sm">Property tax %/yr</label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              v-model.number="propertyTaxRatePercent"
              min="0"
              step="0.05"
            />
            <p class="text-xs text-base-content/60 mt-1">Varies a lot by county — check yours.</p>
          </div>
          <div>
            <label class="label-text font-medium text-sm">Insurance $/yr</label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              v-model.number="annualInsurance"
              min="0"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label-text font-medium text-sm">HOA $/mo</label>
            <input type="number" class="input input-bordered input-sm w-full" v-model.number="monthlyHOA" min="0" />
          </div>
          <div>
            <label class="label-text font-medium text-sm">Closing costs %</label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              v-model.number="closingCostsPercent"
              min="0"
              step="0.5"
            />
          </div>
        </div>

        <div>
          <label class="label-text font-medium text-sm">PMI rate %/yr</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="pmiAnnualRatePercent"
            min="0"
            step="0.05"
          />
          <p class="text-xs text-base-content/60 mt-1">
            Lenders typically require this below 20% down — currently
            {{ ' ' }}<span class="font-medium">{{ result.pmiApplies ? 'applies' : "doesn't apply" }}</span>
            at {{ formatPercent(downPaymentPercent, 1) }} down.
          </p>
        </div>

        <div class="divider my-0"></div>

        <div>
          <LineItemEditor v-model="incomeSources" title="Gross monthly income" placeholder="e.g. Salary, Spouse salary" />
          <p class="text-xs text-base-content/60 mt-1">
            Pre-tax/gross, not take-home — one row per earner, summed for DTI calculations.
            <template v-if="settings.affordabilityDefaults.grossIncomeSources?.length">
              Pre-filled from Settings → Affordability Defaults.
            </template>
            <template v-else-if="settings.affordabilityDefaults.grossMonthlyIncome != null">
              Defaulted from Settings → Affordability Defaults — consider adding named sources
              per earner in <RouterLink to="/settings" class="link link-primary">Settings</RouterLink>.
            </template>
            <template v-else>
              Estimated from logged income, which may not be gross — set precise values in
              <RouterLink to="/settings" class="link link-primary">Settings</RouterLink> so it's right every time.
            </template>
          </p>
        </div>

        <div>
          <label class="label-text font-medium text-sm">Other monthly debt payments</label>
          <label class="label cursor-pointer justify-start gap-2 py-1">
            <input type="checkbox" class="toggle toggle-sm" v-model="useDebtAccountsForOtherDebt" />
            <span class="label-text text-sm">
              Use my tracked Debt accounts ({{ formatCurrency(debtAccountsMinimumTotal) }} min/mo)
            </span>
          </label>
          <label v-if="useDebtAccountsForOtherDebt" class="label cursor-pointer justify-start gap-2 py-1 pl-6">
            <input type="checkbox" class="toggle toggle-xs" v-model="includeExtraDebtPayments" />
            <span class="label-text text-xs text-base-content/70">
              Include extra/payoff-plan payments too ({{ formatCurrency(debtAccountsFullTotal) }} total)
            </span>
          </label>
          <input
            v-if="!useDebtAccountsForOtherDebt"
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="otherMonthlyDebtManual"
            min="0"
            placeholder="Car loans, student loans, minimum card payments, etc."
          />
          <p class="text-xs text-base-content/60 mt-1">
            {{ formatCurrency(otherMonthlyDebt) }} used in the calculation
            <template v-if="useDebtAccountsForOtherDebt">
              — set minimum payments on the
              <RouterLink to="/accounts" class="link link-primary">Accounts</RouterLink> page if
              this looks off.
            </template>
          </p>
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-display font-semibold">Monthly payment</h2>
            <span class="badge" :class="scoreBadgeClass">{{ scoreLabel }}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs text-base-content/60">Principal &amp; interest</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.monthlyPI) }}</p>
            </div>
            <div>
              <p class="text-xs text-base-content/60">Property tax</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.monthlyTax) }}</p>
            </div>
            <div>
              <p class="text-xs text-base-content/60">Insurance</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.monthlyInsurance) }}</p>
            </div>
            <div>
              <p class="text-xs text-base-content/60">HOA</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.monthlyHOA) }}</p>
            </div>
            <div v-if="result.monthlyPMI > 0">
              <p class="text-xs text-base-content/60">PMI</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.monthlyPMI) }}</p>
            </div>
          </div>
          <div class="divider my-1"></div>
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">Total monthly housing cost</p>
            <p class="font-mono tabular-nums font-semibold text-lg">{{ formatCurrency(result.monthlyHousingCost) }}</p>
          </div>

          <div v-if="result.frontEndRatio != null" class="space-y-2 pt-2">
            <div>
              <div class="flex justify-between text-xs text-base-content/60 mb-1">
                <span>Housing ÷ gross income (front-end, guideline ≤28%)</span>
                <span class="font-mono tabular-nums">{{ formatPercent(result.frontEndRatio, 1) }}</span>
              </div>
              <progress
                class="progress w-full"
                :class="result.frontEndRatio <= 28 ? 'progress-success' : result.frontEndRatio <= 33 ? 'progress-warning' : 'progress-error'"
                :value="Math.min(result.frontEndRatio, 50)"
                max="50"
              ></progress>
            </div>
            <div>
              <div class="flex justify-between text-xs text-base-content/60 mb-1">
                <span>Housing + other debt ÷ income (back-end, guideline ≤36%)</span>
                <span class="font-mono tabular-nums">{{ formatPercent(result.backEndRatio, 1) }}</span>
              </div>
              <progress
                class="progress w-full"
                :class="result.backEndRatio <= 36 ? 'progress-success' : result.backEndRatio <= 43 ? 'progress-warning' : 'progress-error'"
                :value="Math.min(result.backEndRatio, 60)"
                max="60"
              ></progress>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-3">
          <h2 class="font-display font-semibold">Cash needed upfront</h2>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs text-base-content/60">Down payment</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(downPayment) }}</p>
            </div>
            <div>
              <p class="text-xs text-base-content/60">Closing costs (est.)</p>
              <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(result.closingCosts) }}</p>
            </div>
          </div>
          <div class="divider my-1"></div>
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">Total cash needed</p>
            <p class="font-mono tabular-nums font-semibold text-lg">{{ formatCurrency(result.cashNeeded) }}</p>
          </div>
          <div>
            <div class="flex justify-between text-xs text-base-content/60 mb-1">
              <span>Your House Fund covers</span>
              <span class="font-mono tabular-nums">{{ formatPercent(cashCoveredPercent, 0) }}</span>
            </div>
            <progress class="progress progress-primary w-full" :value="cashCoveredPercent" max="100"></progress>
            <p class="text-xs text-base-content/60 mt-1">
              {{
                cashGap > 0
                  ? `${formatCurrency(cashGap)} more needed at your current ${formatCurrency(cashAvailable)} House Fund balance.`
                  : `Covered — you have ${formatCurrency(cashAvailable - result.cashNeeded)} more than this needs.`
              }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>