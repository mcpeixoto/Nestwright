/**
 * Baseline screenshots of the named views in views.json.
 *
 *   node scripts/visual/shoot.mjs --out <dir> [--url http://localhost:5181]
 *     [--views a,b] [--serve] [--ref <dir>] [--backend webgpu|webgl]
 *     [--quality low|medium|high|ultra] [--novsync] [--no-models]
 *
 * --backend webgl loads the page with ?renderer=webgl (forced WebGL2 fallback).
 * --serve starts vite on a free port and stops it when the run ends.
 * --quality overrides every view's tier; --novsync drops vsync and the frame cap (headroom timing).
 * Each view is timed by perf.report after the scene settled: 30 frames with no new GPU program.
 * Chromium is launched with a GPU. This machine's sandbox cannot do that;
 * a failure to launch is reported and the process exits non-zero.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout as startTimer } from 'node:timers'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { contactHtml, parseArgs, seatLook, validateViews } from './spec.mjs'

const root = fileURLToPath(new globalThis.URL('../..', import.meta.url))
const here = dirname(fileURLToPath(import.meta.url))

function help() {
  return `node scripts/visual/shoot.mjs --out <dir> [--url http://localhost:5181] [--views a,b] [--serve] [--ref <dir>] [--backend webgpu|webgl] [--quality low|medium|high|ultra] [--novsync] [--no-models]
Default reference folder: ${join(homedir(), 'Documents', 'Coding', '_assets', 'architecture-design-steam-screenshots')}`
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address && typeof address === 'object' ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function startVite(port) {
  const viteBin = fileURLToPath(new globalThis.URL('../../node_modules/vite/bin/vite.js', import.meta.url))
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  const take = (chunk) => {
    log = (log + String(chunk)).slice(-6000)
  }
  child.stdout?.on('data', take)
  child.stderr?.on('data', take)
  return { child, log: () => log }
}

async function waitForUrl(url, child, log) {
  const deadline = Date.now() + 30_000
  let last = 'no response'
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`vite exited ${child.exitCode}\n${log()}`)
    try {
      const res = await globalThis.fetch(url)
      if (res.ok) return
      last = `HTTP ${res.status}`
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await delay(200)
  }
  throw new Error(`vite did not answer at ${url} within 30s (${last})\n${log()}`)
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return
  child.kill('SIGTERM')
  const ended = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([ended, delay(3000)])
  if (child.exitCode == null) child.kill('SIGKILL')
}

async function listRefs(dir, outDir) {
  let names
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  return names
    .filter((name) => /^ss_.*\.jpg$/i.test(name))
    .sort()
    .map((name) => ({
      name,
      src: relative(outDir, join(dir, name)).split(sep).join('/'),
    }))
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = startTimer(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function prepare(page, view) {
  const loaded = await page.evaluate((id) => globalThis.__nestwright.loadTemplate(id), view.template)
  if (!loaded) throw new Error(`loadTemplate(${view.template}) returned false`)
  const tour = page.locator('.tour-card')
  if (await tour.count()) {
    const button = tour.getByRole('button')
    if (await button.count()) await button.click()
  }
  const raw = await page.evaluate((spec) => {
    const nw = globalThis.__nestwright
    const store = nw.useStore.getState()
    const project = store.project
    const levelNamed = (query) => {
      if (!query) return null
      const needle = String(query).toLowerCase()
      return project.levels.find((level) => level.name.toLowerCase().includes(needle)) ?? null
    }
    if (spec.camera.kind === 'room') {
      const level = levelNamed(spec.level) ?? project.levels[0]
      if (!level) throw new Error('template has no level')
      const pose = nw.roomCameraPose(project, level.id, spec.camera.room, { eye: spec.camera.eye })
      if (!pose) throw new Error(`no room matching "${spec.camera.room}" on ${level.name}`)
      return {
        position: [pose.position.x, pose.position.y, pose.position.z],
        target: [pose.target.x, pose.target.y, pose.target.z],
        levelId: pose.levelId,
        roomName: pose.roomName,
      }
    }
    const named = levelNamed(spec.activeLevel)
    return {
      position: spec.camera.position,
      target: spec.camera.target,
      levelId: named ? named.id : null,
      roomName: null,
    }
  }, view)
  await page.evaluate(
    (spec) => {
      const nw = globalThis.__nestwright
      const store = nw.useStore.getState()
      store.setView('3d')
      if (typeof spec.showRoofs === 'boolean') store.setShowRoofs(spec.showRoofs)
      if (spec.levelDisplay) store.setLevelDisplay(spec.levelDisplay)
      if (spec.levelId) store.setActiveLevel(spec.levelId)
      store.apply('Visual harness', (draft) => {
        draft.environment.time = spec.time
        if (typeof spec.autoLights === 'boolean') draft.environment.autoLights = spec.autoLights
      })
      nw.useSettings.getState().setSettings({ graphicsQuality: spec.quality })
    },
    {
      showRoofs: view.showRoofs,
      levelDisplay: view.levelDisplay,
      levelId: raw.levelId,
      time: view.time,
      autoLights: view.autoLights,
      quality: view.quality,
    },
  )
  await page.waitForFunction(() => {
    const canvas = globalThis.document.querySelector('canvas.view3d-canvas')
    const ctl = globalThis.__nestwright.getController?.()
    return Boolean(canvas && canvas.clientWidth > 2 && canvas.clientHeight > 2 && ctl && ctl.renderer)
  })
  await delay(500)
  const seated = seatLook(raw.position, raw.target)
  await page.evaluate((camera) => {
    const ctl = globalThis.__nestwright.getController()
    if (!ctl?.camera || !ctl.controls) throw new Error('3D controller is not ready')
    const [px, py, pz] = camera.position
    const [tx, ty, tz] = camera.target
    ctl.controls.autoRotate = false
    ctl.controls.enableDamping = false
    ctl.camera.position.set(px, py, pz)
    ctl.controls.target.set(tx, ty, tz)
    for (let i = 0; i < 6; i++) {
      ctl.camera.position.set(px, py, pz)
      ctl.controls.update()
      const moved = Math.hypot(ctl.camera.position.x - px, ctl.camera.position.y - py, ctl.camera.position.z - pz)
      if (moved < 0.02) break
      ctl.controls.target.y -= 0.2
    }
    ctl.camera.position.set(px, py, pz)
    ctl.controls.update()
  }, { position: raw.position, target: seated })
  return raw
}

async function shootView(page, view, outDir) {
  await prepare(page, view)
  await delay(2000)
  const report = await withTimeout(
    page.evaluate(() => globalThis.__nestwright.perf.report(90, { settle: 30 })),
    60_000,
    `${view.name} perf.report`,
  )
  const png = join(outDir, `${view.name}.png`)
  await page.locator('canvas.view3d-canvas').first().screenshot({ path: png })
  const payload = { view, report }
  await writeFile(join(outDir, `${view.name}.json`), JSON.stringify(payload, null, 2))
  return { name: view.name, src: `${view.name}.png`, view, report }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(`${help()}\n`)
    return
  }
  const views = JSON.parse(await readFile(join(here, 'views.json'), 'utf8'))
  const problems = validateViews(views)
  if (problems.length) throw new Error(problems.join('\n'))
  let selected = opts.quality ? views.map((view) => ({ ...view, quality: opts.quality })) : views
  if (opts.views) {
    const missing = opts.views.filter((name) => !views.some((view) => view.name === name))
    if (missing.length) throw new Error(`Unknown view: ${missing.join(', ')}`)
    selected = selected.filter((view) => opts.views.includes(view.name))
  }

  let server = null
  let browser = null
  let url = opts.url
  const errors = []
  const shots = []
  try {
    if (opts.serve) {
      const port = await freePort()
      url = `http://127.0.0.1:${port}`
      server = startVite(port)
      await waitForUrl(url, server.child, server.log)
    }
    // The full Chromium build (channel 'chromium'); the default headless shell has no WebGPU.
    const args =
      process.platform === 'darwin'
        ? ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
        : ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist']
    if (opts.novsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit')
    try {
      browser = await chromium.launch({ channel: 'chromium', headless: true, timeout: 45_000, args })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Chromium did not start. A GPU browser is required for these shots. ${message}`, { cause: err })
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('nestwright:tour', 'done')
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
    })
    const target = new globalThis.URL(url)
    if (opts.backend === 'webgl') target.searchParams.set('renderer', 'webgl')
    if (opts.noModels) target.searchParams.set('models', 'off')
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => typeof globalThis.__nestwright?.loadTemplate === 'function')
    await mkdir(opts.out, { recursive: true })
    for (const view of selected) {
      try {
        shots.push(await shootView(page, view, opts.out))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${view.name}: ${message}`)
        shots.push({ name: view.name, view, error: message })
      }
    }
    const refs = await listRefs(opts.ref, opts.out)
    await writeFile(join(opts.out, 'contact.html'), contactHtml({ shots, refs }))
    await writeFile(
      join(opts.out, 'summary.json'),
      JSON.stringify({ createdAt: new Date().toISOString(), url, backend: opts.backend, errors, shots }, null, 2),
    )
    if (errors.length) {
      process.stderr.write(`${errors.join('\n')}\n`)
      process.exitCode = 1
    }
  } finally {
    await browser?.close().catch(() => {})
    if (server) await stopChild(server.child)
  }
}

try {
  await main()
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
}
