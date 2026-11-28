import { useEffect, useSyncExternalStore } from 'react'
import { detectRooms } from '../../model/rooms'
import { useStore } from '../../store'
import { CoachMark } from './CoachMark'
import { TOUR_STEPS, stepAfterBack, stepAfterNext, tourProgress, type TourSnap } from './logic'

const KEY = 'nestwright:tour'

let memoryDone = false
let run = 0
let tick = 0
let step = 0
let baseline: TourSnap | null = null
let seenWalk = false
let armedRun = -1
/** Only a blank new house or Help → Replay arms the tour; templates and briefs never do. */
let armed = false
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
  armed = false
  try {
    localStorage.setItem(KEY, 'done')
  } catch {
    /* the in-memory flag still hides the card */
  }
  tick += 1
  publish()
}

export function armTour(): void {
  armed = true
  run += 1
  tick += 1
  freshBaseline()
  armedRun = run
  publish()
}

export function disarmTour(): void {
  if (!armed) return
  armed = false
  tick += 1
  publish()
}

export function isTourArmed(): boolean {
  return armed
}

export function nextStep(): void {
  step = stepAfterNext(step)
  baseline = readSnap(seenWalk)
  if (step >= TOUR_STEPS.length) {
    markDone()
    return
  }
  publish()
}

export function backStep(): void {
  step = stepAfterBack(step)
  baseline = readSnap(seenWalk)
  publish()
}

export function isTourOpen(): boolean {
  if (!armed || dismissed()) return false
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
  armed = true
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

  useEffect(() => {
    if (armedRun !== snap.run) {
      armedRun = snap.run
      freshBaseline()
    }
    if (dismissed()) return
    return useStore.subscribe(() => {
      if (!armed || dismissed() || !baseline) return
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

  if (!armed || dismissed()) return null
  const current = TOUR_STEPS[snap.step]
  if (!current) return null
  return (
    <CoachMark
      step={current}
      index={snap.step}
      total={TOUR_STEPS.length}
      onNext={nextStep}
      onBack={backStep}
      onSkip={markDone}
    />
  )
}
