import type { Level, Vec2 } from './types'

/**
 * Layout of the irradiance probe grid that carries bounce light through a level: where its
 * box sits, how many probes per axis, and where each probe is captured from. Pure; the view
 * bakes and samples it (src/view3d/lighting/probeVolume.ts).
 */

export type ProbeTier = 'medium' | 'high' | 'ultra'

export interface ProbeTierSettings {
  /** Target spacing between probes, metres. */
  spacing: number
  /** Cap on probes per level grid; spacing widens on large levels to stay under it. */
  maxProbes: number
  /** Cube face size of each probe capture (multiple of 4). */
  cubemapSize: number
  /** Probes captured per frame while rebaking after an edit or a change of sky. */
  probesPerFrame: number
  /**
   * Probes per frame for a level's first bake (project load, level switch, tier change).
   * Heavier: until it lands the level has no bounce light at all.
   */
  freshProbesPerFrame: number
  /**
   * Probes per axis the volume's atlas is allocated for. Fixed per tier so a rebake writes
   * in place and the materials never see their texture swapped.
   */
  perAxis: ProbeResolution
}

export const PROBE_TIERS: Record<ProbeTier, ProbeTierSettings> = {
  medium: { spacing: 1, maxProbes: 512, cubemapSize: 8, probesPerFrame: 4, freshProbesPerFrame: 16, perAxis: { x: 24, y: 4, z: 24 } },
  high: { spacing: 0.75, maxProbes: 1024, cubemapSize: 8, probesPerFrame: 8, freshProbesPerFrame: 24, perAxis: { x: 32, y: 5, z: 32 } },
  ultra: { spacing: 0.6, maxProbes: 1600, cubemapSize: 12, probesPerFrame: 8, freshProbesPerFrame: 24, perAxis: { x: 40, y: 6, z: 40 } },
}

/** Low has no probes (hemisphere and environment fill only, as before). */
export function probeTier(tier: string): ProbeTierSettings | null {
  return tier === 'medium' || tier === 'high' || tier === 'ultra' ? PROBE_TIERS[tier] : null
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface ProbeBox {
  min: Vec3
  max: Vec3
}

export interface ProbeResolution {
  x: number
  y: number
  z: number
}

/**
 * World box of a level's probe grid: its walls' plan extent (plan y is world z) from the
 * floor to the floor above. Null for a level without walls.
 */
export function levelProbeBox(level: Pick<Level, 'walls' | 'elevation' | 'height'>): ProbeBox | null {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const wall of level.walls) {
    if (wall.kind === 'railing') continue
    for (const p of [wall.a, wall.b]) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.y)
      maxZ = Math.max(maxZ, p.y)
    }
  }
  if (!(maxX - minX > 0.3) || !(maxZ - minZ > 0.3)) return null
  const height = level.height > 0.5 ? level.height : 2.7
  const elevation = Number.isFinite(level.elevation) ? level.elevation : 0
  return { min: { x: minX, y: elevation, z: minZ }, max: { x: maxX, y: elevation + height, z: maxZ } }
}

/**
 * Probes per axis for `box` at `spacing`, at least 2 per axis (trilinear needs a pair), with
 * the total held under `maxProbes` by widening the spacing evenly, and each axis under
 * `perAxis` (the atlas size).
 */
export function probeResolution(
  box: ProbeBox,
  spacing: number,
  maxProbes: number,
  perAxis: ProbeResolution = { x: 64, y: 16, z: 64 },
): ProbeResolution {
  const size = {
    x: Math.max(0.1, box.max.x - box.min.x),
    y: Math.max(0.1, box.max.y - box.min.y),
    z: Math.max(0.1, box.max.z - box.min.z),
  }
  let step = spacing > 0.05 ? spacing : 1
  const cap = Math.max(8, Math.floor(maxProbes))
  const axis = (length: number, s: number, most: number) => Math.max(2, Math.min(Math.max(2, Math.floor(most)), Math.ceil(length / s)))
  const count = (s: number): ProbeResolution => ({
    x: axis(size.x, s, perAxis.x),
    y: axis(size.y, s, perAxis.y),
    z: axis(size.z, s, perAxis.z),
  })
  let res = count(step)
  for (let i = 0; i < 40 && res.x * res.y * res.z > cap; i++) {
    step *= Math.max(1.02, Math.cbrt((res.x * res.y * res.z) / cap))
    res = count(step)
  }
  return res
}

