import { app, BrowserWindow, Menu, dialog, ipcMain, screen, type IpcMainEvent } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { coopSend, coopUsername, setCoopSink, startCoopHost, stopCoopHost } from './coop/server'
import { handleContentScheme, registerContentScheme } from './contentProtocol'
import { crashFileName, formatCrash, sanitizeCrash } from './crashLog'
import { RENDERER_PROBE, SMOKE_TIMEOUT_MS, judgeSmoke, smokeDir, type RendererProbe, type SmokeReport } from './smoke'
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
import {
  decodeThumb,
  hasAutosaveFile,
  hasRecentIndex,
  isRecentIndexCorrupt,
  isAllowedSaveTarget,
  readAutosave,
  readRecentIndex,
  readRecentProject,
  readRecentThumb,
  saveRecentEntry,
  writeAutosave,
  type RecentRecord,
} from './saves'
import { fitWindow, parseWindowState, type WindowBounds } from './windowState'
// The bundle is CJS, so the directory of main.cjs is __dirname.
// import.meta.url is empty in that format.
declare const __dirname: string

const here = __dirname

app.setName('Nestwright')
registerContentScheme()

const smoke = smokeDir(process.argv)
// A smoke run loads a template; keep it out of the player's real autosave and settings.
if (smoke) app.setPath('userData', path.resolve(smoke, 'userdata'))

const allowedPaths = new Set<string>()
const pendingOpens: string[] = []
const openedAt = new Map<string, number>()
let rendererReady = false
let mainWindow: BrowserWindow | null = null
let dirty = false
let skipPrompt = false
let prompting = false

interface ClosePrompt {
  message: string
  save: string
  dontSave: string
  cancel: string
}

interface MenuLabels {
  file: string
  new: string
  open: string
  save: string
  saveAs: string
  close: string
}

let closePrompt: ClosePrompt = {
  message: 'Save changes before closing?',
  save: 'Save',
  dontSave: "Don't save",
  cancel: 'Cancel',
}

let menuLabels: MenuLabels = {
  file: 'File',
  new: 'New',
  open: 'Open…',
  save: 'Save',
  saveAs: 'Save As…',
  close: 'Close Window',
}

function savesDir(): string {
  return path.join(app.getPath('userData'), 'saves')
}

function allowPath(filePath: string | null | undefined): void {
  if (!filePath || !path.isAbsolute(filePath)) return
  allowedPaths.add(path.resolve(filePath))
}

function seedAllowedFromRecent(): void {
  try {
    for (const record of readRecentIndex(savesDir())) allowPath(record.path)
  } catch {
    /* a missing index is a first launch */
  }
}

function canSaveTo(filePath: string): boolean {
  let recent: string[]
  try {
    recent = readRecentIndex(savesDir())
      .map((record) => record.path)
      .filter((item): item is string => typeof item === 'string')
  } catch {
    recent = []
  }
  return isAllowedSaveTarget(filePath, [...allowedPaths], recent)
}

function nestPathsFromArgv(argv: readonly string[]): string[] {
  const out: string[] = []
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue
    if (!arg.toLowerCase().endsWith('.nest')) continue
    out.push(path.resolve(arg))
  }
  return out
}

function enqueueOpen(filePath: string): void {
  if (!filePath.toLowerCase().endsWith('.nest')) return
  const resolved = path.resolve(filePath)
  const last = openedAt.get(resolved)
  if (last && Date.now() - last < 2000) return
  if (!pendingOpens.includes(resolved)) pendingOpens.push(resolved)
  void flushOpens()
}

async function flushOpens(): Promise<void> {
  const win = mainWindow
  if (!rendererReady || !win || win.isDestroyed()) return
  const batch = pendingOpens.splice(0, pendingOpens.length)
  for (const filePath of batch) {
    try {
      const data = await fs.readFile(filePath, 'utf8')
      allowPath(filePath)
      if (win.isDestroyed()) return
      win.webContents.send('nestwright:open-path', {
        name: path.basename(filePath),
        data,
        path: filePath,
      })
      openedAt.set(filePath, Date.now())
    } catch (err) {
      console.error('Could not open project', filePath, err)
    }
  }
}

