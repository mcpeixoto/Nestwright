import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
// The bundle is CJS, so the directory of main.cjs is __dirname.
// import.meta.url is empty in that format.
declare const __dirname: string

const here = __dirname

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#171a1f',
    title: 'Nestwright',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const devUrl = process.env.NESTWRIGHT_DEV_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(path.join(here, '../dist/index.html'))
  return win
}

function registerIpc() {
  ipcMain.handle('nestwright:open-file', async (_event, accept: string) => {
    const wantJson = String(accept).includes('json') && !String(accept).includes('nest')
    const result = await dialog.showOpenDialog({
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'Nestwright', extensions: wantJson ? ['json'] : ['nest', 'json'] }],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const data = await fs.readFile(filePath, 'utf8')
    return { name: path.basename(filePath), data }
  })

  ipcMain.handle('nestwright:save-file', async (_event, name: string, data: string) => {
    const ext = name.includes('.') ? (name.split('.').pop() ?? 'nest') : 'nest'
    const labels: Record<string, string> = {
      json: 'JSON',
      nest: 'Nestwright',
      png: 'PNG',
      pdf: 'PDF',
      webm: 'WebM',
      glb: 'GLB',
    }
    const result = await dialog.showSaveDialog({
      title: ext === 'nest' || ext === 'json' ? 'Save project' : 'Export',
      defaultPath: name,
      filters: [{ name: labels[ext] ?? 'File', extensions: [ext] }],
    })
    if (result.canceled || !result.filePath) return false
    if (data.startsWith('data:')) {
      const comma = data.indexOf(',')
      const payload = comma >= 0 ? data.slice(comma + 1) : ''
      await fs.writeFile(result.filePath, Buffer.from(payload, 'base64'))
    } else {
      await fs.writeFile(result.filePath, data, 'utf8')
    }
    return true
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    const template: Electron.MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
