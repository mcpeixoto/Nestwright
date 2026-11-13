import type { WallProps } from '../model/ops'

export type WallDrawKind = 'wall' | 'half'

let kind: WallDrawKind = 'wall'
let halfHeight = 1.1

export function wallDrawKind(): WallDrawKind {
  return kind
}

export function setWallDrawKind(next: WallDrawKind): void {
  kind = next
}

export function halfWallHeight(): number {
  return halfHeight
}

export function setHalfWallHeight(value: number): void {
  if (value > 0.3 && value < 3) halfHeight = value
}

/** Props for the next wall the wall tool commits. Full walls keep the level default. */
export function wallDrawProps(): WallProps {
  if (kind === 'half') return { kind: 'half', height: halfHeight }
  return {}
}
