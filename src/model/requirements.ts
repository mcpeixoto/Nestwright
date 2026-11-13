import { pointInPolygon } from './geometry'
import { detectRooms } from './rooms'
import type { Level, Project, Room, RoomRequirement } from './types'

export interface RequirementStatus {
  requirement: RoomRequirement
  met: boolean
  roomName: string
  detail: string
}

interface Located {
  level: Level
  room: Room
}

function locateRooms(project: Project): Map<string, Located> {
  const found = new Map<string, Located>()
  for (const level of project.levels ?? []) {
    for (const room of detectRooms(level)) {
      if (!found.has(room.key)) found.set(room.key, { level, room })
    }
  }
  return found
}

export function checkRequirements(project: Project): RequirementStatus[] {
  const located = locateRooms(project)
  return (project.requirements ?? []).map((requirement) => {
    const place = located.get(requirement.roomKey)
    if (!place) {
      return { requirement, met: false, roomName: 'Missing room', detail: 'That room is gone' }
    }
    const { level, room } = place
    const rule = requirement.rule
    if (rule.kind === 'min-area') {
      const met = room.area + 1e-6 >= rule.area
      const have = `${room.area.toFixed(1)} m²`
      return {
        requirement,
        met,
        roomName: room.name,
        detail: met ? have : `${have}, needs ${rule.area} m²`,
      }
    }
    const has = level.items.some(
      (item) => item.catalogId === rule.catalogId && pointInPolygon(item.position, room.polygon),
    )
    return {
      requirement,
      met: has,
      roomName: room.name,
      detail: has ? 'In the room' : 'Not in the room',
    }
  })
}

export function unmetRoomKeys(project: Project): Set<string> {
  const keys = new Set<string>()
  for (const status of checkRequirements(project)) {
    if (!status.met) keys.add(status.requirement.roomKey)
  }
  return keys
}
