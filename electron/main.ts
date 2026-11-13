import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { coopSend, coopUsername, setCoopSink, startCoopHost, stopCoopHost } from './coop/server'
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
  // `--capture=<file.png>`: render, save a PNG of the window and quit. Lets a release be
  // checked from a script even when the Mac's screen is locked.
  const capture = process.argv.find((a) => a.startsWith('--capture='))?.slice('--capture='.length)
  if (capture) {
    win.webContents.on('console-message', (details) => {
      if (details.level === 'error') console.error(`[renderer] ${details.message}`)
    })
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void win.webContents
          .capturePage()
          .then((image) => fs.writeFile(capture, image.toPNG()))
          .catch((err: unknown) => console.error('capture failed', err))
          .finally(() => app.quit())
      }, 4000)
    })
  }
  return win
}

function registerIpc() {
  ipcMain.handle('nestwright:quit', () => {
    app.quit()
  })

  ipcMain.handle('nestwright:open-file', async (_event, accept: string) => {
    const acceptText = String(accept)
    const model = /glb|gltf|\bobj\b/i.test(acceptText)
    const wantJson = acceptText.includes('json') && !acceptText.includes('nest')
    const result = await dialog.showOpenDialog({
      title: model ? 'Import model' : 'Open project',
      properties: ['openFile'],
      filters: [
        model
          ? { name: '3D model', extensions: ['glb', 'gltf', 'obj'] }
          : { name: 'Nestwright', extensions: wantJson ? ['json'] : ['nest', 'json'] },
      ],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    if (model) {
      const bytes = await fs.readFile(filePath)
      return { name: path.basename(filePath), data: bytes.toString('base64') }
    }
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

  ipcMain.handle('nestwright:username', () => coopUsername())

  ipcMain.handle('nestwright:host-session', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    setCoopSink({
      message(peerId, raw) {
        if (!win || win.isDestroyed()) return
        win.webContents.send('nestwright:coop-message', { peerId, raw })
      },
      closed(peerId) {
        if (!win || win.isDestroyed()) return
        win.webContents.send('nestwright:coop-closed', { peerId })
      },
    })
    return startCoopHost()
  })

  ipcMain.handle('nestwright:leave-session', () => {
    stopCoopHost()
  })

  ipcMain.on('nestwright:coop-send', (_event, peerId: unknown, raw: unknown) => {
    coopSend(typeof peerId === 'string' ? peerId : null, typeof raw === 'string' ? raw : '')
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

  app.on('before-quit', () => {
    stopCoopHost()
  })
}
