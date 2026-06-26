const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  snapshots: {
    list: () => ipcRenderer.invoke('snapshots:list'),
    save: (snapshot) => ipcRenderer.invoke('snapshots:save', snapshot),
    delete: (id) => ipcRenderer.invoke('snapshots:delete', id),
  },
  scenarios: {
    list: () => ipcRenderer.invoke('scenarios:list'),
    save: (scenario) => ipcRenderer.invoke('scenarios:save', scenario),
    delete: (id) => ipcRenderer.invoke('scenarios:delete', id),
  },
  cards: {
    list: () => ipcRenderer.invoke('cards:list'),
    save: (card) => ipcRenderer.invoke('cards:save', card),
    delete: (id) => ipcRenderer.invoke('cards:delete', id),
  },
  balances: {
    list: () => ipcRenderer.invoke('balances:list'),
    save: (balance) => ipcRenderer.invoke('balances:save', balance),
    delete: (id) => ipcRenderer.invoke('balances:delete', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    save: (category) => ipcRenderer.invoke('categories:save', category),
    delete: (id) => ipcRenderer.invoke('categories:delete', id),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    save: (account) => ipcRenderer.invoke('accounts:save', account),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
  },
  accountBalances: {
    list: () => ipcRenderer.invoke('accountBalances:list'),
    save: (balance) => ipcRenderer.invoke('accountBalances:save', balance),
    delete: (id) => ipcRenderer.invoke('accountBalances:delete', id),
  },
  forecastItems: {
    list: () => ipcRenderer.invoke('forecastItems:list'),
    save: (item) => ipcRenderer.invoke('forecastItems:save', item),
    delete: (id) => ipcRenderer.invoke('forecastItems:delete', id),
  },
  incomeOptions: {
    list: () => ipcRenderer.invoke('incomeOptions:list'),
    save: (option) => ipcRenderer.invoke('incomeOptions:save', option),
    delete: (id) => ipcRenderer.invoke('incomeOptions:delete', id),
  },
  csv: {
    import: () => ipcRenderer.invoke('csv:import'),
  },
  backup: {
    export: () => ipcRenderer.invoke('data:exportBackup'),
    import: () => ipcRenderer.invoke('data:importBackup'),
  },
  getStoragePath: () => ipcRenderer.invoke('data:getStoragePath'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
})