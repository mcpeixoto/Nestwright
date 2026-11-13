/** Storey height used to turn a floor number into a level elevation. */
export const STOREY_HEIGHT = 3

export function floorNumber(elevation: number): number {
  if (!Number.isFinite(elevation)) return 0
  return Math.round(elevation / STOREY_HEIGHT)
}

export function elevationForFloor(floor: number): number {
  if (!Number.isFinite(floor)) return 0
  return Math.round(floor) * STOREY_HEIGHT
}
