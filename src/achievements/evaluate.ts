import { detectRooms } from '../model/rooms'
import { sunPosition } from '../model/sun'
import type { Level, MaterialRef, Project } from '../model/types'

export interface FeatureSet {
  walls: boolean
  rooms: boolean
  storeys: boolean
  roofs: boolean
  plants: boolean
  pools: boolean
  walk: boolean
  night: boolean
  cat: boolean
  coop: boolean
  garden: boolean
  items: boolean
  paint: boolean
  photo: boolean
  budget: boolean
}

export interface AchievementContext {
  project: Project
  view: '2d' | '3d' | 'split' | 'walk'
  features: FeatureSet
  paintedSurfaces: readonly string[]
  photoExported: boolean
  catMode: boolean
  coopSession: boolean
  walkedAtNight: boolean
}

export interface AchievementDef {
  id: string
  name: string
  description: string
  requires: (keyof FeatureSet)[]
  earned: (ctx: AchievementContext) => boolean
}

function levelsOf(project: Project | null | undefined): Level[] {
  if (!project || !Array.isArray(project.levels)) return []
  return project.levels.filter((level): level is Level => !!level && typeof level === 'object')
}

function roomsOf(level: Level): ReturnType<typeof detectRooms> {
  try {
    if (!Array.isArray(level.walls)) return []
    return detectRooms(level)
  } catch {
    return []
  }
}

function roomCount(project: Project): number {
  let count = 0
  for (const level of levelsOf(project)) count += roomsOf(level).length
  return count
}

function floorArea(project: Project): number {
  let area = 0
  for (const level of levelsOf(project)) {
    for (const room of roomsOf(level)) {
      if (Number.isFinite(room.area)) area += room.area
    }
  }
  return area
}

function wallCount(project: Project): number {
  let count = 0
  for (const level of levelsOf(project)) count += Array.isArray(level.walls) ? level.walls.length : 0
  return count
}

function roofCount(project: Project): number {
  let count = 0
  for (const level of levelsOf(project)) count += Array.isArray(level.roofs) ? level.roofs.length : 0
  return count
}

function itemCount(project: Project): number {
  let count = 0
  for (const level of levelsOf(project)) count += Array.isArray(level.items) ? level.items.length : 0
  return count
}

function plantCount(project: Project): number {
  const plants = project?.terrain?.plants
  return Array.isArray(plants) ? plants.length : 0
}

function hasPool(project: Project): boolean {
  const water = project?.terrain?.water
  if (!Array.isArray(water)) return false
  return water.some((body) => body?.kind === 'pool')
}

export function isNightProject(project: Project): boolean {
  const env = project?.environment
  if (!env || typeof env.time !== 'number' || typeof env.dayOfYear !== 'number' || typeof env.latitude !== 'number') {
    return false
  }
  try {
    return sunPosition(env.dayOfYear, env.time, env.latitude).altitude < 0
  } catch {
    return false
  }
}

export function budgetTargetOf(project: Project): number | null {
  const budget = project?.budget
  if (!budget || typeof budget !== 'object') return null
  const record = budget as unknown as Record<string, unknown>
  for (const key of ['target', 'limit', 'cap']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return null
}

export function projectSpend(project: Project): number {
  const perM2 = typeof project?.budget?.buildCostPerM2 === 'number' ? project.budget.buildCostPerM2 : 0
  const finishes = project?.budget?.finishCostPerM2 ?? {}
  let build = 0
  let finish = 0
  let items = 0
  for (const level of levelsOf(project)) {
    for (const room of roomsOf(level)) {
      if (!Number.isFinite(room.area)) continue
      build += room.area * perM2
      const rate = finishes[room.floor?.id ?? '']
      if (typeof rate === 'number' && Number.isFinite(rate)) finish += room.area * rate
    }
    for (const item of level.items ?? []) {
      if (typeof item?.price === 'number' && Number.isFinite(item.price)) items += item.price
    }
  }
  return build + finish + items
}

function walkingAtNight(ctx: AchievementContext): boolean {
  return ctx.walkedAtNight || (ctx.view === 'walk' && isNightProject(ctx.project))
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-wall',
    name: 'First wall',
    description: 'Place a wall on the plan.',
    requires: ['walls'],
    earned: (ctx) => wallCount(ctx.project) >= 1,
  },
  {
    id: 'first-room',
    name: 'First room',
    description: 'Close a loop of walls.',
    requires: ['rooms'],
    earned: (ctx) => roomCount(ctx.project) >= 1,
  },
  {
    id: 'ten-rooms',
    name: 'Ten rooms',
    description: 'Lay out ten rooms.',
    requires: ['rooms'],
    earned: (ctx) => roomCount(ctx.project) >= 10,
  },
  {
    id: 'two-storeys',
    name: 'Two storeys',
    description: 'Add a second floor.',
    requires: ['storeys'],
    earned: (ctx) => levelsOf(ctx.project).length >= 2,
  },
  {
    id: 'roof-over-head',
    name: 'Roof over head',
    description: 'Cover the house with a roof.',
    requires: ['roofs'],
    earned: (ctx) => roofCount(ctx.project) >= 1,
  },
  {
    id: 'green-thumb',
    name: 'Green thumb',
    description: 'Plant one hundred plants.',
    requires: ['plants'],
    earned: (ctx) => plantCount(ctx.project) >= 100,
  },
  {
    id: 'pool-day',
    name: 'Pool day',
    description: 'Add a swimming pool.',
    requires: ['pools'],
    earned: (ctx) => hasPool(ctx.project),
  },
  {
    id: 'night-owl',
    name: 'Night owl',
    description: 'Walk through the house at night.',
    requires: ['walk', 'night'],
    earned: (ctx) => walkingAtNight(ctx),
  },
  {
    id: 'cat-mode',
    name: 'Cat mode',
    description: 'Drop down to the floor in walk mode.',
    requires: ['cat'],
    earned: (ctx) => ctx.catMode,
  },
  {
    id: 'together',
    name: 'Together',
    description: 'Join a shared editing session.',
    requires: ['coop'],
    earned: (ctx) => ctx.coopSession,
  },
  {
    id: 'dream-house',
    name: 'Dream house',
    description: 'Roof a home of at least 150 m², with a garden and fifty things in it.',
    requires: ['rooms', 'roofs', 'garden', 'items'],
    earned: (ctx) =>
      floorArea(ctx.project) >= 150 && roofCount(ctx.project) >= 1 && plantCount(ctx.project) >= 1 && itemCount(ctx.project) >= 50,
  },
  {
    id: 'interior-designer',
    name: 'Interior designer',
    description: 'Paint twenty surfaces.',
    requires: ['paint'],
    earned: (ctx) => new Set(ctx.paintedSurfaces).size >= 20,
  },
  {
    id: 'photographer',
    name: 'Photographer',
    description: 'Export a photo.',
    requires: ['photo'],
    earned: (ctx) => ctx.photoExported,
  },
  {
    id: 'budget-master',
    name: 'Budget master',
    description: 'Set a budget target and stay under it.',
    requires: ['budget'],
    earned: (ctx) => {
      const target = budgetTargetOf(ctx.project)
      return target != null && projectSpend(ctx.project) <= target
    },
  },
]

