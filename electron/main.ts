import { app, BrowserWindow, Menu, dialog, ipcMain, screen } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { coopSend, coopUsername, setCoopSink, startCoopHost, stopCoopHost } from './coop/server'
import { handleContentScheme, registerContentScheme } from './contentProtocol'
import { crashFileName, formatCrash, sanitizeCrash } from './crashLog'
import {
  safeAchievementId,
  safeKeyboardRequest,
  safeOverlayUrl,
  safePresence,
  safeStatName,
  startSteam,
  toKeyboardRect,
  type SteamRuntime,
} from './steam'
import { fitWindow, parseWindowState, type WindowBounds } from './windowState'
// The bundle is CJS, so the directory of main.cjs is __dirname.
// import.meta.url is empty in that format.
declare const __dirname: string

const here = __dirname

app.setName('Nestwright')
registerContentScheme()

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState(): WindowBounds | null {
  try {
    return parseWindowState(JSON.parse(fsSync.readFileSync(windowStatePath(), 'utf8')))
  } catch {
    return null
  }
}

function writeWindowState(state: WindowBounds): void {
  try {
    fsSync.mkdirSync(path.dirname(windowStatePath()), { recursive: true })
    fsSync.writeFileSync(windowStatePath(), JSON.stringify(state))
  } catch (err) {
    console.error('Could not save window state', err)
  }
}

function attachWindowState(win: BrowserWindow, seed: WindowBounds): void {
  let normal = seed
  let timer: ReturnType<typeof setTimeout> | undefined
  const snapshot = () => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    if (!maximized && !win.isMinimized()) {
      const bounds = win.getBounds()
      normal = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: false }
    } else {
      normal = { ...normal, maximized }
    }
  }
  const schedule = () => {
    snapshot()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => writeWindowState(normal), 300)
  }
  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    snapshot()
    writeWindowState(normal)
  })
}

function createWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const saved = readWindowState()
  const fitted = saved ? fitWindow(saved, area) : null
  const win = new BrowserWindow({
    ...(fitted ? { x: fitted.x, y: fitted.y, width: fitted.width, height: fitted.height } : { width: 1600, height: 1000 }),
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
  const created = win.getBounds()
  attachWindowState(win, {
    x: created.x,
    y: created.y,
    width: created.width,
    height: created.height,
    maximized: false,
  })
  if (fitted?.maximized) win.maximize()
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

function showAbout(): void {
  void dialog.showMessageBox({
    type: 'info',
    title: 'About Nestwright',
    message: 'Nestwright',
    detail: `Version ${app.getVersion()}`,
  })
}

function installMenu(): void {
  const about: Electron.MenuItemConstructorOptions = { label: 'About Nestwright', click: () => showAbout() }
  const help: Electron.MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [
      {
        label: 'Achievements',
        click: () => {
          const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          win?.webContents.send('nestwright:show-achievements')
        },
      },
      ...(process.platform === 'darwin' ? [] : [about]),
    ],
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Nestwright',
            submenu: [
              about,
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    help,
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(steam: SteamRuntime) {
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

  ipcMain.handle('nestwright:steam-available', () => steam.available && !steam.restarting)
  ipcMain.handle('nestwright:steam-player', () => (steam.available ? steam.playerName : ''))
  ipcMain.handle('nestwright:steam-unlock', (_event, id: unknown) => {
    const clean = safeAchievementId(id)
    if (!clean || !steam.available) return false
    return steam.unlock(clean)
  })
  ipcMain.handle('nestwright:steam-overlay', (_event, url: unknown) => {
    const clean = safeOverlayUrl(url)
    if (!clean || !steam.available) return false
    try {
      steam.overlay(clean)
      return true
    } catch (err) {
      console.error('Steam overlay failed', err)
      return false
    }
  })
  ipcMain.handle('nestwright:steam-stat-get', (_event, name: unknown) => {
    const clean = safeStatName(name)
    if (!clean || !steam.available) return null
    return steam.getStat(clean)
  })
  ipcMain.handle('nestwright:steam-stat-set', (_event, name: unknown, value: unknown) => {
    const clean = safeStatName(name)
    if (!clean || !steam.available || typeof value !== 'number') return false
    return steam.setStat(clean, value)
  })
  ipcMain.handle('nestwright:steam-presence', (_event, status: unknown) => {
    if (!steam.available) return false
    if (status === null) return steam.setPresence(null)
    if (typeof status !== 'string') return false
    return steam.setPresence(safePresence(status))
  })
  ipcMain.handle('nestwright:steam-keyboard', (event, req: unknown) => {
    const clean = safeKeyboardRequest(req)
    if (!clean || !steam.available) return false
    // The rect is in CSS pixels inside the page; Steam wants pixels relative to the
    // game window, so only the page zoom applies. The display scaleFactor does not:
    // the Deck's gamescope session runs the window fullscreen at scale 1.
    const rect = toKeyboardRect(clean, event.sender.getZoomFactor())
    const mode = (['single', 'multi', 'email', 'numeric'] as const)[clean.mode]
    if (!mode) return false
    return steam.showKeyboard({ mode, x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })
  ipcMain.handle('nestwright:steam-deck', () => steam.isSteamDeck)

  ipcMain.handle('nestwright:crash', async (_event, payload: unknown) => {
    const entry = sanitizeCrash(payload)
    if (!entry) return false
    try {
      const dir = path.join(app.getPath('userData'), 'logs')
      await fs.mkdir(dir, { recursive: true })
      const body = formatCrash({ ...entry, at: new Date().toISOString() })
      await fs.writeFile(path.join(dir, crashFileName(new Date())), body, 'utf8')
      return true
    } catch (err) {
      console.error('Could not write crash log', err)
      return false
    }
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

  // Overlay Chromium switches only take effect before app.whenReady().
  const steam = startSteam({ packaged: app.isPackaged })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopCoopHost()
    steam.flush()
  })

  if (steam.restarting) {
    app.quit()
  } else {
    app.whenReady().then(() => {
      installMenu()
      handleContentScheme()
      registerIpc(steam)
      createWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
  }
}
