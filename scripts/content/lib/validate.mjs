import { reviewLock } from './lock.mjs'
import { manifestErrors } from './manifest.mjs'

function targetErrors(targets, ids, where) {
  const errors = []
  if (!targets || typeof targets !== 'object') return errors
  if (targets.materialId && !ids.materials.has(targets.materialId)) {
    errors.push(`${where} materialId ${targets.materialId} is not in the material library`)
  }
  if (targets.catalogId && !ids.catalog.has(targets.catalogId)) {
    errors.push(`${where} catalogId ${targets.catalogId} is not in the catalog`)
  }
  if (targets.species && !ids.species.has(targets.species)) {
    errors.push(`${where} species ${targets.species} is not a known plant or scatter species`)
  }
  return errors
}

/**
 * Pure check over already-loaded sources, manifests and id sets.
 * `outputExists` gates the "file listed but missing" rule.
 */
export function validateState({ sources, manifests, ids, lock, outputExists, fileExists }) {
  const errors = []
  const sourceKeys = new Set()
  for (const entry of sources ?? []) {
    if (sourceKeys.has(entry.key)) errors.push(`duplicate source key ${entry.key}`)
    sourceKeys.add(entry.key)
    errors.push(...targetErrors(entry.targets, ids, entry.key))
  }
  const manifestKeys = new Set()
  for (const manifest of manifests ?? []) {
    errors.push(...manifestErrors(manifest))
    if (manifest?.key) {
      if (manifestKeys.has(manifest.key)) errors.push(`duplicate manifest key ${manifest.key}`)
      manifestKeys.add(manifest.key)
    }
    errors.push(...targetErrors(manifest?.targets, ids, manifest?.key ?? '(manifest)'))
    if (outputExists && Array.isArray(manifest?.files)) {
      for (const file of manifest.files) {
        if (file?.path && !fileExists(file.path)) errors.push(`${manifest.key} lists missing file ${file.path}`)
      }
    }
  }
  if (lock) errors.push(...reviewLock(lock))
  return errors
}
