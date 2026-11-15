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
  /** Unlocks leave the top-right toast. A finished room leaves the bottom centre. */
  anchor: 'top-right' | 'bottom-center'
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
 * 12–20 bits, each gone within 1.2 s. Reduced motion keeps the anchor (for the toast)
 * and draws nothing.
 */
export function celebrationPlan(
  kind: 'unlock' | 'room-complete',
  reducedMotion: boolean,
  rng: Rng = Math.random,
): CelebrationPlan {
  const anchor = kind === 'unlock' ? 'top-right' : 'bottom-center'
  if (reducedMotion) return { anchor, particles: [] }
  const count = 12 + Math.floor(unit(rng) * 9)
  const particles: Confetti[] = []
  for (let i = 0; i < count; i++) {
    const dur = Math.min(1.2, 0.75 + unit(rng) * 0.45)
    const color = BRAND[Math.min(BRAND.length - 1, Math.floor(unit(rng) * BRAND.length))] ?? BRAND[0]
    const leaf = unit(rng) < 0.55
    const rot = unit(rng) * 540 - 180
    if (anchor === 'top-right') {
      particles.push({ dx: -(16 + unit(rng) * 150), dy: 24 + unit(rng) * 150, rot, dur, color, leaf })
    } else {
      particles.push({ dx: (unit(rng) * 2 - 1) * 170, dy: -(28 + unit(rng) * 150), rot, dur, color, leaf })
    }
  }
  return { anchor, particles }
}
