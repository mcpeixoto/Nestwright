import { newId } from '../model/ids'
import { dist } from '../model/geometry'
import { PLANT_SPECIES, scatterPoints, speciesProfile, type PlantSpecies } from '../model/terrain'
import type { Vec2 } from '../model/types'
import { useStore } from '../store'
import { registerShortcut } from '../ui/shortcuts'
import { allowDab, getBrush, setBrush } from './brushState'
import { strokeCircle } from './chain'
import { icon } from './icons'
import { registerTool } from './registry'

let painting = false
let armed = false
let dab = 1

export function plantPointer(phase: 'down' | 'move' | 'up', point: Vec2, shift: boolean): void {
  if (phase === 'up') {
    painting = false
    return
  }
  armed = true
  if (phase === 'down') painting = true
  if (!painting || !allowDab(48)) return
  const brush = getBrush()
  const profile = speciesProfile(brush.species)
  useStore.getState().apply(shift ? 'Erase plants' : 'Plant', (draft) => {
    const terrain = draft.terrain
    if (shift) {
      terrain.plants = terrain.plants.filter((plant) => dist(plant.position, point) > brush.radius)
      return
    }
    const wanted = Math.max(1, Math.round(brush.density * Math.PI * brush.radius * brush.radius))
    const count = Math.min(phase === 'down' ? 140 : 28, wanted)
    const existing = terrain.plants.filter((plant) => plant.species === brush.species).map((plant) => plant.position)
    dab = (dab + 0x9e3779b9) >>> 0
    const spots = scatterPoints(point, brush.radius, count, profile.spacing, dab, existing)
    for (const spot of spots) {
      const spin = ((dab = (dab + 1) >>> 0) % 1000) / 1000
      terrain.plants.push({
        id: newId('plant'),
        species: brush.species,
        position: { x: spot.x, y: spot.y },
        scale: 0.75 + spin * 0.5,
        rotation: spin * Math.PI * 2,
      })
    }
  })
}

registerShortcut({
  id: 'tool-plant',
  keys: 'p',
  description: 'Plant brush',
  run: () => useStore.getState().setTool('plant-brush'),
})

export function selectSpecies(species: string): void {
  const known = (PLANT_SPECIES as readonly string[]).includes(species) ? (species as PlantSpecies) : 'oak'
  setBrush({ species: known, density: speciesProfile(known).density })
}

registerTool({
  id: 'plant-brush',
  label: 'Plants',
  shortcut: 'P',
  group: 'outside',
  cursor: 'crosshair',
  icon: icon('<path d="M12 21V10"/><path d="M12 14c-3-1-5-4-5-7 3 0 5 2 5 4 0-2 2-4 5-4 0 3-2 6-5 7z"/>'),
  activate() {
    painting = false
    armed = false
  },
  deactivate() {
    painting = false
  },
  onPointerDown(ctx) {
    plantPointer('down', ctx.raw, ctx.shift)
  },
  onPointerMove(ctx) {
    plantPointer('move', ctx.raw, ctx.shift)
  },
  onPointerUp() {
    plantPointer('up', { x: 0, y: 0 }, false)
  },
  drawOverlay(ctx2d, ctx) {
    if (!armed) return
    ctx2d.save()
    ctx2d.strokeStyle = ctx.shift ? '#d4655a' : '#3d6b3a'
    ctx2d.lineWidth = 1.5
    strokeCircle(ctx2d, (p) => ctx.transform.worldToScreen(p), ctx.raw, getBrush().radius)
    ctx2d.restore()
  },
})
