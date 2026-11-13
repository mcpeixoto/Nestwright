import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLevel, createProject } from '../../src/model/defaults'
import { pointInPolygon } from '../../src/model/geometry'
import { addWallChain, moveRoom } from '../../src/model/ops'
import { outerOutline } from '../../src/model/roofs'
import { detectRooms, ensureRoomRecords } from '../../src/model/rooms'
import { clampBrushHit } from '../../src/model/brushClamp'
import { integrateWalk } from '../../src/model/walkMove'
import type { Item } from '../../src/model/types'
import { createSampleProject } from '../../src/sample'
import { useStore } from '../../src/store'
import { listTools } from '../../src/tools'
import { duplicateShortcutChords, listShortcuts } from '../../src/ui/shortcuts'
import '../../src/ui/builtinShortcuts'
import '../../src/ui/panels/EnvironmentPanel'
import '../../src/ui/panels/OutsidePanel'
import '../../src/ui/panels/library'
import '../../src/view3d/layers/gizmo'

function itemAt(x: number, y: number): Item {
  return {
    id: 'item_room',
    catalogId: 'sofa-3',
    position: { x, y },
    elevation: 0,
    rotation: 0,
    size: { w: 1, d: 1, h: 1 },
    materials: {},
    params: {},
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('qa wave 1', () => {
  it('walks forward and stops at a wall', () => {
    const open = integrateWalk({
      x: 0,
      y: 0,
      yaw: 0,
      forward: 1,
      strafe: 0,
      speed: 2,
      dt: 0.05,
      radius: 0.2,
      segments: [],
    })
    expect(open.x).toBeCloseTo(0)
    expect(open.y).toBeCloseTo(-0.1)

    const blocked = integrateWalk({
      x: 0,
      y: 0,
      yaw: 0,
      forward: 1,
      strafe: 0,
      speed: 2,
      dt: 0.05,
      radius: 0.25,
      segments: [{ a: { x: -3, y: -0.2 }, b: { x: 3, y: -0.2 }, halfWidth: 0.15 }],
    })
    expect(blocked.y).toBeGreaterThan(-0.05)
  })

  it('outlines the whole sample house, not one room', () => {
    const level = createSampleProject().levels[0]
    expect(level).toBeTruthy()
    if (!level) return
    const outline = outerOutline(level)
    expect(pointInPolygon({ x: 8, y: 6 }, outline)).toBe(true)
    expect(pointInPolygon({ x: 8, y: 2 }, outline)).toBe(true)
    expect(pointInPolygon({ x: 12, y: 4 }, outline)).toBe(false)
    const xs = outline.map((point) => point.x)
    const ys = outline.map((point) => point.y)
    expect(Math.min(...xs)).toBeLessThan(-0.05)
    expect(Math.max(...xs)).toBeGreaterThan(10.05)
    expect(Math.min(...ys)).toBeLessThan(-0.05)
    expect(Math.max(...ys)).toBeGreaterThan(8.05)
  })

  it('clamps brush hits onto the plot and drops the distant ground', () => {
    const plot = { width: 40, depth: 30 }
    expect(clampBrushHit({ x: 2, y: 3 }, plot)).toEqual({ x: 2, y: 3 })
    expect(clampBrushHit({ x: 20.4, y: 0 }, plot)).toEqual({ x: 20, y: 0 })
    expect(clampBrushHit({ x: 0, y: -27 }, plot)).toBeNull()
    expect(clampBrushHit({ x: Number.NaN, y: 0 }, plot)).toBeNull()
  })

  it('moves a room, its contents, and shared walls together', () => {
    const level = createLevel('G', 0)
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
      { x: 0, y: 0 },
    ])
    addWallChain(level, [
      { x: 4, y: 0 },
      { x: 4, y: 6 },
    ])
    const left = detectRooms(level).find((room) => room.centroid.x < 4)
    const shared = level.walls.find((wall) => Math.abs(wall.a.x - 4) < 1e-6 && Math.abs(wall.b.x - 4) < 1e-6)
    const far = level.walls.find((wall) => Math.abs(wall.a.x - 8) < 1e-6 && Math.abs(wall.b.x - 8) < 1e-6)
    expect(left).toBeTruthy()
    expect(shared).toBeTruthy()
    expect(far).toBeTruthy()
    if (!left || !shared || !far) return
    level.items.push(itemAt(2, 3))
    moveRoom(level, left.key, { x: 1, y: 0 })
    expect(shared.a.x).toBeCloseTo(5)
    expect(shared.b.x).toBeCloseTo(5)
    expect(far.a.x).toBeCloseTo(8)
    expect(far.b.x).toBeCloseTo(8)
    expect(level.items[0]?.position).toEqual({ x: 3, y: 3 })
  })

  it('gives each new room one name and stores it', () => {
    const level = createLevel('G', 0)
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 0 },
    ])
    addWallChain(level, [
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ])
    const first = detectRooms(level)
    expect(first.length).toBeGreaterThan(1)
    const names = first.map((room) => room.name)
    expect(new Set(names).size).toBe(names.length)
    ensureRoomRecords(level)
    expect(level.rooms.map((room) => room.name).sort()).toEqual([...names].sort())
    const second = level.rooms[1]
    const firstName = level.rooms[0]?.name
    expect(second && firstName).toBeTruthy()
    if (!second || !firstName) return
    second.name = firstName
    const again = detectRooms(level)
    const againNames = again.map((room) => room.name)
    expect(new Set(againNames).size).toBe(againNames.length)
    expect(again.find((room) => room.key === second.key)?.name).not.toBe(firstName)
    ensureRoomRecords(level)
    const stored = level.rooms.map((room) => room.name)
    expect(new Set(stored).size).toBe(stored.length)
    expect(detectRooms(level).map((room) => room.name).sort()).toEqual([...stored].sort())
  })

  it('keeps one undo step for a whole stroke', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    useStore.getState().setProject(createProject('Blank', 'house'))
    useStore.getState().beginStroke('Sculpt terrain')
    useStore.getState().apply('Sculpt terrain', (draft) => {
      draft.name = 'A'
    })
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z'))
    useStore.getState().apply('Sculpt terrain', (draft) => {
      draft.name = 'B'
    })
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().project.name).toBe('B')
    useStore.getState().endStroke()
    vi.setSystemTime(new Date('2026-01-01T00:00:06Z'))
    useStore.getState().apply('Sculpt terrain', (draft) => {
      draft.name = 'C'
    })
    expect(useStore.getState().past).toHaveLength(2)
    useStore.getState().undo()
    expect(useStore.getState().project.name).toBe('B')
  })

  it('registers each shortcut once', () => {
    const chords = listShortcuts().map((shortcut) => shortcut.keys.toLowerCase())
    expect(duplicateShortcutChords()).toEqual([])
    expect(new Set(chords).size).toBe(chords.length)
    const labels = listTools()
      .map((tool) => tool.shortcut?.toLowerCase())
      .filter((shortcut): shortcut is string => Boolean(shortcut))
    expect(new Set(labels).size).toBe(labels.length)
    const byId = Object.fromEntries(listShortcuts().map((shortcut) => [shortcut.id, shortcut.keys.toLowerCase()]))
    expect(byId['tool-plant']).toBe('t')
    expect(byId['tool-fence']).toBe('shift+f')
    expect(byId['tool-ground']).toBe('shift+g')
    expect(byId['gizmo-move']).toBe('g')
    expect(byId['gizmo-rotate']).toBe('e')
    expect(byId['fit']).toBe('f')
    expect(byId['tool-paint']).toBe('p')
  })
})
