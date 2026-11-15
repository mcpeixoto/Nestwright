export type Rng = () => number

/** Sand, teal, paper, and the warm text colour from the UI theme. */
const BRAND = ['#e8b86d', '#3fb8af', '#f4f0e6', '#e7e1d6'] as const

export interface Confetti {
  dx: number
  dy: number
  rot: number
  /** Seconds. Never longer than the overlay keeps the bit. */
  dur: number
  color: string
  leaf: boolean
}

export interface CelebrationPlan {
  /** Both bursts leave the toast stack at the top centre, where their toast appears. */
  anchor: 'toast'
  particles: Confetti[]
}

function unit(rng: Rng): number {
  const value = rng()
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 0.999999
  return value
}

/**
 * 12–20 bits, each gone within 1.2 s, falling out of the toast. A finished room spreads
 * wider than an unlock. Reduced motion draws nothing; the toast still shows.
 */
export function celebrationPlan(
  kind: 'unlock' | 'room-complete',
  reducedMotion: boolean,
  rng: Rng = Math.random,
): CelebrationPlan {
  if (reducedMotion) return { anchor: 'toast', particles: [] }
  const spread = kind === 'room-complete' ? 220 : 150
  const count = 12 + Math.floor(unit(rng) * 9)
  const particles: Confetti[] = []
  for (let i = 0; i < count; i++) {
    const dur = Math.min(1.2, 0.75 + unit(rng) * 0.45)
    const color = BRAND[Math.min(BRAND.length - 1, Math.floor(unit(rng) * BRAND.length))] ?? BRAND[0]
    const leaf = unit(rng) < 0.55
    const rot = unit(rng) * 540 - 180
    particles.push({ dx: (unit(rng) * 2 - 1) * spread, dy: 30 + unit(rng) * 140, rot, dur, color, leaf })
  }
  return { anchor: 'toast', particles }
}
