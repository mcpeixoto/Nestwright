import { migrate } from './migrate'
import type { Project } from '../model/types'

function fail(detail: string): never {
  throw new Error(`Not a valid Nestwright file: ${detail}`)
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
      if (!Array.isArray(record[key])) fail(`a level is missing ${key}.`)
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

export function deserialize(json: string): Project {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Not a valid Nestwright file: invalid JSON.')
  }
  return assertProject(migrate(parsed))
}
