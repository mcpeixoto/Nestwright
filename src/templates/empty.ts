import type { Project } from '../model/types'
import { fresh } from './build'

/** Open plot, 30 m by 40 m, with the boundary rectangle already drawn. */
export function emptyPlot(): Project {
  const project = fresh('Empty plot', 'house', { width: 30, depth: 40 })
  project.terrain.enabled = true
  return project
}