/** Probe (ix, iy, iz) sits at the centre of its cell, as three's LightProbeGrid lays them out. */
export function probeCellCentre(box: ProbeBox, res: ProbeResolution, ix: number, iy: number, iz: number): Vec3 {
  return {
    x: box.min.x + ((ix + 0.5) * (box.max.x - box.min.x)) / res.x,
    y: box.min.y + ((iy + 0.5) * (box.max.y - box.min.y)) / res.y,
    z: box.min.z + ((iz + 0.5) * (box.max.z - box.min.z)) / res.z,
  }
}

/** Bake order of the capture rows: X fastest, then Z, then Y (the repack pass expects it). */
export function probeIndexCoords(index: number, res: ProbeResolution): { ix: number; iy: number; iz: number } {
  const layer = res.x * res.z
  return { ix: index % res.x, iy: Math.floor(index / layer), iz: Math.floor(index / res.x) % res.z }
}

export interface ProbeWall {
  a: Vec2
  b: Vec2
  thickness: number
}

/** Metres a probe is kept off a wall face, so its cube camera's near plane clears the plaster. */
export const PROBE_WALL_CLEARANCE = 0.15

/**
 * A probe whose cell centre falls inside a wall would look out of both faces at once and
 * leak the light of one room into the next. Move it out of the wall, to the side of the
 * wall's centre line it already sits on, `clearance` off the face. Two passes settle corners
 * where a push out of one wall lands in another.
 */
export function relocateProbe(p: Vec3, walls: readonly ProbeWall[], clearance = PROBE_WALL_CLEARANCE): Vec3 {
  let x = p.x
  let z = p.z
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of walls) {
      const dx = wall.b.x - wall.a.x
      const dz = wall.b.y - wall.a.y
      const len2 = dx * dx + dz * dz
      if (!(len2 > 1e-8)) continue
      const t = Math.min(1, Math.max(0, ((x - wall.a.x) * dx + (z - wall.a.y) * dz) / len2))
      // Only the wall's length: past its ends the probe is beside it, not in it.
      if (t <= 0 || t >= 1) continue
      const len = Math.sqrt(len2)
      const nx = -dz / len
      const nz = dx / len
      const side = (x - wall.a.x) * nx + (z - wall.a.y) * nz
      const keep = Math.max(0.02, (Number.isFinite(wall.thickness) ? wall.thickness : 0.2) / 2) + clearance
      if (Math.abs(side) >= keep) continue
      const sign = side >= 0 ? 1 : -1
      const push = sign * keep - side
      x += nx * push
      z += nz * push
    }
  }
  return { x, y: p.y, z }
}

/** The walls of a level that block light (railings do not). */
export function probeWalls(level: Pick<Level, 'walls'>): ProbeWall[] {
  return level.walls
    .filter((wall) => wall.kind !== 'railing')
    .map((wall) => ({ a: wall.a, b: wall.b, thickness: wall.thickness }))
}

/**
 * Which levels get the fixed probe volumes: the active level first, then the visible level
 * nearest to it in elevation (the one below on a tie, since cutaways hide the one above).
 */
export function probeLevels<T extends { id: string; elevation: number }>(
  levels: readonly T[],
  activeId: string,
  visible: (level: T) => boolean,
  slots: number,
): T[] {
  const active = levels.find((level) => level.id === activeId) ?? levels[0]
  if (!active || slots < 1) return []
  const rest = levels
    .filter((level) => level !== active && visible(level))
    .sort((a, b) => {
      const da = Math.abs(a.elevation - active.elevation)
      const db = Math.abs(b.elevation - active.elevation)
      return da - db || a.elevation - b.elevation
    })
  return [active, ...rest].slice(0, slots)
}
