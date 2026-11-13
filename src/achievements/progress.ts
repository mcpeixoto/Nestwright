import { earnedNow, isNightProject, type AchievementContext } from './evaluate'

export const ACHIEVEMENT_KEY = 'nestwright:achievements'

export interface AchievementProgress {
  unlocked: string[]
  painted: string[]
  photoExported: boolean
  catMode: boolean
  coopSession: boolean
  walkedAtNight: boolean
}

type Bin = Pick<Storage, 'getItem' | 'setItem'> | null

export function emptyProgress(): AchievementProgress {
  return {
    unlocked: [],
    painted: [],
    photoExported: false,
    catMode: false,
    coopSession: false,
    walkedAtNight: false,
  }
}

function unique(ids: readonly string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0 && !out.includes(id)) out.push(id)
  }
  return out
}

export function loadProgress(storage: Bin): AchievementProgress {
  if (!storage) return emptyProgress()
  let raw: string | null
  try {
    raw = storage.getItem(ACHIEVEMENT_KEY)
  } catch {
    return emptyProgress()
  }
  if (!raw) return emptyProgress()
  try {
    const parsed = JSON.parse(raw) as Partial<AchievementProgress>
    if (!parsed || typeof parsed !== 'object') return emptyProgress()
    return {
      unlocked: unique(Array.isArray(parsed.unlocked) ? parsed.unlocked : []),
      painted: unique(Array.isArray(parsed.painted) ? parsed.painted : []),
      photoExported: parsed.photoExported === true,
      catMode: parsed.catMode === true,
      coopSession: parsed.coopSession === true,
      walkedAtNight: parsed.walkedAtNight === true,
    }
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(storage: Bin, progress: AchievementProgress): void {
  if (!storage) return
  try {
    storage.setItem(ACHIEVEMENT_KEY, JSON.stringify(progress))
  } catch {
    /* a full disk should not block editing */
  }
}

export type AchievementCause = 'apply' | 'load' | 'remote'

/** Template loads, file opens, and remote patches must not unlock anything. */
export function progressForCause(
  prev: AchievementProgress,
  ctx: AchievementContext,
  cause: AchievementCause,
): { next: AchievementProgress; fresh: string[] } {
  if (cause !== 'apply') return { next: prev, fresh: [] }
  return mergeProgress(prev, ctx)
}

export function mergeProgress(
  prev: AchievementProgress,
  ctx: AchievementContext,
): { next: AchievementProgress; fresh: string[] } {
  const painted = unique([...prev.painted, ...ctx.paintedSurfaces])
  const nextCtx: AchievementContext = {
    ...ctx,
    paintedSurfaces: painted,
    photoExported: prev.photoExported || ctx.photoExported,
    catMode: prev.catMode || ctx.catMode,
    coopSession: prev.coopSession || ctx.coopSession,
    walkedAtNight: prev.walkedAtNight || ctx.walkedAtNight || (ctx.view === 'walk' && isNightProject(ctx.project)),
  }
  let earned: string[]
  try {
    earned = earnedNow(nextCtx)
  } catch {
    earned = []
  }
  const unlocked = unique([...prev.unlocked, ...earned])
  const fresh = earned.filter((id) => !prev.unlocked.includes(id))
  return {
    fresh,
    next: {
      unlocked,
      painted,
      photoExported: nextCtx.photoExported,
      catMode: nextCtx.catMode,
      coopSession: nextCtx.coopSession,
      walkedAtNight: nextCtx.walkedAtNight,
    },
  }
}
