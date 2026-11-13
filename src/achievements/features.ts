import type { Project } from '../model/types'
import { dataFeatures, type FeatureSet } from './evaluate'

// Walk, paint, and photo are imported by the shell, so a build that runs has them.
// Co-op is optional: it appears when a together/ or coop/ module is in the tree.
const coopFiles = import.meta.glob(['../together/**/*.ts', '../together/**/*.tsx', '../coop/**/*.ts', '../coop/**/*.tsx'])

/** Module presence is fixed at build time. A missing feature hides its achievement. */
export function liveFeatures(project: Project): FeatureSet {
  const data = dataFeatures(project)
  return {
    ...data,
    walk: true,
    cat: true,
    paint: true,
    photo: true,
    coop: Object.keys(coopFiles).length > 0,
  }
}
