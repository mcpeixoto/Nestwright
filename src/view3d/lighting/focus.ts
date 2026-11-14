import { pointInPolygon } from '../../model/geometry'
import { detectRooms } from '../../model/rooms'
import type { Level, Project, Room } from '../../model/types'

/** Margin of terrain and trees shadowed around the plot, metres. */
export const PLOT_MARGIN = 30
const FAR_MIN = 25
const FAR_MAX = 320

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface ShadowFocus {
  /** Distance to the nearest shadowed content, metres. */
  start: number
  /** Far end of the last cascade, metres. */
  far: number
  /** Indoors: the room's reach from anywhere inside it. Null outdoors. */
  focus: number | null
  indoor: boolean
  roomName: string | null
}

export interface FocusView {
  activeLevelId: string
  levelDisplay: string
}

interface Box {
  min: Point3
  max: Point3
}

const roomCache = new WeakMap<Level, Room[]>()

function roomsOf(level: Level): Room[] {
  let rooms = roomCache.get(level)
  if (!rooms) {
    try {
      rooms = detectRooms(level)
    } catch {
      rooms = []
    }
    roomCache.set(level, rooms)
  }
  return rooms
}

function shownLevels(project: Project, view: FocusView): Level[] {
  const active = project.levels.find((level) => level.id === view.activeLevelId)
  const elev = active?.elevation ?? 0
  return project.levels.filter((level) => {
    if (view.levelDisplay === 'current') return level.id === view.activeLevelId
    if (view.levelDisplay !== 'all' && level.elevation > elev + 1e-3) return false
    return true
  })
}

function houseBox(levels: readonly Level[]): Box | null {
  let box: Box | null = null
  for (const level of levels) {
    for (const wall of level.walls) {
      const top = level.elevation + (Number.isFinite(wall.height) ? wall.height : level.height)
      for (const p of [wall.a, wall.b]) {
        if (!box) {
          box = { min: { x: p.x, y: level.elevation, z: p.y }, max: { x: p.x, y: top, z: p.y } }
          continue
        }
        box.min.x = Math.min(box.min.x, p.x)
        box.min.z = Math.min(box.min.z, p.y)
        box.min.y = Math.min(box.min.y, level.elevation)
        box.max.x = Math.max(box.max.x, p.x)
        box.max.z = Math.max(box.max.z, p.y)
        box.max.y = Math.max(box.max.y, top)
      }
    }
  }
  return box
}

function distToBox(p: Point3, box: Box): number {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x)
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y)
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z)
  return Math.hypot(dx, dy, dz)
}

function farthestCorner(p: Point3, box: Box): number {
  const dx = Math.max(Math.abs(p.x - box.min.x), Math.abs(p.x - box.max.x))
  const dy = Math.max(Math.abs(p.y - box.min.y), Math.abs(p.y - box.max.y))
  const dz = Math.max(Math.abs(p.z - box.min.z), Math.abs(p.z - box.max.z))
  return Math.hypot(dx, dy, dz)
}

/** The room the camera stands in: inside its polygon, between the floor and the next level. */
export function roomAt(project: Project, view: FocusView, cam: Point3): { room: Room; level: Level } | null {
  for (const level of shownLevels(project, view)) {
    const height = level.height > 0 ? level.height : 3
    if (cam.y < level.elevation - 0.05 || cam.y > level.elevation + height + 0.05) continue
    for (const room of roomsOf(level)) {
      if (pointInPolygon({ x: cam.x, y: cam.z }, room.polygon)) return { room, level }
    }
  }
  return null
}

/**
 * What the sun cascades should cover from this camera. Outdoors: the plot plus
 * PLOT_MARGIN, split from the nearest content. Indoors: all but the last cascade fit the
 * room, so window light on the floor gets the full map resolution.
 */
export function shadowFocus(project: Project, view: FocusView, cam: Point3, near: number): ShadowFocus {
  const levels = shownLevels(project, view)
  const house = houseBox(levels) ?? { min: { x: -4, y: 0, z: -4 }, max: { x: 4, y: 3, z: 4 } }
  const halfW = Math.max(0, (project.terrain?.width ?? 0) * 0.5)
  const halfD = Math.max(0, (project.terrain?.depth ?? 0) * 0.5)
  const content: Box = {
    min: { x: Math.min(house.min.x, -halfW), y: Math.min(house.min.y, 0) - 1, z: Math.min(house.min.z, -halfD) },
    max: { x: Math.max(house.max.x, halfW), y: house.max.y + 3, z: Math.max(house.max.z, halfD) },
  }
  const reach: Box = {
    min: { x: content.min.x - PLOT_MARGIN, y: content.min.y, z: content.min.z - PLOT_MARGIN },
    max: { x: content.max.x + PLOT_MARGIN, y: content.max.y + 10, z: content.max.z + PLOT_MARGIN },
  }
  const outdoorFar = Math.min(FAR_MAX, Math.max(FAR_MIN, farthestCorner(cam, reach)))
  const hit = roomAt(project, view, cam)
  if (hit) {
    const poly = hit.room.polygon
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of poly) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const height = hit.level.height > 0 ? hit.level.height : 3
    // Diagonal of the room's box: the farthest floor point seen from anywhere inside it.
    const diag = Math.hypot(maxX - minX, maxY - minY, height)
    const focus = Math.min(30, Math.max(3, diag + 0.5))
    const far = Math.min(outdoorFar, Math.max(focus * 2.2, farthestCorner(cam, house) + 20))
    return { start: near, far, focus, indoor: true, roomName: hit.room.name }
  }
  // Only a camera above everything (aerial) has empty space in front of it; at eye level
  // outside the plot the hedge or lawn right in front still wants the sharp cascade.
  const start = cam.y > content.max.y ? Math.max(near, distToBox(cam, content)) : near
  return { start, far: outdoorFar, focus: null, indoor: false, roomName: null }
}
