import { homedir } from 'node:os'
import { join } from 'node:path'

/** Keep in step with TEMPLATES in src/templates/index.ts. */
export const TEMPLATE_IDS = ['empty', 'studio', 'two-bed', 'floor', 'bungalow', 'family', 'beach', 'courtyard']

export const QUALITIES = ['low', 'medium', 'high', 'ultra']

export const LEVEL_DISPLAYS = ['all', 'current', 'current-below']

const VIEW_KEYS = new Set([
  'name',
  'template',
  'time',
  'quality',
  'camera',
  'level',
  'activeLevel',
  'showRoofs',
  'levelDisplay',
  'autoLights',
])

const ROOM_KEYS = new Set(['kind', 'room', 'eye', 'look'])
const ORBIT_KEYS = new Set(['kind', 'position', 'target'])

export function defaultRefDir() {
  return join(homedir(), 'Documents', 'Coding', '_assets', 'architecture-design-steam-screenshots')
}

function unknownKeys(source, allowed) {
  if (!source || typeof source !== 'object') return []
  return Object.keys(source).filter((key) => !allowed.has(key))
}

function finiteTriple(value, label, errors) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    errors.push(`${label} must be three finite numbers`)
  }
}

/**
 * @param {unknown} views
 * @returns {string[]} empty when the file is usable
 */
export function validateViews(views) {
  const errors = []
  if (!Array.isArray(views) || views.length === 0) {
    errors.push('views must be a non-empty array')
    return errors
  }
  const names = new Set()
  views.forEach((view, index) => {
    const where = `view ${index}`
    if (!view || typeof view !== 'object') {
      errors.push(`${where} is not an object`)
      return
    }
    const extra = unknownKeys(view, VIEW_KEYS)
    if (extra.length) errors.push(`${where} has unknown fields: ${extra.join(', ')}`)
    const name = view.name
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      errors.push(`${where} needs a slug name`)
    } else if (names.has(name)) {
      errors.push(`duplicate view name ${name}`)
    } else {
      names.add(name)
    }
    const label = typeof name === 'string' ? name : where
    if (!TEMPLATE_IDS.includes(view.template)) errors.push(`${label} template is not a known id`)
    if (typeof view.time !== 'number' || !Number.isFinite(view.time) || view.time < 0 || view.time > 24) {
      errors.push(`${label} time must be hours from 0 to 24`)
    }
    if (!QUALITIES.includes(view.quality)) errors.push(`${label} quality must be low, medium, high, or ultra`)
    if (view.level != null && (typeof view.level !== 'string' || !view.level.trim())) {
      errors.push(`${label} level must be a name`)
    }
    if (view.activeLevel != null && (typeof view.activeLevel !== 'string' || !view.activeLevel.trim())) {
      errors.push(`${label} activeLevel must be a name`)
    }
    if (view.showRoofs != null && typeof view.showRoofs !== 'boolean') errors.push(`${label} showRoofs must be boolean`)
    if (view.autoLights != null && typeof view.autoLights !== 'boolean') errors.push(`${label} autoLights must be boolean`)
    if (view.levelDisplay != null && !LEVEL_DISPLAYS.includes(view.levelDisplay)) {
      errors.push(`${label} levelDisplay is not a known mode`)
    }
    const camera = view.camera
    if (!camera || typeof camera !== 'object') {
      errors.push(`${label} camera is missing`)
      return
    }
    if (camera.kind === 'room') {
      const odd = unknownKeys(camera, ROOM_KEYS)
      if (odd.length) errors.push(`${label} camera has unknown fields: ${odd.join(', ')}`)
      if (typeof camera.room !== 'string' || !camera.room.trim()) errors.push(`${label} camera.room is missing`)
      if (typeof camera.eye !== 'number' || !Number.isFinite(camera.eye) || camera.eye < 0) {
        errors.push(`${label} camera.eye must be a height in metres`)
      }
      if (camera.look !== 'longest') errors.push(`${label} camera.look must be "longest"`)
    } else if (camera.kind === 'orbit') {
      const odd = unknownKeys(camera, ORBIT_KEYS)
      if (odd.length) errors.push(`${label} camera has unknown fields: ${odd.join(', ')}`)
      finiteTriple(camera.position, `${label} camera.position`, errors)
      finiteTriple(camera.target, `${label} camera.target`, errors)
    } else {
      errors.push(`${label} camera.kind must be room or orbit`)
    }
  })
  return errors
}

