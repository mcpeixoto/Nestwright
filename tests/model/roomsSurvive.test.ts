import { describe, expect, it } from 'vitest'
import { createLevel, createProject, createWall } from '../../src/model/defaults'
import { addWallChain, deleteEntities, moveRoom, moveWall, moveWallEndpoint } from '../../src/model/ops'
import { intersectionArea } from '../../src/model/polygon'
import { detectRooms, ensureRoomRecords, reconcileProjectRooms } from '../../src/model/rooms'
import type { Level, Project, Room, Vec2 } from '../../src/model/types'
import { splitWall } from '../../src/model/walls'
import { useStore } from '../../src/store'

function loop(level: Level, points: Vec2[]): string[] {
  const ids: string[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    const wall = createWall(a, b)
    level.walls.push(wall)
    ids.push(wall.id)
  }
  return ids
}

function rect(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

const L_SHAPE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 6 },
  { x: 0, y: 6 },
]

/** A project whose ground floor holds one named room bounded by `outline`. */
function projectWith(outline: Vec2[]): { project: Project; level: Level; walls: string[] } {
  const project = createProject('Rooms', 'house')
  const level = project.levels[0]
  if (!level) throw new Error('no level')
  const walls = loop(level, outline)
  ensureRoomRecords(level)
  const record = level.rooms[0]
  if (!record) throw new Error('no room')
  record.name = 'Studio'
  record.type = 'office'
  record.floor = { id: 'terrazzo', tint: '#ccbbaa' }
  record.ceiling = { id: 'wood-slats' }
  return { project, level, walls }
}

/** What the store does around a recipe: run it, then reconcile against the old state. */
function edit(project: Project, recipe: (level: Level) => void): Map<string, string> {
  const prev = structuredClone(project)
  const level = project.levels[0]
  if (!level) throw new Error('no level')
  recipe(level)
  return reconcileProjectRooms(prev, project)
}

function roomNamed(level: Level, name: string): Room {
  const room = detectRooms(level).find((item) => item.name === name)
  if (!room) throw new Error(`no room named ${name}: ${detectRooms(level).map((r) => r.name).join(', ')}`)
  return room
}

describe('intersectionArea', () => {
  it('measures overlap of convex rings and ignores shared edges', () => {
    expect(intersectionArea(rect(0, 0, 4, 4), rect(2, 2, 6, 6))).toBeCloseTo(4)
    expect(intersectionArea(rect(0, 0, 4, 4), rect(4, 0, 8, 4))).toBeCloseTo(0)
    expect(intersectionArea(rect(0, 0, 4, 4), rect(9, 9, 10, 10))).toBe(0)
    // Winding does not matter.
    expect(intersectionArea(rect(0, 0, 4, 4).reverse(), rect(1, 1, 3, 3))).toBeCloseTo(4)
  })

  it('is exact for concave rings', () => {
    expect(intersectionArea(L_SHAPE, L_SHAPE)).toBeCloseTo(27)
    // The square pokes into the L's notch; only the part inside the L counts.
    expect(intersectionArea(L_SHAPE, rect(2, 2, 4, 4))).toBeCloseTo(3)
    expect(intersectionArea(rect(2, 2, 4, 4), L_SHAPE)).toBeCloseTo(3)
    expect(intersectionArea(L_SHAPE, rect(4, 4, 6, 6))).toBeCloseTo(0)
    const mirrored = L_SHAPE.map((p) => ({ x: 6 - p.x, y: 6 - p.y }))
    // An L and its 180° turn share two 3×3 squares.
    expect(intersectionArea(L_SHAPE, mirrored)).toBeCloseTo(18)
  })
})

