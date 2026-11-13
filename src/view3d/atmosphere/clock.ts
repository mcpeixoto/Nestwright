export interface ClockSnapshot {
  playing: boolean
  /** Hours 0..24 while a time-lapse or a drag preview is active. */
  live: number | null
}

let playing = false
let live: number | null = null
let raf = 0
let last = 0
let snapshot: ClockSnapshot = { playing: false, live: null }
const listeners = new Set<() => void>()

function publish(): void {
  snapshot = { playing, live }
  for (const listener of listeners) listener()
}

export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getClockSnapshot(): ClockSnapshot {
  return snapshot
}

export function clockTime(projectTime: number): number {
  return live ?? projectTime
}

export function isTimePlaying(): boolean {
  return playing
}

/** 1 simulated hour per real second. */
export function playTime(from: number): void {
  live = ((from % 24) + 24) % 24
  playing = true
  last = typeof performance !== 'undefined' ? performance.now() : 0
  publish()
  if (typeof requestAnimationFrame !== 'function') return
  const loop = (now: number) => {
    if (!playing) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    live = ((live ?? from) + dt) % 24
    publish()
    raf = requestAnimationFrame(loop)
  }
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

export function stopTime(): number | null {
  playing = false
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  publish()
  return live
}

export function clearLiveTime(): void {
  live = null
  publish()
}
