import { perp, pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import type { Level, MaterialRef, RoomProps, Wall } from './types'
import { locateOnWall, wallFrame } from './walls'

export type PaintTarget =
  | { kind: 'wall'; id: string; side: 'left' | 'right' }
  | { kind: 'floor'; key: string }
  | { kind: 'ceiling'; key: string }
  | { kind: 'item'; id: string; slot: string }
  | { kind: 'roof'; id: string }

export function copyMaterial(material: MaterialRef): MaterialRef {
  return {
    id: material.id,
    ...(material.tint ? { tint: material.tint } : {}),
    ...(material.scale && material.scale > 0 ? { scale: material.scale } : {}),
  }
}

/** Which side of a→b the point sits on. On the centre line this is `left`. */
export function wallFace(wall: Wall, point: { x: number; y: number }): 'left' | 'right' {
  const frame = wallFrame(wall)
  const loc = locateOnWall(wall, point)
  let tangent = frame.tangents[0] ?? { x: 1, y: 0 }
  for (let i = 0; i < frame.cum.length; i++) {
    const start = frame.cum[i] ?? 0
    const end = frame.cum[i + 1] ?? frame.length
    if (loc.distance >= start - 1e-4 && loc.distance <= end + 1e-4) {
      tangent = frame.tangents[i] ?? tangent
      break
    }
  }
  const left = perp(tangent)
  const vx = point.x - loc.point.x
  const vy = point.y - loc.point.y
  return vx * left.x + vy * left.y >= 0 ? 'left' : 'right'
}

function ensureRoom(level: Level, key: string): RoomProps {
  const existing = level.rooms.find((room) => room.key === key)
  if (existing) return existing
  const detected = detectRooms(level).find((room) => room.key === key)
  const props: RoomProps = {
    key,
    name: detected?.name ?? 'Room',
    type: detected?.type ?? 'other',
    floor: detected?.floor ? copyMaterial(detected.floor) : { id: 'oak-planks' },
    ceiling: detected?.ceiling ? copyMaterial(detected.ceiling) : { id: 'plaster-white' },
    noCeiling: detected?.noCeiling,
  }
  level.rooms.push(props)
  return props
}

export function paintLevel(level: Level, target: PaintTarget, material: MaterialRef): void {
  const next = copyMaterial(material)
  if (target.kind === 'wall') {
    const wall = level.walls.find((entry) => entry.id === target.id)
    if (wall) wall[target.side] = next
    return
  }
  if (target.kind === 'floor' || target.kind === 'ceiling') {
    const room = ensureRoom(level, target.key)
    if (target.kind === 'floor') room.floor = next
    else room.ceiling = next
    return
  }
  if (target.kind === 'roof') {
    const roof = level.roofs.find((entry) => entry.id === target.id)
    if (roof) roof.material = next
    return
  }
  const item = level.items.find((entry) => entry.id === target.id)
  if (item) item.materials[target.slot] = next
}

export function readMaterial(level: Level, target: PaintTarget): MaterialRef | null {
  if (target.kind === 'wall') {
    const wall = level.walls.find((entry) => entry.id === target.id)
    return wall ? copyMaterial(wall[target.side]) : null
  }
  if (target.kind === 'floor' || target.kind === 'ceiling') {
    const detected = detectRooms(level).find((room) => room.key === target.key)
    if (!detected) return null
    return copyMaterial(target.kind === 'floor' ? detected.floor : detected.ceiling)
  }
  if (target.kind === 'roof') {
    const roof = level.roofs.find((entry) => entry.id === target.id)
    return roof ? copyMaterial(roof.material) : null
  }
  const item = level.items.find((entry) => entry.id === target.id)
  if (!item) return null
  return copyMaterial(item.materials[target.slot] ?? { id: 'plaster-white' })
}

export function roofAt(level: Level, point: { x: number; y: number }): string | null {
  for (let i = level.roofs.length - 1; i >= 0; i--) {
    const roof = level.roofs[i]
    if (roof && pointInPolygon(point, roof.outline)) return roof.id
  }
  return null
}
