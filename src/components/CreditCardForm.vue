<script setup>
import { ref, watch } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'

const props = defineProps({
  initial: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'cancel'])

const cards = useCreditCardStore()

function blank() {
  return { id: null, name: '', targetBudget: null, creditLimit: null, statementDueDay: null }
}

const form = ref(props.initial ? { ...props.initial } : blank())

watch(
  () => props.initial,
  (val) => {
    form.value = val ? { ...val } : blank()
  }
)

async function save() {
  await cards.saveCard(form.value)
  emit('saved')
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div>
      <label class="label-text font-medium text-sm">Card name</label>
      <input
        type="text"
        class="input input-bordered input-sm w-full"
        v-model="form.name"
        placeholder="e.g. Chase Sapphire, Amex Blue"
        required
      />
    </div>
    <div>
      <label class="label-text font-medium text-sm">Monthly budget target (optional)</label>
      <input
        type="number"
        class="input input-bordered input-sm w-full"
        v-model.number="form.targetBudget"
        min="0"
        placeholder="Leave blank to skip over/under tracking"
      />
    </div>
    <div>
      <label class="label-text font-medium text-sm">Credit limit (optional)</label>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-base-content/40 text-sm">$</span>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="form.creditLimit"
          min="0"
          placeholder="e.g. 10000"
        />
      </div>
      <p class="text-xs text-base-content/45 mt-1">
        Used to show utilization % alongside your spending — helpful for credit health monitoring.
      </p>
    </div>
    <div>
      <label class="label-text font-medium text-sm">Statement due day (optional)</label>
      <div class="flex items-center gap-2 mt-1">
        <input
          type="number"
          class="input input-bordered input-sm w-24"
          v-model.number="form.statementDueDay"
          min="1"
          max="31"
          placeholder="e.g. 25"
        />
        <span class="text-xs text-base-content/50">of each month</span>
      </div>
      <p class="text-xs text-base-content/45 mt-1">
        When the payment hits your checking account — used to pin this card's payment
        to the right day on the cash flow timeline.
      </p>
    </div>
    <div class="flex gap-2 pt-2">
      <button type="submit" class="btn btn-primary btn-sm">Save card</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>