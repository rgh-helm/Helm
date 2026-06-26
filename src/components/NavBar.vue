<script setup>
import { useRoute } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'

const route = useRoute()
const settings = useSettingsStore()
const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/entry', label: 'Monthly Entry' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/history', label: 'History' },
  { to: '/cards', label: 'Credit Cards' },
  { to: '/goals', label: 'Goals' },
  { to: '/affordability', label: 'Affordability' },
  { to: '/settings', label: 'Settings' },
]

function toggleTheme() {
  settings.setTheme(settings.theme === 'helm-dark' ? 'helm' : 'helm-dark')
}
</script>

<template>
  <div class="navbar bg-base-100 border-b border-base-300 px-4 lg:px-8">
    <div class="flex-1">
      <span class="font-display text-xl font-semibold tracking-tight text-primary">Helm</span>
    </div>
    <div class="flex-none flex items-center gap-1">
      <ul class="menu menu-horizontal gap-1 text-sm">
        <li v-for="link in links" :key="link.to">
          <RouterLink
            :to="link.to"
            class="rounded-md"
            active-class="menu-active"
            :class="{ 'bg-primary text-primary-content': route.path === link.to }"
          >
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :title="settings.theme === 'helm-dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        {{ settings.theme === 'helm-dark' ? 'Light' : 'Dark' }}
      </button>
    </div>
  </div>
</template>