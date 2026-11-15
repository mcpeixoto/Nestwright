import { snapCue } from './logic'
import { sfx } from './sfx'

let last: string | null = null

/** Called from the one plan-snap function both the 2D and 3D tools share. */
export function noteSnapPoint(raw: { x: number; y: number }, snapped: { x: number; y: number }): void {
  try {
    const next = snapCue(last, raw, snapped)
    last = next.key
    if (next.play) sfx('snap')
  } catch {
    /* the pointer still has to land if the voice fails */
  }
}
