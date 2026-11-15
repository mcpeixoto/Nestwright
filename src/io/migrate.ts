import { PROJECT_VERSION } from '../model/types'

/**
 * Bring a parsed file up to PROJECT_VERSION.
 * Version 1 is the schema in model/types.ts and needs no transform.
 * Later versions add a step here and bump PROJECT_VERSION.
 * Optional Budget.overrides and Budget.extras are absent on older files;
 * readers treat a missing field as unset, so those files load unchanged.
 */
export function migrate(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    throw new Error('Not a valid Nestwright file.')
  }
  const record = data as Record<string, unknown>
  const version = record.version
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new Error('Not a valid Nestwright file: missing version.')
  }
  if (version > PROJECT_VERSION) {
    throw new Error(
      `Not a valid Nestwright file: version ${version} is newer than this app (version ${PROJECT_VERSION}).`,
    )
  }
  if (version < 1) {
    throw new Error(`Not a valid Nestwright file: unknown version ${version}.`)
  }
  return record
}
