import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../../src/model/geometry'
import { detectRooms } from '../../src/model/rooms'
import { TEMPLATES, beachHouse, familyHouse } from '../../src/templates'
import { roomCameraPose } from '../../src/model/roomCamera'
import views from '../../scripts/visual/views.json'
import { TEMPLATE_IDS, contactHtml, parseArgs, seatLook, validateViews } from '../../scripts/visual/spec.mjs'

interface OrbitView {
  name: string
  template: string
  time: number
  quality: string
  showRoofs?: boolean
  levelDisplay?: string
  activeLevel?: string
  autoLights?: boolean
  level?: string
  camera:
    | { kind: 'room'; room: string; eye: number; look: string }
    | { kind: 'orbit'; position: number[]; target: number[] }
}

const shots = views as OrbitView[]

function byName(name: string): OrbitView {
  const view = shots.find((item) => item.name === name)
  if (!view) throw new Error(name)
  return view
}

describe('visual views', () => {
  it('accepts the ten baseline views and rejects a bad one', () => {
    expect(TEMPLATE_IDS).toEqual(TEMPLATES.map((item) => item.id))
    expect(validateViews(views)).toEqual([])
    expect(shots).toHaveLength(10)
    expect(validateViews([{ name: 'nope', template: 'missing', time: 10, quality: 'high', camera: { kind: 'orbit', position: [0, 0, 0], target: [0, 1, 0] } }])).not.toEqual([])
  })

  it('locks the clocks and templates from the brief', () => {
    expect(byName('living-room')).toMatchObject({ template: 'family', time: 15.5, level: 'Ground' })
    expect(byName('kitchen')).toMatchObject({ template: 'family', time: 11 })
    expect(byName('bathroom')).toMatchObject({ template: 'family', time: 14, level: 'Upper' })
    expect(byName('upper-bedroom')).toMatchObject({ template: 'family', time: 15.5, level: 'Upper' })
    expect(byName('aerial-cutaway')).toMatchObject({
      template: 'family',
      time: 13,
      showRoofs: false,
      levelDisplay: 'all',
      activeLevel: 'Upper',
    })
    expect(byName('front-facade')).toMatchObject({ template: 'family', time: 10 })
    expect(byName('terrace-pool')).toMatchObject({ template: 'family', time: 17 })
    expect(byName('garden-wide').template).toBe('beach')
    expect(byName('garden-wide').time).toBe(16)
    expect(byName('night-living')).toMatchObject({ template: 'family', time: 22.5, autoLights: true })
    expect(byName('dusk-exterior').time).toBeCloseTo(20 + 50 / 60, 8)
    const front = byName('front-facade')
    if (front.camera.kind !== 'orbit') throw new Error('front camera')
    expect(front.camera.position[1]).toBe(2)
    // South wall centreline is z = -4.1; the outer face is 0.1 m further south.
    expect(Math.abs(front.camera.position[2] - -4.2)).toBeCloseTo(15)
  })

  it('keeps room cameras inside the room and orbit cameras out of walls and plants', () => {
    const family = familyHouse()
    const beach = beachHouse()
    for (const view of shots) {
      const project = view.template === 'beach' ? beach : family
      if (view.camera.kind === 'room') {
        const level = project.levels.find((item) => !view.level || item.name.toLowerCase().includes(view.level.toLowerCase()))
        if (!level) throw new Error(view.name)
        const pose = roomCameraPose(project, level.id, view.camera.room, { eye: view.camera.eye })
        expect(pose, view.name).not.toBeNull()
        continue
      }
      const [x, y, z] = view.camera.position
      const point = { x, y: z }
      for (const level of project.levels) {
        for (const room of detectRooms(level)) {
          expect(pointInPolygon(point, room.polygon), view.name).toBe(false)
        }
      }
      for (const body of project.terrain.water) {
        expect(pointInPolygon(point, body.polygon), view.name).toBe(false)
      }
      if (y < 8) {
        for (const plant of project.terrain.plants) {
          const gap = Math.hypot(point.x - plant.position.x, point.y - plant.position.y)
          expect(gap, `${view.name} near ${plant.species}`).toBeGreaterThan(1.2)
        }
      }
    }
  })

  it('lowers a level gaze so the orbit cap does not lift the camera', () => {
    const seated = seatLook([0, 2, -19.2], [0, 2, -4.1])
    const horiz = 15.1
    const dy = 2 - (seated[1] ?? 0)
    const phi = Math.atan2(horiz, dy)
    expect(phi).toBeLessThan(Math.PI * 0.48)
    expect(seatLook([0, 10, 0], [0, 0, 0])[1]).toBe(0)
  })

  it('parses harness flags and builds a contact sheet', () => {
    expect(parseArgs(['--serve', '--out', 'shots', '--views', 'a, b'])).toMatchObject({
      serve: true,
      out: 'shots',
      views: ['a', 'b'],
      url: 'http://localhost:5181',
    })
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/)
    const html = contactHtml({
      shots: [{ name: 'living-room', src: 'living-room.png', report: { fpsAvg: 60, p50: 16, width: 100, height: 50, backend: 'webgl2' } }],
      refs: null,
    })
    expect(html).toContain('living-room.png')
    expect(html).not.toContain('<h2>Reference</h2>')
    const withRefs = contactHtml({
      shots: [],
      refs: [{ name: 'ss_1.jpg', src: '../ss_1.jpg' }],
    })
    expect(withRefs).toContain('<h2>Reference</h2>')
    expect(withRefs).toContain('../ss_1.jpg')
    expect(contactHtml({ shots: [{ name: 'a<b>', error: '<bad>' }], refs: null })).toContain('a&lt;b&gt;')
  })
})
