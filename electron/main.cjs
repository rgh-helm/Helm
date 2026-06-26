const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store.cjs')
const csvImport = require('./csvImport.cjs')

// Locks the userData folder name (and therefore ~/.config/<name> on
// Linux) to a stable, predictable value regardless of how the packaged
// app's display name (productName) is capitalized in electron-builder.
app.setName('Helm')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#f4f1ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!app.isPackaged) {
    // Dev mode: point at the Vite dev server (started separately via
    // `npm run electron:dev`) for hot reload.
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')

    // fs is asar-aware (Electron patches it to read transparently inside
    // app.asar), so this check is meaningful even when packaged. If this
    // logs false, the build's dist/ output wasn't actually included in the
    // package — rebuild with `npm run build` before re-running
    // electron-builder, rather than packaging a stale/missing dist/.
    console.log(`[main] packaged index.html exists: ${fs.existsSync(indexPath)} (${indexPath})`)

    mainWindow.loadFile(indexPath)

    // loadFile() failures (e.g. file not found, blocked) don't throw —
    // they fire this event instead, and Chromium silently swaps in its own
    // chrome-error://chromewebdata page, which is what produces the vague
    // "Not allowed to load local resource" message in the console. This
    // logs the actual underlying reason.
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[main] did-fail-load: ${errorDescription} (${errorCode}) — ${validatedURL}`)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// -----------------------------------------------------------------------
// IPC: all data access happens here in the main process. The renderer
// never touches the filesystem directly — it only calls window.api.*
// (exposed via preload.cjs), which round-trips through these handlers.
// -----------------------------------------------------------------------

ipcMain.handle('snapshots:list', () => store.listSnapshots())
ipcMain.handle('snapshots:save', (_event, snapshot) => store.saveSnapshot(snapshot))
ipcMain.handle('snapshots:delete', (_event, id) => store.deleteSnapshot(id))

ipcMain.handle('scenarios:list', () => store.listScenarios())
ipcMain.handle('scenarios:save', (_event, scenario) => store.saveScenario(scenario))
ipcMain.handle('scenarios:delete', (_event, id) => store.deleteScenario(id))

ipcMain.handle('cards:list', () => store.listCards())
ipcMain.handle('cards:save', (_event, card) => store.saveCard(card))
ipcMain.handle('cards:delete', (_event, id) => store.deleteCard(id))

ipcMain.handle('balances:list', () => store.listBalances())
ipcMain.handle('balances:save', (_event, balance) => store.saveBalance(balance))
ipcMain.handle('balances:delete', (_event, id) => store.deleteBalance(id))

ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:save', (_event, settings) => store.saveSettings(settings))

ipcMain.handle('categories:list', () => store.listCategories())
ipcMain.handle('categories:save', (_event, category) => store.saveCategory(category))
ipcMain.handle('categories:delete', (_event, id) => store.deleteCategory(id))

ipcMain.handle('accounts:list', () => store.listAccounts())
ipcMain.handle('accounts:save', (_event, account) => store.saveAccount(account))
ipcMain.handle('accounts:delete', (_event, id) => store.deleteAccount(id))

ipcMain.handle('accountBalances:list', () => store.listAccountBalances())
ipcMain.handle('accountBalances:save', (_event, balance) => store.saveAccountBalance(balance))
ipcMain.handle('accountBalances:delete', (_event, id) => store.deleteAccountBalance(id))

ipcMain.handle('forecastItems:list', () => store.listForecastItems())
ipcMain.handle('forecastItems:save', (_event, item) => store.saveForecastItem(item))
ipcMain.handle('forecastItems:delete', (_event, id) => store.deleteForecastItem(id))

ipcMain.handle('incomeOptions:list', () => store.listIncomeOptions())
ipcMain.handle('incomeOptions:save', (_event, option) => store.saveIncomeOption(option))
ipcMain.handle('incomeOptions:delete', (_event, id) => store.deleteIncomeOption(id))

ipcMain.handle('data:getStoragePath', () => store.getDataPath())
ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('csv:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import statement CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (canceled || !filePaths?.length) return { canceled: true }

  try {
    const text = fs.readFileSync(filePaths[0], 'utf-8')
    const result = csvImport.parseCardCsv(text)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('data:exportBackup', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export backup',
    defaultPath: `house-savings-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { canceled: true }

  try {
    const payload = store.getBackupPayload()
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('data:importBackup', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePaths?.length) return { canceled: true }

  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8')
    const payload = JSON.parse(raw)
    store.restoreFromPayload(payload)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})