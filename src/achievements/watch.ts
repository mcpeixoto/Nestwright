import { fill, translate } from '../i18n'
import { getPlatform } from '../platform'
import { useSettings } from '../settings'
import { subscribeBeforeLocalApply, subscribeLocalApplies, useStore, type StoreState } from '../store'
import { ACHIEVEMENTS, changedPaintSurfaces, type AchievementContext } from './evaluate'
import { liveFeatures } from './features'
import { emptyProgress, loadProgress, progressForEdit, saveProgress, type AchievementProgress } from './progress'
import { onCatMode, onCoopSession, onPhotoExported, noteCoopSession } from './signals'
import { showToast } from './toast'

let progress: AchievementProgress = loadProgress(null)
const listeners = new Set<() => void>()
let installed = false
let photoExported = false
let catMode = false
let coopSession = false
const cleanups: Array<() => void> = []

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
    return localStorage
  } catch {
    return null
  }
}

export function achievementProgress(): AchievementProgress {
  return progress
}

export function subscribeAchievements(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: AchievementProgress): void {
  progress = next
  saveProgress(browserStorage(), next)
  for (const listener of listeners) listener()
}

function contextFor(
  project: StoreState['project'],
  state: StoreState,
  painted: readonly string[],
  flags?: { photoExported?: boolean; catMode?: boolean; coopSession?: boolean },
): AchievementContext {
  return {
    project,
    view: state.view,
    features: liveFeatures(project),
    paintedSurfaces: painted,
    photoExported: flags?.photoExported ?? photoExported,
    catMode: flags?.catMode ?? catMode,
    coopSession: flags?.coopSession ?? coopSession,
    walkedAtNight: false,
  }
}

async function forwardSteam(id: string): Promise<void> {
  const steam = getPlatform().steam
  if (!steam) return
  try {
    if (await steam.available()) await steam.unlock(id)
  } catch {
    /* Steam being down must not block the toast */
  }
}

function achievementName(id: string): string {
  return ACHIEVEMENTS.find((item) => item.id === id)?.name ?? id
}

export function resetAchievementWatchForTests(): void {
  for (const cleanup of cleanups) cleanup()
  cleanups.length = 0
  installed = false
  progress = emptyProgress()
  photoExported = false
  catMode = false
  coopSession = false
}

export function installAchievementWatch(): void {
  if (installed) return
  installed = true
  progress = loadProgress(browserStorage())
  let announced = false
  let baseline = useStore.getState().project
  let editing = false

  const sync = (before: AchievementContext, after: AchievementContext) => {
    const result = progressForEdit(progress, before, after)
    publish(result.next)
    for (const id of result.fresh) {
      void forwardSteam(id)
      if (announced) {
        const language = useSettings.getState().language
        showToast(fill(language, 'Unlocked: {name}', { name: translate(language, achievementName(id)) }))
      }
    }
    announced = true
  }

  announced = true
  cleanups.push(
    useStore.subscribe((state, previous) => {
      if (state.project === previous.project || editing) return
      baseline = state.project
    }),
    subscribeBeforeLocalApply(() => {
      editing = true
      baseline = useStore.getState().project
    }),
    subscribeLocalApplies(() => {
      const state = useStore.getState()
      const before = baseline
      const painted =
        state.project !== before && state.past[state.past.length - 1]?.label === 'Paint'
          ? changedPaintSurfaces(before, state.project)
          : []
      try {
        sync(contextFor(before, state, []), contextFor(state.project, state, painted))
      } finally {
        baseline = state.project
        editing = false
      }
    }),
    onPhotoExported(() => {
      const state = useStore.getState()
      sync(contextFor(baseline, state, [], { photoExported: false }), contextFor(baseline, state, [], { photoExported: true }))
      photoExported = true
    }),
    onCatMode(() => {
      const state = useStore.getState()
      sync(contextFor(baseline, state, [], { catMode: false }), contextFor(baseline, state, [], { catMode: true }))
      catMode = true
    }),
    onCoopSession(() => {
      const state = useStore.getState()
      sync(contextFor(baseline, state, [], { coopSession: false }), contextFor(baseline, state, [], { coopSession: true }))
      coopSession = true
    }),
  )
  if (typeof window !== 'undefined') {
    const onSession = () => noteCoopSession()
    window.addEventListener('nestwright:coop-session', onSession)
    cleanups.push(() => window.removeEventListener('nestwright:coop-session', onSession))
  }
}
