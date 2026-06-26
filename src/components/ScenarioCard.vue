<script setup>
import { computed, ref, watch } from 'vue'
import { formatCurrency, formatPercent } from '../utils/format'
import { formatMonthYear, monthsToReachTarget, addMonths } from '../utils/projections'

const props = defineProps({
  scenario: { type: Object, required: true },
  projection: { type: Object, required: true },
})

defineEmits(['edit', 'delete'])

const subtitle = computed(() => {
  if (props.scenario.type === 'emergency') {
    return props.scenario.emergencyMode === 'months'
      ? `${props.scenario.monthsOfExpenses} months of expenses`
      : `${formatCurrency(props.scenario.targetAmount)} target`
  }
  return `${formatCurrency(props.scenario.homePrice)} home · ${props.scenario.downPaymentPercent}% down`
})

const badgeLabel = computed(() => (props.scenario.type === 'emergency' ? 'Emergency Fund' : 'House'))

// "What changes if I cut $X/month" — only meaningful in "project from
// savings rate" mode (no target date). In "work backward from a date"
// mode, the monthly contribution is already a *result* (requiredContribution),
// not something the user is directly choosing, so there's nothing to slide.
const adjustable = computed(() => !props.scenario.targetDate)

const baseContribution = computed(() => props.projection.effectiveMonthlyContribution || 0)
const adjustment = ref(0)

// Reset the slider whenever the underlying baseline shifts (e.g. a new
// snapshot changes the trailing average) so it doesn't silently keep
// applying a stale delta to a different baseline.
watch(baseContribution, () => {
  adjustment.value = 0
})

// Slider range scales with the baseline rather than a fixed dollar amount,
// so a $200/mo saver and a $2,000/mo saver both get a sensibly-sized range.
const sliderRange = computed(() => Math.max(baseContribution.value, 200))
const adjustedContribution = computed(() => baseContribution.value + adjustment.value)

const adjustedProjection = computed(() => {
  const months = monthsToReachTarget({
    presentValue: props.projection.currentFund,
    targetValue: props.projection.targetAmount,
    monthlyContribution: adjustedContribution.value,
    // The growth rate is no longer a field on the scenario — it's the
    // balance-weighted rate already resolved onto the projection result
    // (see projectScenario in utils/projections.js), so this stays
    // consistent with whatever rate produced projection.monthsToGoal.
    annualReturnPercent: props.projection.annualReturnPercent || 0,
  })
  return {
    months,
    date: months != null ? addMonths(new Date(), months) : null,
  }
})

const monthsDelta = computed(() => {
  if (adjustedProjection.value.months == null || props.projection.monthsToGoal == null) return null
  return adjustedProjection.value.months - props.projection.monthsToGoal
})
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200 p-5 flex flex-col gap-4">
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="font-display text-lg font-semibold">{{ scenario.name }}</h3>
          <span class="badge badge-ghost badge-sm">{{ badgeLabel }}</span>
        </div>
        <p class="text-xs text-base-content/60">{{ subtitle }}</p>
      </div>
      <div class="flex gap-1">
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('edit', scenario)">Edit</button>
        <button type="button" class="btn btn-ghost btn-xs text-error" @click="$emit('delete', scenario.id)">
          Delete
        </button>
      </div>
    </div>

    <div>
      <div class="flex justify-between text-xs text-base-content/60 mb-1">
        <span>Progress</span>
        <span>{{ formatPercent(projection.progressPercent) }}</span>
      </div>
      <progress class="progress progress-primary w-full" :value="projection.progressPercent" max="100"></progress>
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p class="text-xs text-base-content/60">Target needed</p>
        <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(projection.targetAmount) }}</p>
      </div>
      <div>
        <p class="text-xs text-base-content/60">Still needed</p>
        <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(projection.remaining) }}</p>
      </div>

      <template v-if="scenario.targetDate">
        <div class="col-span-2">
          <p class="text-xs text-base-content/60">Required monthly savings</p>
          <p class="font-mono tabular-nums font-semibold text-primary">
            {{ projection.requiredContribution != null ? formatCurrency(projection.requiredContribution) + '/mo' : '—' }}
          </p>
        </div>
      </template>
      <template v-else>
        <div>
          <p class="text-xs text-base-content/60">Monthly contribution used</p>
          <p class="font-mono tabular-nums font-semibold">
            {{ formatCurrency(projection.effectiveMonthlyContribution || 0) }}
          </p>
        </div>
        <div>
          <p class="text-xs text-base-content/60">Projected ready by</p>
          <p class="font-mono tabular-nums font-semibold text-primary">
            {{ projection.projectedDate ? formatMonthYear(projection.projectedDate) : '—' }}
          </p>
        </div>
      </template>
    </div>

    <div v-if="adjustable" class="border-t border-base-300 pt-3">
      <div class="flex justify-between items-baseline mb-1">
        <label class="text-xs text-base-content/60">What if I cut spending?</label>
        <span class="text-xs font-mono tabular-nums" :class="adjustment < 0 ? 'text-error' : adjustment > 0 ? 'text-success' : 'text-base-content/60'">
          {{ adjustment > 0 ? '+' : '' }}{{ formatCurrency(adjustment) }}/mo
        </span>
      </div>
      <input
        type="range"
        class="range range-xs range-primary"
        :min="-sliderRange"
        :max="sliderRange"
        step="25"
        v-model.number="adjustment"
      />
      <div class="flex justify-between text-sm mt-2">
        <div>
          <p class="text-xs text-base-content/60">New contribution</p>
          <p class="font-mono tabular-nums font-semibold">{{ formatCurrency(adjustedContribution) }}/mo</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-base-content/60">Projected ready by</p>
          <p class="font-mono tabular-nums font-semibold text-primary">
            {{ adjustedProjection.date ? formatMonthYear(adjustedProjection.date) : '—' }}
            <span v-if="monthsDelta" class="text-xs font-normal" :class="monthsDelta > 0 ? 'text-error' : 'text-success'">
              ({{ monthsDelta > 0 ? '+' : '' }}{{ monthsDelta }}mo)
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>