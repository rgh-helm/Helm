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
      <div class="font-display font-semibold tracking-tight text-base-content flex flex-row">
        <svg xmlns="http://www.w3.org/2000/svg" class="size-7 stroke-secondary fill-base-content" viewBox="0 0 24 24">
          <!--Boxicons v3.0.8 https://boxicons.com | License  https://docs.boxicons.com/free-->
          <path
            d="M18.36 13.36c-.4.4-.83.75-1.29 1.07l-2.63-5.7c.35-.49.56-1.09.56-1.73 0-1.3-.84-2.4-2-2.82V2h-2v2.18C9.84 4.59 9 5.69 9 7c0 .65.21 1.24.56 1.73l-2.63 5.7c-.46-.31-.89-.67-1.29-1.07l-.71-.71-1.41 1.41.71.71c.57.57 1.19 1.06 1.86 1.49l-2.22 4.81 1.82.84 2.18-4.73c1.32.53 2.71.81 4.14.81s2.82-.27 4.14-.81c1.37-.55 2.59-1.37 3.64-2.42l.71-.71-1.41-1.41-.71.71ZM12 6c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m-3.3 9.37 2.53-5.48c.25.07.5.11.77.11s.52-.05.77-.11l2.53 5.48c-2.11.83-4.49.83-6.6 0m8.28 3.64 1.34 2.91 1.82-.84-1.38-2.99c-.57.35-1.16.66-1.78.92">
          </path>
        </svg>
        <span class="ml-2 text-2xl">
          Helm
        </span>
      </div>
    </div>
    <div class="flex-none flex items-center gap-1">
      <ul class="menu menu-horizontal gap-1 text-sm">
        <li v-for="link in links" :key="link.to">
          <RouterLink :to="link.to" class="rounded-md" active-class="menu-active"
            :class="{ 'bg-primary text-primary-content': route.path === link.to }">
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>
      <button type="button" class="btn btn-ghost btn-sm"
        :title="settings.theme === 'helm-dark' ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        {{ settings.theme === 'helm-dark' ? 'Light' : 'Dark' }}
      </button>
    </div>
  </div>
</template>