export function visibleAchievements(features: FeatureSet): AchievementDef[] {
  return ACHIEVEMENTS.filter((item) => item.requires.every((key) => features[key]))
}

export function earnedNow(ctx: AchievementContext): string[] {
  return visibleAchievements(ctx.features)
    .filter((item) => {
      try {
        return item.earned(ctx)
      } catch {
        return false
      }
    })
    .map((item) => item.id)
}

function budgetFeature(project: Project): boolean {
  const budget = project?.budget
  if (!budget || typeof budget !== 'object') return false
  const record = budget as unknown as Record<string, unknown>
  return 'target' in record || 'limit' in record || 'cap' in record
}

/** Feature flags that can be read off the project. Module flags stay false. */
export function dataFeatures(project: Project): FeatureSet {
  const levels = levelsOf(project)
  const terrain = project?.terrain
  return {
    walls: levels.some((level) => Array.isArray(level.walls)),
    rooms: levels.some((level) => Array.isArray(level.walls)),
    storeys: Array.isArray(project?.levels),
    roofs: levels.some((level) => Array.isArray(level.roofs)),
    plants: Array.isArray(terrain?.plants),
    pools: Array.isArray(terrain?.water),
    walk: false,
    night: typeof project?.environment?.time === 'number',
    cat: false,
    coop: false,
    garden: Array.isArray(terrain?.plants),
    items: levels.some((level) => Array.isArray(level.items)),
    paint: false,
    photo: false,
    budget: budgetFeature(project),
  }
}

function matSig(material: MaterialRef | undefined): string {
  if (!material || typeof material.id !== 'string') return ''
  return `${material.id}|${material.tint ?? ''}|${material.scale ?? ''}`
}

export function changedPaintSurfaces(before: Project, after: Project): string[] {
  const keys: string[] = []
  const previous = new Map(levelsOf(before).map((level) => [level.id, level]))
  for (const level of levelsOf(after)) {
    const old = previous.get(level.id)
    const oldWalls = new Map((old?.walls ?? []).map((wall) => [wall.id, wall]))
    for (const wall of level.walls ?? []) {
      const prior = oldWalls.get(wall.id)
      if (!prior) continue
      if (matSig(wall.left) !== matSig(prior.left)) keys.push(`wall:${wall.id}:left`)
      if (matSig(wall.right) !== matSig(prior.right)) keys.push(`wall:${wall.id}:right`)
    }
    const oldRooms = new Map((old?.rooms ?? []).map((room) => [room.key, room]))
    for (const room of level.rooms ?? []) {
      const prior = oldRooms.get(room.key)
      if (!prior) {
        if (room.floor) keys.push(`floor:${room.key}`)
        if (room.ceiling) keys.push(`ceiling:${room.key}`)
        continue
      }
      if (matSig(room.floor) !== matSig(prior.floor)) keys.push(`floor:${room.key}`)
      if (matSig(room.ceiling) !== matSig(prior.ceiling)) keys.push(`ceiling:${room.key}`)
    }
    const oldRoofs = new Map((old?.roofs ?? []).map((roof) => [roof.id, roof]))
    for (const roof of level.roofs ?? []) {
      const prior = oldRoofs.get(roof.id)
      if (prior && matSig(roof.material) !== matSig(prior.material)) keys.push(`roof:${roof.id}`)
    }
    const oldItems = new Map((old?.items ?? []).map((item) => [item.id, item]))
    for (const item of level.items ?? []) {
      const prior = oldItems.get(item.id)
      if (!prior) continue
      const slots = new Set([...Object.keys(prior.materials ?? {}), ...Object.keys(item.materials ?? {})])
      for (const slot of slots) {
        if (matSig(item.materials?.[slot]) !== matSig(prior.materials?.[slot])) keys.push(`item:${item.id}:${slot}`)
      }
    }
  }
  return keys
}
