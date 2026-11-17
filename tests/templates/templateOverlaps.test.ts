import { describe, expect, it } from 'vitest'
import '../../src/catalog'
import { itemOverlaps } from '../../src/model/clearance'
import { TEMPLATES } from '../../src/templates'

describe('template furniture', () => {
  for (const template of TEMPLATES) {
    it(`${template.id}: no solid item clips another item or a wall`, () => {
      const project = template.create()
      for (const level of project.levels) {
        const name = (id: string) => level.items.find((item) => item.id === id)?.catalogId ?? id
        const report = itemOverlaps(level)
        expect({
          level: level.name,
          pairs: report.pairs.map(([a, b]) => [name(a), name(b)]),
          walls: report.walls.map((hit) => name(hit.itemId)),
        }).toEqual({ level: level.name, pairs: [], walls: [] })
      }
    })
  }
})
