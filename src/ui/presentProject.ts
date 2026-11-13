import { levelToOpen } from '../model/openLevel'
import type { Project } from '../model/types'
import { useStore } from '../store'
import { fitVisible } from './fit'

/** Templates and opened files show every storey, starting on the ground floor, fitted. */
export function presentProject(project: Project): void {
  const store = useStore.getState()
  store.setProject(project)
  store.setLevelDisplay('all')
  const id = levelToOpen(project)
  if (id) store.setActiveLevel(id)
  const fit = () => {
    try {
      fitVisible()
    } catch {
      /* the canvases mount on the next frame */
    }
  }
  queueMicrotask(fit)
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fit)
}
