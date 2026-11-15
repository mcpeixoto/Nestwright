import type { HouseBrief } from '../../model/briefs'
import { createProject, createTerrain } from '../../model/defaults'
import { gridIndex } from '../../model/terrain'
import type { Project, Terrain } from '../../model/types'

/** Same grid the empty house uses, so a brief plot is an ordinary terrain. */
const RESOLUTION = 32

export function projectForBrief(brief: HouseBrief, name: string): Project {
  const project = createProject(name, 'house')
  project.brief = { id: brief.id }
  project.terrain = terrainForPlot(brief.plot)
  return project
}

function terrainForPlot(plot: HouseBrief['plot']): Terrain {
  const terrain = createTerrain(plot.width, plot.depth, RESOLUTION)
  const slope = plot.slope
  if (typeof slope !== 'number' || !Number.isFinite(slope) || slope === 0) return terrain
  // Row 0 is the near edge (negative Y). A set slope rises towards the back of the plot,
  // level with the floor at the origin where the house starts, so it is not half buried.
  const rows = terrain.resolution
  const heights = terrain.heights.slice()
  for (let iy = 0; iy <= rows; iy++) {
    const height = slope * (iy / rows - 0.5) * terrain.depth
    for (let ix = 0; ix <= rows; ix++) heights[gridIndex(ix, iy, rows)] = height
  }
  terrain.heights = heights
  return terrain
}
