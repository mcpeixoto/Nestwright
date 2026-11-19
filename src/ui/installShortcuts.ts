import { getPlanRenderer } from '../plan2d/PlanRenderer'
import { useStore } from '../store'
import { getTool } from '../tools/registry'
import type { PlanTransform, ToolContext } from '../tools/types'
import './builtinShortcuts'
import { isPauseOpen } from './pauseMenuState'
import { isPhotoMode } from './photoSession'
import { isHelpOpen, listShortcuts, setHelpOpen, shortcutMatches } from './shortcuts'

const noopTransform: PlanTransform = {
  worldToScreen: () => ({ x: 0, y: 0 }),
  screenToWorld: () => ({ x: 0, y: 0 }),
  zoom: 1,
  panBy() {},
  zoomAt() {},
  fit() {},
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
}

export function installShortcuts(): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (isHelpOpen() && event.key === 'Escape') {
      setHelpOpen(false)
      event.preventDefault()
      return
    }
    if (isPauseOpen()) return
    if (isTyping(event.target)) {
      if (event.key === 'Escape') (event.target as HTMLElement).blur()
      return
    }
    const view = useStore.getState().view
    if (view === 'walk' || isPhotoMode()) return
    const renderer = getPlanRenderer()
    const pointer = renderer?.pointer
    const ctx: ToolContext = {
      point: pointer?.point ?? { x: 0, y: 0 },
      raw: pointer?.raw ?? { x: 0, y: 0 },
      screen: pointer?.screen ?? { x: 0, y: 0 },
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      button: 0,
      key: event.key,
      handled: false,
      transform: renderer ?? noopTransform,
    }
    getTool(useStore.getState().tool)?.onKeyDown?.(ctx)
    if (ctx.handled) {
      event.preventDefault()
      renderer?.requestDraw()
      return
    }
    for (const shortcut of listShortcuts()) {
      if (!shortcutMatches(event, shortcut)) continue
      event.preventDefault()
      shortcut.run(event)
      return
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
