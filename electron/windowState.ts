export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

const MIN_WIDTH = 1280
const MIN_HEIGHT = 720

export function parseWindowState(raw: unknown): WindowBounds | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const width = record.width
  const height = record.height
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < MIN_WIDTH || height < MIN_HEIGHT || width > 10000 || height > 10000) return null
  const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : 0
  const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : 0
  return { x, y, width, height, maximized: record.maximized === true }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Keep the window inside the work area. A disconnected display must not hide it. */
export function fitWindow(state: WindowBounds, area: WorkArea): WindowBounds {
  const width = clamp(state.width, Math.min(MIN_WIDTH, area.width), area.width)
  const height = clamp(state.height, Math.min(MIN_HEIGHT, area.height), area.height)
  let x = state.x
  let y = state.y
  if (x + width > area.x + area.width) x = area.x + area.width - width
  if (y + height > area.y + area.height) y = area.y + area.height - height
  if (x < area.x) x = area.x
  if (y < area.y) y = area.y
  return { x, y, width, height, maximized: state.maximized }
}
