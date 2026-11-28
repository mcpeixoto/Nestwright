/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { createLevel, createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { useStore } from '../../src/store'
import { matchingInspectorSections } from '../../src/ui/inspector/registry'
import '../../src/ui/inspector/sections/rooms'

it('lists each room with its net area and item count', () => {
  const project = createProject('Rooms', 'house')
  const level = createLevel('G', 0)
  // Wall centre lines 4.2 m apart with 0.2 m walls leave a 4 × 4 m floor.
  const corners = [
    { x: -0.1, y: -0.1 },
    { x: 4.1, y: -0.1 },
    { x: 4.1, y: 4.1 },
    { x: -0.1, y: 4.1 },
  ]
  addWallChain(level, [...corners, corners[0]!], { thickness: 0.2 })
  level.items.push({
    id: 'chair',
    catalogId: 'chair',
    position: { x: 2, y: 2 },
    elevation: 0,
    rotation: 0,
    size: { w: 0.5, d: 0.5, h: 0.9 },
    materials: {},
    params: {},
  })
  project.levels = [level]
  project.units = 'metric'
  useStore.setState({ project, activeLevelId: level.id, selection: [] })

  const state = { project, activeLevelId: level.id, tool: 'select', openingSubtype: 'door' as const }
  const section = matchingInspectorSections([], state).find((entry) => entry.id === 'rooms')
  expect(section).toBeDefined()
  const host = document.createElement('div')
  const root = createRoot(host)
  const Component = section!.Component
  act(() => root.render(<Component selection={[]} state={state} />))
  const text = host.querySelector('.room-list')?.textContent ?? ''
  expect(text).toContain('16 m²')
  expect(text).toContain('1 items')
  act(() => root.unmount())
})
