import { newId } from './ids'
import type {
  Environment,
  Level,
  MaterialRef,
  Opening,
  OpeningType,
  Project,
  ProjectKind,
  Terrain,
  Vec2,
  Wall,
} from './types'
import { GROUND_LAYERS } from './types'

export const DEFAULT_WALL_THICKNESS = 0.2
export const DEFAULT_LEVEL_HEIGHT = 2.7
export const DEFAULT_SLAB = 0.2

export function mat(id: string): MaterialRef {
  return { id }
}

const OPENING_PRESETS: Record<OpeningType, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  'double-door': { width: 1.6, height: 2.1, sill: 0 },
  'sliding-door': { width: 2.4, height: 2.2, sill: 0 },
  'garage-door': { width: 2.5, height: 2.2, sill: 0 },
  arch: { width: 1.2, height: 2.2, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  'fixed-window': { width: 1.2, height: 1.2, sill: 0.9 },
  'tall-window': { width: 1.0, height: 2.3, sill: 0.05 },
  'round-window': { width: 0.8, height: 0.8, sill: 1.4 },
  'corner-window': { width: 1.2, height: 1.5, sill: 0.6 },
}

export function openingSize(type: OpeningType): { width: number; height: number; sill: number } {
  return { ...OPENING_PRESETS[type] }
}

function frameFor(type: OpeningType): MaterialRef {
  if (type === 'window' || type === 'fixed-window' || type === 'tall-window' || type === 'round-window' || type === 'corner-window') {
    return mat('plaster-white')
  }
  if (type === 'garage-door') return mat('metal-black')
  return mat('oak-planks')
}

export function createWall(
  a: Vec2,
  b: Vec2,
  props: Partial<Pick<Wall, 'thickness' | 'height' | 'bulge' | 'left' | 'right' | 'kind'>> = {},
): Wall {
  return {
    id: newId('wall'),
    a: { x: a.x, y: a.y },
    b: { x: b.x, y: b.y },
    thickness: props.thickness ?? DEFAULT_WALL_THICKNESS,
    height: props.height ?? DEFAULT_LEVEL_HEIGHT,
    bulge: props.bulge ?? 0,
    left: props.left ? { ...props.left } : mat('plaster-white'),
    right: props.right ? { ...props.right } : mat('plaster-white'),
    kind: props.kind,
  }
}

export function createOpening(
  type: OpeningType,
  wallId: string,
  offset: number,
  props: Partial<Pick<Opening, 'width' | 'height' | 'sill' | 'flipSide' | 'flipHinge' | 'frame'>> = {},
): Opening {
  const preset = OPENING_PRESETS[type]
  return {
    id: newId('opening'),
    wallId,
    type,
    offset,
    width: props.width ?? preset.width,
    height: props.height ?? preset.height,
    sill: props.sill ?? preset.sill,
    flipSide: props.flipSide,
    flipHinge: props.flipHinge,
    frame: props.frame ? { ...props.frame } : frameFor(type),
  }
}

export function createLevel(name: string, elevation: number): Level {
  return {
    id: newId('level'),
    name,
    elevation,
    height: DEFAULT_LEVEL_HEIGHT,
    slabThickness: DEFAULT_SLAB,
    walls: [],
    openings: [],
    rooms: [],
    stairs: [],
    roofs: [],
    columns: [],
    slabs: [],
    items: [],
    dimensions: [],
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0
    const n = (b0 << 16) | (b1 << 8) | b2
    out += chars[(n >> 18) & 63]
    out += chars[(n >> 12) & 63]
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? chars[n & 63] : '='
  }
  return out
}

/** Flat plot. Every sample is pure lawn so the terrain wave has a valid splat to paint over. */
export function createTerrain(width: number, depth: number, resolution: number): Terrain {
  const samples = (resolution + 1) * (resolution + 1)
  const layers = GROUND_LAYERS.length
  const bytes = new Uint8Array(samples * layers)
  const lawn = GROUND_LAYERS.indexOf('lawn')
  for (let i = 0; i < samples; i++) bytes[i * layers + lawn] = 255
  const halfW = width / 2
  const halfD = depth / 2
  return {
    enabled: true,
    width,
    depth,
    resolution,
    heights: Array.from({ length: samples }, () => 0),
    splat: encodeBase64(bytes),
    plants: [],
    water: [],
    fences: [],
    boundary: [
      { x: -halfW, y: -halfD },
      { x: halfW, y: -halfD },
      { x: halfW, y: halfD },
      { x: -halfW, y: halfD },
    ],
  }
}

export function createEnvironment(): Environment {
  return {
    dayOfYear: 172,
    time: 15.5,
    latitude: 41.15,
    north: 0,
    weather: 'clear',
    cloudiness: 0.15,
    autoLights: true,
  }
}

export function createProject(name: string, kind: ProjectKind): Project {
  const now = Date.now()
  return {
    version: 1,
    id: newId('project'),
    name,
    kind,
    createdAt: now,
    updatedAt: now,
    levels: [createLevel('Ground', 0)],
    terrain: createTerrain(kind === 'apartment' ? 24 : 40, kind === 'apartment' ? 24 : 30, 32),
    environment: createEnvironment(),
    assets: [],
    traces: [],
    wishes: [],
    variants: [],
    budget: {
      currency: 'EUR',
      buildCostPerM2: 1600,
      finishCostPerM2: {},
    },
    requirements: [],
    units: 'metric',
  }
}