describe('room records survive edits', () => {
  it('splitting a wall keeps the name, type and materials', () => {
    const { project, level, walls } = projectWith(rect(0, 0, 4, 4))
    const before = detectRooms(level)[0]?.key
    const rekey = edit(project, (draft) => splitWall(draft, walls[0] ?? '', { x: 2, y: 0 }))
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    const room = rooms[0]
    expect(room?.key).not.toBe(before)
    expect(room?.name).toBe('Studio')
    expect(room?.type).toBe('office')
    expect(room?.floor).toEqual({ id: 'terrazzo', tint: '#ccbbaa' })
    expect(room?.ceiling).toEqual({ id: 'wood-slats' })
    expect(level.rooms.map((item) => item.key)).toEqual([room?.key])
    expect(rekey.get(before ?? '')).toBe(room?.key)
  })

  it('dividing a room: the larger part keeps it, the smaller copies materials under a fresh name', () => {
    const { project, level } = projectWith(rect(0, 0, 6, 4))
    edit(project, (draft) => {
      addWallChain(draft, [
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ])
    })
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(2)
    const big = roomNamed(level, 'Studio')
    expect(big.area).toBeCloseTo(16)
    const small = rooms.find((room) => room.key !== big.key)
    expect(small?.area).toBeCloseTo(8)
    expect(small?.name).toBe('Office 1')
    expect(small?.type).toBe('office')
    expect(small?.floor).toEqual({ id: 'terrazzo', tint: '#ccbbaa' })
    expect(small?.ceiling).toEqual({ id: 'wood-slats' })
    expect(level.rooms).toHaveLength(2)
  })

  it('deleting the dividing wall keeps the larger room record', () => {
    const { project, level } = projectWith(rect(0, 0, 6, 4))
    let divider: string[] = []
    edit(project, (draft) => {
      divider = addWallChain(draft, [
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ])
    })
    const small = detectRooms(level).find((room) => room.name !== 'Studio')
    const smallRecord = level.rooms.find((room) => room.key === small?.key)
    if (!smallRecord) throw new Error('no small record')
    smallRecord.name = 'Closet'
    smallRecord.floor = { id: 'tiles-grey' }
    edit(project, (draft) => deleteEntities(draft, divider))
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.name).toBe('Studio')
    expect(rooms[0]?.floor).toEqual({ id: 'terrazzo', tint: '#ccbbaa' })
    expect(rooms[0]?.area).toBeCloseTo(24)
  })

  it('merging two rooms: the larger old room wins whichever is listed first', () => {
    const { project, level } = projectWith(rect(0, 0, 6, 4))
    let divider: string[] = []
    edit(project, (draft) => {
      divider = addWallChain(draft, [
        { x: 2, y: 0 },
        { x: 2, y: 4 },
      ])
    })
    // The 8 m² part on the left is now the smaller one; give it the name that sorts first.
    const small = detectRooms(level).find((room) => room.area < 10)
    const record = level.rooms.find((room) => room.key === small?.key)
    if (!record) throw new Error('no small record')
    record.name = 'Alcove'
    edit(project, (draft) => deleteEntities(draft, divider))
    expect(detectRooms(level).map((room) => room.name)).toEqual(['Studio'])
  })

  it('moving walls or the whole room keeps the record', () => {
    const { project, level, walls } = projectWith(rect(0, 0, 4, 4))
    const key = detectRooms(level)[0]?.key
    edit(project, (draft) => moveWall(draft, walls[1] ?? '', { x: 1, y: 0 }))
    edit(project, (draft) => moveWallEndpoint(draft, walls[2] ?? '', 'b', { x: -0.5, y: 4.5 }))
    edit(project, (draft) => moveRoom(draft, key ?? '', { x: 3, y: 2 }))
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.key).toBe(key)
    expect(rooms[0]?.name).toBe('Studio')
    expect(rooms[0]?.floor.id).toBe('terrazzo')
    expect(rooms[0]?.centroid.x).toBeGreaterThan(4)
    expect(level.rooms).toHaveLength(1)
  })

  it('wishes and room requirements follow the re-keyed room', () => {
    const { project, level, walls } = projectWith(rect(0, 0, 6, 4))
    const key = detectRooms(level)[0]?.key ?? ''
    project.wishes.push({
      id: 'w1',
      author: 'Ada',
      target: { kind: 'room', key },
      reaction: 'love',
      note: 'Big window',
      createdAt: 1,
    })
    project.requirements.push({ id: 'r1', roomKey: key, rule: { kind: 'min-area', area: 10 }, text: 'Roomy' })
    edit(project, (draft) => splitWall(draft, walls[0] ?? '', { x: 3, y: 0 }))
    const split = detectRooms(level)[0]?.key
    expect(split).not.toBe(key)
    const wish = project.wishes[0]
    expect(wish?.target.kind === 'room' && wish.target.key).toBe(split)
    expect(project.requirements[0]?.roomKey).toBe(split)

    // Dividing the room sends them to the part that kept the name.
    edit(project, (draft) => {
      addWallChain(draft, [
        { x: 4.5, y: 0 },
        { x: 4.5, y: 4 },
      ])
    })
    const studio = roomNamed(level, 'Studio')
    expect(wish?.target.kind === 'room' && wish.target.key).toBe(studio.key)
    expect(project.requirements[0]?.roomKey).toBe(studio.key)
  })

  it('an L-shaped room divided across its arm keeps the record on the larger part', () => {
    const { project, level } = projectWith(L_SHAPE)
    expect(detectRooms(level)[0]?.area).toBeCloseTo(27)
    edit(project, (draft) => {
      addWallChain(draft, [
        { x: 0, y: 3 },
        { x: 3, y: 3 },
      ])
    })
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(2)
    const studio = roomNamed(level, 'Studio')
    expect(studio.area).toBeCloseTo(18)
    expect(rooms.find((room) => room.key !== studio.key)?.name).toBe('Office 1')
  })

  it('needs at least half of the smaller room to overlap', () => {
    const prev = createLevel('G', 0)
    loop(prev, rect(0, 0, 4, 4))
    ensureRoomRecords(prev)
    const record = prev.rooms[0]
    if (!record) throw new Error('no room')
    record.name = 'Den'

    const shifted = (x0: number): Level => {
      const next = createLevel('G', 0)
      next.id = prev.id
      next.rooms = structuredClone(prev.rooms)
      loop(next, rect(x0, 0, x0 + 4, 4))
      return next
    }
    // 12 of 16 m² shared: same room, rebuilt.
    const near = shifted(1)
    ensureRoomRecords(near, prev)
    expect(detectRooms(near)[0]?.name).toBe('Den')
    // 4 of 16 m²: a different room.
    const far = shifted(3)
    ensureRoomRecords(far, prev)
    expect(detectRooms(far)[0]?.name).toBe('Living 1')
  })
})

