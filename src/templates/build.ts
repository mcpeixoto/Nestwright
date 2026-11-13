import { getEntry } from '../catalog/registry'
import { createLevel, createProject, createTerrain, mat } from '../model/defaults'
import { newId } from '../model/ids'
import { addItem, addWallChain, placeOpening } from '../model/ops'
import { outerOutline } from '../model/roofs'
import { detectRooms } from '../model/rooms'
import { decodeSplat, encodeSplat, generateGarden, splatLength } from '../model/terrain'
import {
  GROUND_LAYERS,
  type GroundLayer,
  type Level,
  type OpeningType,
  type Project,
  type ProjectKind,
  type RoofShape,
  type RoomType,
  type Vec2,
  type Wall,
} from '../model/types'
import { locateOnWall } from '../model/walls'

export interface Zone {
  name: string
  type: RoomType
  floor?: string
  noCeiling?: boolean
  contains(point: Vec2): boolean
}

export interface WallStyle {
  kind?: Wall['kind']
  height?: number
  thickness?: number
}

export function zone(
  name: string,
  type: RoomType,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  floor?: string,
): Zone {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  return {
    name,
    type,
    floor,
    contains: (point) => point.x >= minX - 0.02 && point.x <= maxX + 0.02 && point.y >= minY - 0.02 && point.y <= maxY + 0.02,
  }
}

export function fresh(name: string, kind: ProjectKind, plot?: { width: number; depth: number }): Project {
  const project = createProject(name, kind)
  if (plot) project.terrain = createTerrain(plot.width, plot.depth, 32)
  if (kind === 'apartment') project.terrain.enabled = false
  return project
}

export function upperStorey(project: Project, name: string, elevation: number): Level {
  const level = createLevel(name, elevation)
  project.levels.push(level)
  return level
}

export function shell(level: Level, points: readonly Vec2[]): void {
  const first = points[0]
  if (!first || points.length < 3) return
  addWallChain(level, [...points, { x: first.x, y: first.y }])
}

export function wall(level: Level, a: Vec2, b: Vec2, style: WallStyle = {}): void {
  addWallChain(level, [a, b], style)
}

/** Place an opening on the nearest real wall. Missing fits are skipped. */
export function cut(level: Level, at: Vec2, type: OpeningType): boolean {
  let best: { id: string; offset: number; distance: number } | null = null
  for (const item of level.walls) {
    if (item.kind === 'railing') continue
    const loc = locateOnWall(item, at)
    if (loc.distance <= 0.08 || loc.distance >= loc.length - 0.08) continue
    if (!best || loc.distanceToWall < best.distance) {
      best = { id: item.id, offset: loc.distance, distance: loc.distanceToWall }
    }
  }
  if (!best || best.distance > 0.45) return false
  return placeOpening(level, type, best.id, best.offset) != null
}

/** Catalog misses are skipped so a template still builds after a partial merge. */
export function furnish(level: Level, catalogId: string, x: number, y: number, rotation = 0): void {
  const entry = getEntry(catalogId)
  if (!entry) return
  const params: Record<string, number | string | boolean> = {}
  for (const param of entry.params ?? []) params[param.key] = param.default
  const materials: Record<string, { id: string }> = {}
  for (const [slot, ref] of Object.entries(entry.materialSlots)) materials[slot] = { id: ref.id }
  const elevation = entry.mount === 'ceiling' ? Math.max(0, level.height - entry.defaultSize.h) : 0
  addItem(level, {
    id: newId('item'),
    catalogId,
    position: { x, y },
    elevation,
    rotation,
    size: { w: entry.defaultSize.w, d: entry.defaultSize.d, h: entry.defaultSize.h },
    materials,
    params,
  })
}

export function labelZones(level: Level, zones: readonly Zone[]): void {
  level.rooms = detectRooms(level).map((room) => {
    const match = zones.find((item) => item.contains(room.centroid))
    const type = match?.type ?? room.type
    return {
      key: room.key,
      name: match?.name ?? room.name,
      type,
      floor: { id: match?.floor ?? (type === 'bathroom' || type === 'wc' ? 'tile-white' : 'oak-planks') },
      ceiling: { id: 'plaster-white' },
      noCeiling: match?.noCeiling,
    }
  })
}

export function addRoof(level: Level, shape: RoofShape, pitch = Math.PI / 6): void {
  const outline = outerOutline(level)
  if (outline.length < 3) return
  level.roofs.push({
    id: newId('roof'),
    shape,
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    pitch: shape === 'flat' ? 0.02 : pitch,
    overhang: shape === 'flat' ? 0.15 : 0.35,
    ridgeAngle: 0,
    thickness: 0.08,
    material: mat(shape === 'flat' ? 'roof-metal' : 'roof-tiles'),
    cutouts: [],
  })
}

export function addSlab(level: Level, polygon: readonly Vec2[], top = 0.02): void {
  if (polygon.length < 3) return
  level.slabs.push({
    id: newId('slab'),
    polygon: polygon.map((point) => ({ x: point.x, y: point.y })),
    thickness: 0.16,
    top,
    material: mat('concrete'),
  })
}

export function addRailing(level: Level, points: readonly Vec2[]): void {
  if (points.length < 2) return
  addWallChain(level, points, {
    kind: 'railing',
    height: 1.05,
    thickness: 0.06,
    left: mat('metal-black'),
    right: mat('metal-black'),
  })
}

export function addColumn(level: Level, x: number, y: number): void {
  level.columns.push({
    id: newId('column'),
    position: { x, y },
    size: 0.28,
    round: true,
    material: mat('concrete'),
  })
}

export function addStair(level: Level, x: number, y: number, rotation = 0): void {
  level.stairs.push({
    id: newId('stair'),
    shape: 'straight',
    position: { x, y },
    rotation,
    width: 1,
    rise: level.height,
    turnLeft: false,
    material: mat('oak-planks'),
    railing: true,
  })
}

export function fillGround(project: Project, layer: GroundLayer): void {
  const terrain = project.terrain
  if (!terrain || terrain.resolution < 1) return
  const index = GROUND_LAYERS.indexOf(layer)
  if (index < 0) return
  const weights = decodeSplat(terrain.splat, splatLength(terrain))
  const samples = (terrain.resolution + 1) * (terrain.resolution + 1)
  const layers = GROUND_LAYERS.length
  if (weights.length < samples * layers) return
  for (let i = 0; i < samples; i++) {
    const base = i * layers
    for (let layerIndex = 0; layerIndex < layers; layerIndex++) weights[base + layerIndex] = layerIndex === index ? 255 : 0
  }
  terrain.splat = encodeSplat(weights)
}

export function garden(project: Project, seed: number): void {
  try {
    generateGarden(project, seed)
  } catch {
    /* a garden that cannot fit the plot leaves the house intact */
  }
}

export function addTree(project: Project, x: number, y: number, species = 'olive'): void {
  project.terrain.plants.push({
    id: newId('plant'),
    species,
    position: { x, y },
    scale: 1,
    rotation: 0.4,
  })
}

export function addPool(project: Project, polygon: readonly Vec2[]): void {
  if (polygon.length < 3) return
  project.terrain.water.push({
    id: newId('water'),
    kind: 'pool',
    polygon: polygon.map((point) => ({ x: point.x, y: point.y })),
    level: 0,
    depth: 1.35,
  })
}
