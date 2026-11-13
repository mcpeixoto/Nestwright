import { describe, expect, it } from 'vitest'
import { listPlanLayers, registerPlanLayer } from '../../src/plan2d/layers'
import { useSettings } from '../../src/settings'
import {
  listInspectorSections,
  matchingInspectorSections,
  registerInspectorSection,
  type InspectorMatchState,
} from '../../src/ui/inspector/registry'
import { listPanels, registerPanel } from '../../src/ui/panels/registry'
import { listShortcuts, registerShortcut } from '../../src/ui/shortcuts'
import { listTopBarActions, registerTopBarAction } from '../../src/ui/topbar/registry'
import { listSceneLayers, registerSceneLayer, replaceSceneLayer } from '../../src/view3d/layers'

const Blank = () => null

describe('registries', () => {
  it('orders inspector sections and returns only the ones that match', () => {
    registerInspectorSection({
      id: 'order-wall',
      order: 30,
      title: 'Wall',
      match: (selection) => selection.includes('wall'),
      Component: Blank,
    })
    registerInspectorSection({
      id: 'order-level',
      order: 10,
      title: 'Level',
      match: (selection) => selection.length === 0,
      Component: Blank,
    })
    registerInspectorSection({
      id: 'order-item',
      order: 20,
      title: 'Item',
      match: (selection) => selection.includes('item'),
      Component: Blank,
    })
    const ids = listInspectorSections()
      .map((section) => section.id)
      .filter((id) => id.startsWith('order-'))
    expect(ids).toEqual(['order-level', 'order-item', 'order-wall'])
    const state = {
      project: { levels: [] },
      activeLevelId: '',
      tool: 'select',
      openingSubtype: 'door',
    } as unknown as InspectorMatchState
    expect(matchingInspectorSections([], state).map((section) => section.id).filter((id) => id.startsWith('order-'))).toEqual([
      'order-level',
    ])
    expect(
      matchingInspectorSections(['item', 'wall'], state)
        .map((section) => section.id)
        .filter((id) => id.startsWith('order-')),
    ).toEqual(['order-item', 'order-wall'])
  })

  it('keeps panel registration order when an id is replaced', () => {
    registerPanel({ id: 'order-a', title: 'A', placement: 'right', Component: Blank })
    registerPanel({ id: 'order-b', title: 'B', placement: 'left', Component: Blank })
    registerPanel({ id: 'order-a', title: 'A2', placement: 'right', Component: Blank })
    const mine = listPanels().filter((panel) => panel.id.startsWith('order-'))
    expect(mine.map((panel) => panel.id)).toEqual(['order-a', 'order-b'])
    expect(mine[0]?.title).toBe('A2')
  })

  it('orders top-bar actions by order, then id', () => {
    registerTopBarAction({ id: 'order-export', label: 'Export', order: 40, run() {} })
    registerTopBarAction({ id: 'order-new', label: 'New', order: 10, run() {} })
    registerTopBarAction({ id: 'order-open', label: 'Open', order: 10, run() {} })
    expect(
      listTopBarActions()
        .map((action) => action.id)
        .filter((id) => id.startsWith('order-')),
    ).toEqual(['order-new', 'order-open', 'order-export'])
  })

  it('draws plan layers in order', () => {
    registerPlanLayer({ id: 'order-labels', order: 60, draw() {} })
    registerPlanLayer({ id: 'order-grid', order: 0, draw() {} })
    registerPlanLayer({ id: 'order-walls', order: 40, draw() {} })
    expect(
      listPlanLayers()
        .map((layer) => layer.id)
        .filter((id) => id.startsWith('order-')),
    ).toEqual(['order-grid', 'order-walls', 'order-labels'])
  })

  it('keeps a replaced scene layer in its slot', () => {
    registerSceneLayer({ id: 'order-ground', create: () => ({ sync() {}, dispose() {} }) })
    registerSceneLayer({ id: 'order-sky', create: () => ({ sync() {}, dispose() {} }) })
    let replaced = false
    replaceSceneLayer('order-ground', {
      id: 'order-ground',
      create: () => {
        replaced = true
        return { sync() {}, dispose() {} }
      },
    })
    const ids = listSceneLayers()
      .map((layer) => layer.id)
      .filter((id) => id.startsWith('order-'))
    expect(ids).toEqual(['order-ground', 'order-sky'])
    listSceneLayers().find((layer) => layer.id === 'order-ground')?.create({} as never)
    expect(replaced).toBe(true)
  })

  it('lists shortcuts in registration order', () => {
    registerShortcut({ id: 'order-fit', keys: 'f', description: 'Fit', run() {} })
    registerShortcut({ id: 'order-save', keys: 'mod+s', description: 'Save', run() {} })
    expect(
      listShortcuts()
        .map((shortcut) => shortcut.id)
        .filter((id) => id.startsWith('order-')),
    ).toEqual(['order-fit', 'order-save'])
  })

  it('stores settings outside the project', () => {
    expect(useSettings.getState().language).toBe('en')
    expect(useSettings.getState().playerColor).toBe('#3FB8AF')
    useSettings.getState().setSettings({ showFps: true, playerName: 'Ada' })
    expect(useSettings.getState().showFps).toBe(true)
    expect(useSettings.getState().playerName).toBe('Ada')
  })
})
