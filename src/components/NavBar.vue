<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { Grid, Edit, Wallet, History, CreditCard, Flag, Home, Cog } from '@boxicons/vue'

const route = useRoute()
const settings = useSettingsStore()
const links = [
  { to: '/', label: 'Dashboard', icon: Grid },
  { to: '/entry', label: 'Monthly Entry', icon: Edit },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/history', label: 'History', icon: History },
  { to: '/cards', label: 'Credit Cards', icon: CreditCard },
  { to: '/goals', label: 'Goals', icon: Flag },
  { to: '/affordability', label: 'Affordability', icon: Home },
  { to: '/settings', label: 'Settings', icon: Cog },
]

const mobileOpen = ref(false)
watch(() => route.path, () => { mobileOpen.value = false })

function toggleTheme() {
  settings.setTheme(settings.theme === 'helm-dark' ? 'helm' : 'helm-dark')
}
</script>

<style scoped>
/* @boxicons/vue renders its own <svg> as a child of .nav-icon, which scoped
   styles can't reach without :deep() — plain scoping only tags elements this
   component's own template renders, not what a child component outputs.
   !important sidesteps whatever specificity daisyUI's `.menu svg` rule (or
   anything else in the global stylesheet) happens to carry. */
.nav-icon {
  width: 20px;
  height: 20px;
}
.nav-icon :deep(svg) {
  width: 20px !important;
  height: 20px !important;
}
</style>

<template>
  <div class="navbar bg-base-100 border-b border-base-300 px-3 sm:px-4 lg:px-8 relative z-20 overflow-visible">
    <div class="flex-1">
      <div class="font-display font-semibold tracking-tight text-base-content flex flex-row items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="size-7 stroke-secondary fill-base-content shrink-0" viewBox="0 0 24 24">
          <!--Boxicons v3.0.8 https://boxicons.com | License  https://docs.boxicons.com/free-->
          <path
            d="M18.36 13.36c-.4.4-.83.75-1.29 1.07l-2.63-5.7c.35-.49.56-1.09.56-1.73 0-1.3-.84-2.4-2-2.82V2h-2v2.18C9.84 4.59 9 5.69 9 7c0 .65.21 1.24.56 1.73l-2.63 5.7c-.46-.31-.89-.67-1.29-1.07l-.71-.71-1.41 1.41.71.71c.57.57 1.19 1.06 1.86 1.49l-2.22 4.81 1.82.84 2.18-4.73c1.32.53 2.71.81 4.14.81s2.82-.27 4.14-.81c1.37-.55 2.59-1.37 3.64-2.42l.71-.71-1.41-1.41-.71.71ZM12 6c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m-3.3 9.37 2.53-5.48c.25.07.5.11.77.11s.52-.05.77-.11l2.53 5.48c-2.11.83-4.49.83-6.6 0m8.28 3.64 1.34 2.91 1.82-.84-1.38-2.99c-.57.35-1.16.66-1.78.92">
          </path>
        </svg>
        <span class="ml-2 text-xl sm:text-2xl">
          Helm
        </span>
      </div>
    </div>

    <!-- Desktop nav: full icon+label menu, only once there's room for all 8 items -->
    <div class="hidden min-[1360px]:flex flex-none items-center gap-1">
      <ul class="menu menu-horizontal gap-1 text-sm">
        <li v-for="link in links" :key="link.to">
          <RouterLink :to="link.to" class="rounded-md flex items-center gap-1.5" active-class="menu-active"
            :class="{ 'bg-primary text-primary-content': route.path === link.to }">
            <component :is="link.icon" size="12" />
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>
      <button type="button" class="btn btn-ghost btn-sm"
        :title="settings.theme === 'helm-dark' ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        {{ settings.theme === 'helm-dark' ? 'Light' : 'Dark' }}
      </button>
    </div>

    <!-- Icon-only nav: the intermediate tier — labels no longer fit, but there's -->
    <!-- still enough width to avoid collapsing all the way to a hamburger menu. -->
    <!-- Tooltips (daisyUI) stand in for the missing labels. -->
    <div class="hidden min-[720px]:flex min-[1360px]:hidden flex-none items-center gap-1">
      <ul class="menu menu-horizontal gap-1">
        <li v-for="link in links" :key="link.to" class="tooltip tooltip-bottom" :data-tip="link.label">
          <RouterLink :to="link.to" class="rounded-md w-9 h-9 flex items-center justify-center" active-class="menu-active"
            :class="{ 'bg-primary text-primary-content': route.path === link.to }">
            <span class="nav-icon inline-flex items-center justify-center">
              <component :is="link.icon" />
            </span>
          </RouterLink>
        </li>
      </ul>
      <button type="button" class="btn btn-ghost btn-sm btn-square"
        :title="settings.theme === 'helm-dark' ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        <svg v-if="settings.theme === 'helm-dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
      </button>
    </div>

    <!-- Mobile: theme toggle + hamburger, only once there's no room even for icons -->
    <div class="flex min-[720px]:hidden flex-none items-center gap-1">
      <button type="button" class="btn btn-ghost btn-sm btn-square"
        :title="settings.theme === 'helm-dark' ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        <svg v-if="settings.theme === 'helm-dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label="Toggle navigation menu"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = !mobileOpen"
      >
        <svg v-if="!mobileOpen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Mobile dropdown panel -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <ul
        v-if="mobileOpen"
        class="min-[720px]:hidden menu absolute left-0 right-0 top-full mx-2 mt-1 p-2 bg-base-100 border border-base-300 rounded-box shadow-xl text-sm z-30"
      >
        <li v-for="link in links" :key="link.to">
          <RouterLink :to="link.to" class="rounded-md py-2.5 flex items-center gap-1.5" active-class="menu-active"
            :class="{ 'bg-primary text-primary-content': route.path === link.to }">
            <component :is="link.icon" size="12" />
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>
    </Transition>

    <!-- Tap-out backdrop for the mobile menu -->
    <div v-if="mobileOpen" class="min-[720px]:hidden fixed inset-0 z-10" style="top: 0;" @click="mobileOpen = false"></div>
  </div>
</template>