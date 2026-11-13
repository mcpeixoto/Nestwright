import { describe, expect, it } from 'vitest'
import { defaultReturnModules, defaultRunModules, modulesWidth, readKitchen, writeKitchen } from '../../src/model/kitchen'
import type { Item } from '../../src/model/types'

function item(catalogId: string): Item {
  return {
    id: 'item_kitchen',
    catalogId,
    position: { x: 0, y: 0 },
    elevation: 0,
    rotation: 0,
    size: { w: 1, d: 0.6, h: 2.2 },
    materials: {},
    params: {},
  }
}

describe('kitchen', () => {
  it('keeps the run width equal to the sum of the modules', () => {
    const placed = item('kitchen-run')
    const spec = readKitchen(placed.params, 'run')
    expect(modulesWidth(spec.modules)).toBeCloseTo(modulesWidth(defaultRunModules()))
    writeKitchen(placed, spec, 'run')
    expect(placed.size.w).toBeCloseTo(modulesWidth(spec.modules))
    spec.modules[0]!.width = 0.9
    spec.modules.push({ type: 'dishwasher', width: 0.45 })
    writeKitchen(placed, spec, 'run')
    expect(placed.size.w).toBeCloseTo(modulesWidth(spec.modules))
    const again = readKitchen(placed.params, 'run')
    expect(modulesWidth(again.modules)).toBeCloseTo(placed.size.w)
  })

  it('sets an L run depth from the return modules', () => {
    const placed = item('kitchen-l')
    const spec = readKitchen(placed.params, 'l')
    expect(spec.returns).toHaveLength(defaultReturnModules().length)
    writeKitchen(placed, spec, 'l')
    expect(placed.size.w).toBeCloseTo(modulesWidth(spec.modules))
    expect(placed.size.d).toBeCloseTo(modulesWidth(spec.returns))
  })
})