/**
 * Drop the look target until OrbitControls' polar cap will leave the camera where it was put.
 * The editor clamps the camera to about 86° from vertical.
 */
export function seatLook(position, target, maxPolar = Math.PI * 0.48) {
  if (!Array.isArray(position) || position.length !== 3 || position.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error('seatLook position must be three finite numbers')
  }
  if (!Array.isArray(target) || target.length !== 3 || target.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error('seatLook target must be three finite numbers')
  }
  const horiz = Math.hypot(position[0] - target[0], position[2] - target[2])
  const minDy = horiz * Math.tan(Math.max(0, Math.PI / 2 - maxPolar)) + 0.05
  const dy = position[1] - target[1]
  if (dy >= minDy) return [target[0], target[1], target[2]]
  return [target[0], position[1] - minDy, target[2]]
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = {
    out: 'visual-out',
    url: 'http://localhost:5181',
    views: /** @type {string[] | null} */ (null),
    serve: false,
    ref: defaultRefDir(),
    /** 'webgpu' (default: auto, which is WebGPU on a GPU browser) or 'webgl' (forced fallback). */
    backend: 'webgpu',
    /** Overrides every view's quality tier (low, medium, high, ultra); null keeps views.json. */
    quality: /** @type {string | null} */ (null),
    /** Launch Chromium without vsync or a frame-rate cap, for headroom timings. */
    novsync: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value == null || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      i += 1
      return value
    }
    if (arg === '--out') opts.out = next()
    else if (arg === '--url') opts.url = next()
    else if (arg === '--views') {
      opts.views = next()
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    } else if (arg === '--ref') opts.ref = next()
    else if (arg === '--serve') opts.serve = true
    else if (arg === '--backend') {
      const value = next()
      if (value !== 'webgpu' && value !== 'webgl') throw new Error(`--backend must be webgpu or webgl, got ${value}`)
      opts.backend = value
    } else if (arg === '--quality') {
      const value = next()
      if (!QUALITIES.includes(value)) throw new Error(`--quality must be one of ${QUALITIES.join(', ')}, got ${value}`)
      opts.quality = value
    } else if (arg === '--novsync') opts.novsync = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`Unknown argument ${arg}`)
  }
  return opts
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(value, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits)
}

function shotCard(shot) {
  const img = shot.src ? `<img src="${escapeHtml(shot.src)}" alt="${escapeHtml(shot.name)}">` : ''
  const report = shot.report ?? {}
  const rows = shot.error
    ? `<dt>error</dt><dd>${escapeHtml(shot.error)}</dd>`
    : [
        ['fps', fmt(report.fpsAvg, 1)],
        ['p50 ms', fmt(report.p50, 2)],
        ['p95 ms', fmt(report.p95, 2)],
        ['max ms', fmt(report.max, 2)],
        ['hitches', fmt(report.hitches, 0)],
        ['draws', fmt(report.drawCalls, 0)],
        ['triangles', fmt(report.triangles, 0)],
        ['gpu MB', fmt(report.gpuMemMB, 1)],
        ['backend', report.backend ?? ''],
        ['size', `${report.width ?? ''}×${report.height ?? ''}`],
      ]
        .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join('')
  return `<figure>${img}<figcaption><strong>${escapeHtml(shot.name)}</strong><dl>${rows}</dl></figcaption></figure>`
}

/**
 * @param {{ shots: { name: string, src?: string, report?: object, error?: string }[], refs?: { name: string, src: string }[] | null }} input
 */
export function contactHtml(input) {
  const shots = Array.isArray(input.shots) ? input.shots : []
  const reference = Array.isArray(input.refs)
    ? `<h2>Reference</h2>
<section class="grid">
${input.refs
  .map(
    (ref) =>
      `<figure><img src="${escapeHtml(ref.src)}" alt="${escapeHtml(ref.name)}"><figcaption>${escapeHtml(ref.name)}</figcaption></figure>`,
  )
  .join('\n')}
</section>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Nestwright visual baseline</title>
<style>
  body { margin: 24px; background: #1c1a17; color: #f3efe6; font: 13px/1.4 ui-monospace, monospace; }
  h1, h2 { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 560; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #111; }
  img { width: 100%; height: auto; display: block; background: #000; }
  figcaption { padding: 8px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 8px 0 0; }
  dt { color: #aaa; }
  dd { margin: 0; }
</style>
</head>
<body>
<h1>Nestwright visual baseline</h1>
<section class="grid">
${shots.map(shotCard).join('\n')}
</section>
${reference}
</body>
</html>
`
}