function currentWindow(): BrowserWindow | null {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return null
  return win
}

function sendMenu(action: 'new' | 'open' | 'save' | 'save-as'): void {
  const win = currentWindow()
  if (!win) return
  win.webContents.send('nestwright:menu', action)
}

function askRendererToSave(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      ipcMain.removeListener('nestwright:save-result', onResult)
      resolve(ok)
    }
    const onResult = (event: IpcMainEvent, ok: unknown) => {
      if (event.sender !== win.webContents) return
      finish(ok === true)
    }
    ipcMain.on('nestwright:save-result', onResult)
    win.once('closed', () => finish(false))
    if (win.isDestroyed()) {
      finish(false)
      return
    }
    win.webContents.send('nestwright:request-save')
  })
}

async function confirmDiscard(): Promise<'save' | 'discard' | 'cancel'> {
  const win = currentWindow()
  if (!win) return 'discard'
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: closePrompt.message,
    buttons: [closePrompt.save, closePrompt.dontSave, closePrompt.cancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: 'Nestwright',
  })
  if (response === 0) return 'save'
  if (response === 1) return 'discard'
  return 'cancel'
}

async function finishClose(quitApp: boolean): Promise<void> {
  if (prompting) return
  prompting = true
  try {
    const choice = await confirmDiscard()
    if (choice === 'cancel') return
    if (choice === 'save') {
      const win = currentWindow()
      if (!win) return
      const ok = await askRendererToSave(win)
      if (!ok) return
    }
    dirty = false
    const win = currentWindow()
    if (win && process.platform === 'darwin') win.setDocumentEdited(false)
    skipPrompt = true
    if (quitApp) app.quit()
    else win?.close()
  } finally {
    prompting = false
  }
}

function attachCloseGuard(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (skipPrompt || !dirty) return
    event.preventDefault()
    if (!prompting) void finishClose(false)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    rendererReady = false
    skipPrompt = false
    dirty = false
  })
}

async function writePayload(filePath: string, data: string): Promise<void> {
  if (data.startsWith('data:')) {
    const comma = data.indexOf(',')
    const payload = comma >= 0 ? data.slice(comma + 1) : ''
    await fs.writeFile(filePath, Buffer.from(payload, 'base64'))
    return
  }
  await fs.writeFile(filePath, data, 'utf8')
}

function isPrompt(value: unknown): value is ClosePrompt {
  if (!value || typeof value !== 'object') return false
  const prompt = value as ClosePrompt
  return (
    typeof prompt.message === 'string' &&
    typeof prompt.save === 'string' &&
    typeof prompt.dontSave === 'string' &&
    typeof prompt.cancel === 'string'
  )
}

function isMenu(value: unknown): value is MenuLabels {
  if (!value || typeof value !== 'object') return false
  const menu = value as MenuLabels
  return (
    typeof menu.file === 'string' &&
    typeof menu.new === 'string' &&
    typeof menu.open === 'string' &&
    typeof menu.save === 'string' &&
    typeof menu.saveAs === 'string' &&
    typeof menu.close === 'string'
  )
}

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
  mainWindow = win
  attachCloseGuard(win)
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
  if (smoke) runSmoke(win, path.resolve(smoke))
  return win
}