describe('store keeps room details across an apply', () => {
  it('splitting a wall keeps the name, and the selection follows the room', () => {
    useStore.getState().setProject(createProject('Store', 'house'))
    let wallId = ''
    useStore.getState().apply('Draw room', (draft) => {
      const level = draft.levels[0]
      if (level) wallId = loop(level, rect(0, 0, 4, 4))[0] ?? ''
    })
    const levelOf = () => useStore.getState().project.levels[0]
    const firstKey = levelOf()?.rooms[0]?.key ?? ''
    expect(firstKey).not.toBe('')
    useStore.getState().apply('Rename room', (draft) => {
      const props = draft.levels[0]?.rooms.find((room) => room.key === firstKey)
      if (props) props.name = 'Pantry'
    })
    useStore.getState().select([firstKey])
    useStore.getState().apply('Split wall', (draft) => {
      const level = draft.levels[0]
      if (level) splitWall(level, wallId, { x: 1, y: 0 })
    })
    const level = levelOf()
    if (!level) throw new Error('no level')
    const rooms = detectRooms(level)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.name).toBe('Pantry')
    expect(rooms[0]?.key).not.toBe(firstKey)
    expect(level.rooms.map((room) => room.key)).toEqual([rooms[0]?.key])
    expect(useStore.getState().selection).toEqual([rooms[0]?.key])

    // The re-key is in the recorded patches, so undo brings the old key back.
    useStore.getState().undo()
    const undone = levelOf()
    expect(undone?.rooms.map((room) => room.key)).toEqual([firstKey])
    expect(undone && detectRooms(undone)[0]?.name).toBe('Pantry')
  })
})
