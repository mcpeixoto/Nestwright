import { useEffect, useSyncExternalStore } from 'react'
import { detectRooms } from '../../model/rooms'
import { useStore } from '../../store'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { TOUR_STEPS, tourProgress, type TourSnap } from './logic'

const KEY = 'nestwright:tour'

let memoryDone = false
let run = 0
let tick = 0
let step = 0
let baseline: TourSnap | null = null
let seenWalk = false
let armedRun = -1
let tourSnap = { run, tick, step }
const listeners = new Set<() => void>()

function publish(): void {
  tourSnap = { run, tick, step }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readTourSnap(): { run: number; tick: number; step: number } {
  return tourSnap
}

function dismissed(): boolean {
  if (memoryDone) return true
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return false
  }
}

function freshBaseline(): void {
  step = 0
  seenWalk = false
  baseline = readSnap(false)
}

function markDone(): void {
  memoryDone = true
  try {
    localStorage.setItem(KEY, 'done')
  } catch {
    /* the in-memory flag still hides the card */
  }
  tick += 1
  publish()
}

export function isTourOpen(): boolean {
  if (dismissed()) return false
  return step >= 0 && step < TOUR_STEPS.length
}

/** Capture-phase Escape, so a tool's bubble handler does not also cancel. */
export function bindTourEscape(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isTourOpen()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    markDone()
  }
  target.addEventListener('keydown', onKey, true)
  return () => target.removeEventListener('keydown', onKey, true)
}

export function replayTour(): void {
  memoryDone = false
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* the tour still restarts in memory */
  }
  run += 1
  tick += 1
  freshBaseline()
  armedRun = run
  publish()
}

function readSnap(seenWalk: boolean): TourSnap {
  const state = useStore.getState()
  const level = state.project.levels.find((item) => item.id === state.activeLevelId) ?? state.project.levels[0]
  const doors =
    level?.openings.filter((opening) => opening.type === 'door' || opening.type === 'double-door' || opening.type === 'sliding-door')
      .length ?? 0
  const sofas = level?.items.filter((item) => item.catalogId.includes('sofa')).length ?? 0
  const view = state.view
  return {
    walls: level?.walls.length ?? 0,
    rooms: level ? detectRooms(level).length : 0,
    doors,
    sofas,
    view,
    seenWalk: seenWalk || view === 'walk',
  }
}

export function Tour() {
  const snap = useSyncExternalStore(subscribe, readTourSnap, readTourSnap)
  const tr = useTranslate()

  useEffect(() => {
    if (armedRun !== snap.run) {
      armedRun = snap.run
      freshBaseline()
    }
    if (dismissed()) return
    return useStore.subscribe(() => {
      if (dismissed() || !baseline) return
      const now = readSnap(seenWalk)
      if (now.view === 'walk') seenWalk = true
      now.seenWalk = seenWalk
      const next = tourProgress(step, now, baseline)
      if (next === step) return
      step = next
      baseline = now
      if (next >= TOUR_STEPS.length) {
        markDone()
        return
      }
      publish()
    })
  }, [snap.run])

  useEffect(() => bindTourEscape(), [])

  if (dismissed()) return null
  const current = TOUR_STEPS[snap.step]
  if (!current) return null
  return (
    <aside className="tour-card" role="dialog" aria-label={tr(current.titleKey)}>
      <p className="hint">{tr('Step {n} of {total}', { n: snap.step + 1, total: TOUR_STEPS.length })}</p>
      <h2>
        <T k={current.titleKey} />
      </h2>
      <p>
        <T k={current.bodyKey} />
      </p>
      <button type="button" onClick={() => markDone()}>
        <T k="Skip" />
      </button>
    </aside>
  )
}
