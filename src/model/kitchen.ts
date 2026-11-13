import type { Item } from './types'

export const KITCHEN_MODULES = [
  'base-drawers',
  'base-doors',
  'sink',
  'hob',
  'oven',
  'dishwasher',
  'fridge-tall',
  'corner',
  'open-shelf',
] as const

export type KitchenModuleType = (typeof KITCHEN_MODULES)[number]
export type KitchenKind = 'run' | 'l' | 'island'
export type HandleStyle = 'bar' | 'knob' | 'groove'

export interface KitchenModule {
  type: KitchenModuleType
  width: number
}

export interface KitchenSpec {
  modules: KitchenModule[]
  returns: KitchenModule[]
  wall: boolean
  wallH: number
  handle: HandleStyle
  plinth: boolean
  hood: boolean
}

const HANDLES: HandleStyle[] = ['bar', 'knob', 'groove']

export function defaultRunModules(): KitchenModule[] {
  return [
    { type: 'base-doors', width: 0.6 },
    { type: 'sink', width: 0.6 },
    { type: 'base-drawers', width: 0.6 },
    { type: 'hob', width: 0.6 },
    { type: 'oven', width: 0.6 },
  ]
}

export function defaultReturnModules(): KitchenModule[] {
  return [
    { type: 'corner', width: 0.6 },
    { type: 'base-doors', width: 0.6 },
    { type: 'base-drawers', width: 0.6 },
  ]
}

export function modulesWidth(modules: readonly KitchenModule[]): number {
  return modules.reduce((sum, module) => sum + module.width, 0)
}

function isType(value: string): value is KitchenModuleType {
  return (KITCHEN_MODULES as readonly string[]).includes(value)
}

export function parseModules(raw: unknown, fallback: readonly KitchenModule[]): KitchenModule[] {
  if (typeof raw !== 'string' || raw.length === 0) return fallback.map((module) => ({ ...module }))
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback.map((module) => ({ ...module }))
    const modules: KitchenModule[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const type = (entry as { type?: unknown }).type
      const width = (entry as { width?: unknown }).width
      if (typeof type !== 'string' || !isType(type)) continue
      const safe = typeof width === 'number' && Number.isFinite(width) ? width : 0.6
      modules.push({ type, width: Math.min(2.4, Math.max(0.15, safe)) })
    }
    return modules.length > 0 ? modules : fallback.map((module) => ({ ...module }))
  } catch {
    return fallback.map((module) => ({ ...module }))
  }
}

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function handleOf(value: unknown): HandleStyle {
  return typeof value === 'string' && (HANDLES as readonly string[]).includes(value) ? (value as HandleStyle) : 'bar'
}

export function readKitchen(params: Item['params'] | undefined, kind: KitchenKind): KitchenSpec {
  const source = params ?? {}
  const wallDefault = kind !== 'island'
  return {
    modules: parseModules(source.modules, defaultRunModules()),
    returns: parseModules(source.returns, kind === 'l' ? defaultReturnModules() : []),
    wall: flag(source.wall, wallDefault),
    wallH: typeof source.wallH === 'number' && source.wallH > 0 ? source.wallH : 0.72,
    handle: handleOf(source.handle),
    plinth: flag(source.plinth, true),
    hood: flag(source.hood, true),
  }
}

/** Writes module params and sets width (and depth, for an L) from the module sums. */
export function writeKitchen(item: Item, spec: KitchenSpec, kind: KitchenKind): void {
  item.params = {
    ...item.params,
    modules: JSON.stringify(spec.modules),
    returns: JSON.stringify(spec.returns),
    wall: spec.wall,
    wallH: spec.wallH,
    handle: spec.handle,
    plinth: spec.plinth,
    hood: spec.hood,
  }
  const width = Math.max(0.15, modulesWidth(spec.modules))
  if (kind === 'l') {
    item.size = { ...item.size, w: width, d: Math.max(0.15, modulesWidth(spec.returns)) }
  } else {
    item.size = { ...item.size, w: width }
  }
}

export function kitchenKind(catalogId: string): KitchenKind | null {
  if (catalogId === 'kitchen-run') return 'run'
  if (catalogId === 'kitchen-l') return 'l'
  if (catalogId === 'kitchen-island') return 'island'
  return null
}
