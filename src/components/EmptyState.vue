<script setup>
defineProps({
  emoji:   { type: String,  default: '✦' },
  title:   { type: String,  required: true },
  message: { type: String,  default: '' },
  // Optional CTA
  actionLabel: { type: String,  default: '' },
  actionTo:    { type: String,  default: '' },
  // Visual weight: 'default' (padded card feel) or 'inline' (compact, no border)
  variant: { type: String, default: 'default' },
})
</script>

<template>
  <div
    class="flex flex-col items-center text-center"
    :class="variant === 'default'
      ? 'rounded-xl border border-dashed border-base-300 bg-base-200 px-8 py-12 gap-3'
      : 'px-4 py-8 gap-2'"
  >
    <div class="text-3xl select-none leading-none">{{ emoji }}</div>
    <p class="font-display font-semibold text-base-content/80">{{ title }}</p>
    <p v-if="message" class="text-sm text-base-content/50 leading-relaxed max-w-sm">{{ message }}</p>
    <RouterLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="btn btn-primary btn-sm mt-1"
    >{{ actionLabel }}</RouterLink>
    <slot />
  </div>
</template>