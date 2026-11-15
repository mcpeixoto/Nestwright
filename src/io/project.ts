import { migrate } from './migrate'
import { fill } from '../i18n'
import type { Project } from '../model/types'
import { useSettings } from '../settings'

/** `detail` completes "Not a valid Nestwright file: …"; the whole sentence is the translation key. */
function fail(detail: string, vars: Record<string, string | number> = {}): never {
  throw new Error(fill(useSettings.getState().language, `Not a valid Nestwright file: ${detail}`, vars))
}

function assertProject(data: unknown): Project {
  if (!data || typeof data !== 'object') fail('unrecognised contents.')
  const project = data as Record<string, unknown>
  if (typeof project.id !== 'string' || project.id.length === 0) fail('missing id.')
  if (typeof project.name !== 'string') fail('missing name.')
  if (project.kind !== 'house' && project.kind !== 'apartment') fail('unknown project kind.')
  if (!Array.isArray(project.levels) || project.levels.length === 0) fail('no levels.')
  for (const level of project.levels) {
    if (!level || typeof level !== 'object') fail('a level is missing.')
    const record = level as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.name !== 'string') fail('a level has no name.')
    for (const key of ['walls', 'openings', 'rooms', 'items', 'dimensions'] as const) {
      if (!Array.isArray(record[key])) fail('a level is missing {key}.', { key })
    }
  }
  if (!project.terrain || typeof project.terrain !== 'object') fail('missing terrain.')
  if (!project.environment || typeof project.environment !== 'object') fail('missing environment.')
  if (project.units !== 'metric' && project.units !== 'imperial') fail('unknown units.')
  return data as Project
}

export function serialize(project: Project): string {
  return JSON.stringify(project)
}

/** Older files omit optional Budget.overrides and Budget.extras; they pass through unset. */
export function deserialize(json: string): Project {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    fail('invalid JSON.')
  }
  return assertProject(migrate(parsed))
}
