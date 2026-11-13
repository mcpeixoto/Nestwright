export interface TourSnap {
  walls: number
  rooms: number
  doors: number
  sofas: number
  view: string
  seenWalk: boolean
}

export interface TourStep {
  id: string
  titleKey: string
  bodyKey: string
  done(now: TourSnap, baseline: TourSnap): boolean
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'walls',
    titleKey: 'tour.walls.title',
    bodyKey: 'tour.walls.body',
    done: (now, baseline) => now.walls > baseline.walls,
  },
  {
    id: 'room',
    titleKey: 'tour.room.title',
    bodyKey: 'tour.room.body',
    done: (now, baseline) => now.rooms > baseline.rooms,
  },
  {
    id: 'view',
    titleKey: 'tour.view.title',
    bodyKey: 'tour.view.body',
    done: (now, baseline) => now.view !== baseline.view && (now.view === '3d' || now.view === 'split' || now.view === 'walk'),
  },
  {
    id: 'door',
    titleKey: 'tour.door.title',
    bodyKey: 'tour.door.body',
    done: (now, baseline) => now.doors > baseline.doors,
  },
  {
    id: 'sofa',
    titleKey: 'tour.sofa.title',
    bodyKey: 'tour.sofa.body',
    done: (now, baseline) => now.sofas > baseline.sofas,
  },
  {
    id: 'walk',
    titleKey: 'tour.walk.title',
    bodyKey: 'tour.walk.body',
    done: (now, baseline) => now.view === 'walk' && (now.view !== baseline.view || now.seenWalk),
  },
]

/** Advance through every step the same edit already satisfies. */
export function tourProgress(step: number, now: TourSnap, baseline: TourSnap): number {
  let next = step
  let guard = 0
  while (next < TOUR_STEPS.length && guard < TOUR_STEPS.length) {
    const current = TOUR_STEPS[next]
    if (!current || !current.done(now, baseline)) break
    next += 1
    guard += 1
  }
  return next
}
