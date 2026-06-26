import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { path: '/entry', name: 'entry', component: () => import('../views/DataEntryView.vue') },
  { path: '/accounts', name: 'accounts', component: () => import('../views/AccountsView.vue') },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue') },
  { path: '/cards', name: 'cards', component: () => import('../views/CreditCardsView.vue') },
  { path: '/goals', name: 'goals', component: () => import('../views/GoalsView.vue') },
  { path: '/affordability', name: 'affordability', component: () => import('../views/AffordabilityView.vue') },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})