function runSmoke(win: BrowserWindow, dir: string): void {
  const started = Date.now()
  const log: string[] = []
  win.webContents.on('console-message', (details) => {
    log.push(`[${details.level}] ${details.message}`)
  })
  const finish = async (probe: RendererProbe | null, extra: string[] = []) => {
    const verdict = judgeSmoke(probe)
    const report: SmokeReport = {
      ok: verdict.ok && extra.length === 0,
      reasons: [...verdict.reasons, ...extra],
      platform: process.platform,
      arch: process.arch,
      versions: { electron: process.versions.electron, chrome: process.versions.chrome, app: app.getVersion() },
      gpuFeatureStatus: app.getGPUFeatureStatus(),
      gpuInfo: await app.getGPUInfo('basic').catch((err: unknown) => String(err)),
      renderer: probe,
      elapsedMs: Date.now() - started,
    }
    await fs.mkdir(dir, { recursive: true })
    if (!win.isDestroyed()) {
      await win.webContents
        .capturePage()
        .then((image) => fs.writeFile(path.join(dir, 'smoke.png'), image.toPNG()))
        .catch((err: unknown) => report.reasons.push(`capture failed: ${String(err)}`))
    }
    await fs.writeFile(path.join(dir, 'smoke.json'), JSON.stringify(report, null, 2), 'utf8')
    await fs.writeFile(path.join(dir, 'console.log'), log.join('\n'), 'utf8')
    console.log(`smoke ${report.ok ? 'ok' : 'FAILED'}: ${report.renderer?.perf?.backend ?? 'no backend'} ${report.reasons.join('; ')}`)
    app.exit(report.ok ? 0 : 1)
  }
  const timer = setTimeout(() => void finish(null, [`timed out after ${SMOKE_TIMEOUT_MS} ms`]), SMOKE_TIMEOUT_MS)
  win.webContents.once('did-finish-load', () => {
    win.webContents
      .executeJavaScript(RENDERER_PROBE, true)
      .then((probe: RendererProbe) => {
        clearTimeout(timer)
        return finish(probe)
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        return finish(null, [`probe threw: ${String(err)}`])
      })
  })
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
    {
      label: menuLabels.file,
      submenu: [
        { label: menuLabels.new, accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
        { label: menuLabels.open, accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
        { label: menuLabels.save, accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { label: menuLabels.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: menuLabels.close, accelerator: 'CmdOrCtrl+W', click: () => currentWindow()?.close() },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    help,
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(steam: SteamRuntime) {
  seedAllowedFromRecent()

  ipcMain.on('nestwright:boot', (event) => {
    try {
      const dir = savesDir()
      event.returnValue = {
        autosave: readAutosave(dir),
        hasAutosaveFile: hasAutosaveFile(dir),
        recent: readRecentIndex(dir),
        hasRecentFile: hasRecentIndex(dir),
        recentCorrupt: isRecentIndexCorrupt(dir),
      }
    } catch {
      event.returnValue = { autosave: null, hasAutosaveFile: false, recent: [], hasRecentFile: false, recentCorrupt: false }
    }
  })

  ipcMain.handle('nestwright:write-autosave', (_event, data: unknown) => {
    if (typeof data !== 'string') return false
    try {
      writeAutosave(savesDir(), data)
      return true
    } catch (err) {
      console.error('Could not write autosave', err)
      return false
    }
  })

  ipcMain.handle('nestwright:write-recent', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return false
    const body = payload as Partial<RecentRecord> & { project?: unknown; thumb?: unknown }
    if (typeof body.id !== 'string' || typeof body.project !== 'string') return false
    try {
      const thumb = typeof body.thumb === 'string' ? decodeThumb(body.thumb) : null
      const saved = saveRecentEntry(
        savesDir(),
        {
          id: body.id,
          name: typeof body.name === 'string' ? body.name : 'Untitled',
          updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now(),
          ...(typeof body.path === 'string' ? { path: body.path } : {}),
        },
        body.project,
        thumb,
      )
      for (const record of saved) allowPath(record.path)
      return true
    } catch (err) {
      console.error('Could not write recent project', err)
      return false
    }
  })

  ipcMain.handle('nestwright:read-recent-project', (_event, id: unknown) => {
    if (typeof id !== 'string') return null
    try {
      return readRecentProject(savesDir(), id)
    } catch {
      return null
    }
  })

  ipcMain.handle('nestwright:read-recent-thumb', (_event, id: unknown) => {
    if (typeof id !== 'string') return null
    try {
      return readRecentThumb(savesDir(), id)
    } catch {
      return null
    }
  })

  ipcMain.on('nestwright:editor-state', (event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const body = payload as { dirty?: unknown; prompt?: unknown; menu?: unknown }
    dirty = body.dirty === true
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && process.platform === 'darwin') win.setDocumentEdited(dirty)
    if (isPrompt(body.prompt)) closePrompt = body.prompt
    if (isMenu(body.menu) && JSON.stringify(menuLabels) !== JSON.stringify(body.menu)) {
      menuLabels = body.menu
      installMenu()
    }
  })

  ipcMain.on('nestwright:renderer-ready', () => {
    rendererReady = true
    void flushOpens()
  })

  ipcMain.handle('nestwright:quit', () => {
    app.quit()
  })

  ipcMain.handle('nestwright:open-file', async (_event, accept: string) => {
    const acceptText = String(accept)
    const model = /glb|gltf|\bobj\b/i.test(acceptText)
    const trace = /png|jpe?g|webp|pdf|image\/|application\/pdf/i.test(acceptText)
    const wantJson = acceptText.includes('json') && !acceptText.includes('nest')
    const result = await dialog.showOpenDialog({
      title: trace ? 'Import trace image' : model ? 'Import model' : 'Open project',
      properties: ['openFile'],
      filters: [
        trace
          ? { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }
          : model
            ? { name: '3D model', extensions: ['glb', 'gltf', 'obj'] }
            : { name: 'Nestwright', extensions: wantJson ? ['json'] : ['nest', 'json'] },
      ],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    allowPath(filePath)
    if (model) {
      const bytes = await fs.readFile(filePath)
      return { name: path.basename(filePath), data: bytes.toString('base64'), path: filePath }
    }
    if (trace) {
      const bytes = await fs.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg'
      return { name: path.basename(filePath), data: `data:${mime};base64,${bytes.toString('base64')}`, path: filePath }
    }
    const data = await fs.readFile(filePath, 'utf8')
    return { name: path.basename(filePath), data, path: filePath }
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
    if (result.canceled || !result.filePath) return null
    await writePayload(result.filePath, data)
    allowPath(result.filePath)
    return { path: result.filePath }
  })

  ipcMain.handle('nestwright:save-to-path', async (_event, filePath: unknown, data: unknown) => {
    if (typeof filePath !== 'string' || typeof data !== 'string') return false
    if (!canSaveTo(filePath)) return false
    try {
      await writePayload(filePath, data)
      return true
    } catch (err) {
      console.error('Could not save project', err)
      return false
    }
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

// NESTWRIGHT_USER_DATA=<dir> keeps a test run away from the real saves.
if (process.env.NESTWRIGHT_USER_DATA) app.setPath('userData', path.resolve(process.env.NESTWRIGHT_USER_DATA))

// NESTWRIGHT_MULTI_INSTANCE=1 lets two windows run side by side to test co-op on one Mac.
const gotLock = process.env.NESTWRIGHT_MULTI_INSTANCE === '1' || app.requestSingleInstanceLock()

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!gotLock) return
  enqueueOpen(filePath)
})

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    for (const filePath of nestPathsFromArgv(argv)) enqueueOpen(filePath)
  })

  // Overlay Chromium switches only take effect before app.whenReady().
  const steam = startSteam({ packaged: app.isPackaged })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    if (skipPrompt || !dirty) {
      stopCoopHost()
      steam.flush()
      return
    }
    event.preventDefault()
    if (!prompting) void finishClose(true)
  })

  if (steam.restarting) {
    app.quit()
  } else {
    app.whenReady().then(() => {
      for (const filePath of nestPathsFromArgv(process.argv)) enqueueOpen(filePath)
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
