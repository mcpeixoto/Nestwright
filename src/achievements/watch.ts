import { fill, translate } from '../i18n'
import { getPlatform } from '../platform'
import { useSettings } from '../settings'
import { subscribeLocalApplies, useStore, type StoreState } from '../store'
import { ACHIEVEMENTS, changedPaintSurfaces, type AchievementContext } from './evaluate'
import { liveFeatures } from './features'
import { loadProgress, mergeProgress, saveProgress, type AchievementProgress } from './progress'
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

function contextFor(state: StoreState, painted: readonly string[]): AchievementContext {
  return {
    project: state.project,
    view: state.view,
    features: liveFeatures(state.project),
    paintedSurfaces: painted,
    photoExported,
    catMode,
    coopSession,
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

export function installAchievementWatch(): void {
  if (installed) return
  installed = true
  progress = loadProgress(browserStorage())
  let announced = false
  let previous = useStore.getState().project

  const sync = (painted: readonly string[]) => {
    const result = mergeProgress(progress, contextFor(useStore.getState(), painted))
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
    subscribeLocalApplies(() => {
      const state = useStore.getState()
      const painted =
        state.project !== previous && state.past[state.past.length - 1]?.label === 'Paint'
          ? changedPaintSurfaces(previous, state.project)
          : []
      previous = state.project
      sync(painted)
    }),
    onPhotoExported(() => {
      photoExported = true
      sync([])
    }),
    onCatMode(() => {
      catMode = true
      sync([])
    }),
    onCoopSession(() => {
      coopSession = true
      sync([])
    }),
  )
  if (typeof window !== 'undefined') {
    const onSession = () => noteCoopSession()
    window.addEventListener('nestwright:coop-session', onSession)
    cleanups.push(() => window.removeEventListener('nestwright:coop-session', onSession))
  }
}
