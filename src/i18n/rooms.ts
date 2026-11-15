import { ROOM_LABEL } from '../model/rooms'
import { fill, translate } from './index'

/** Translation keys for each default stem, so "Living" reads "Sala" rather than the type word. */
const STEM_KEYS: Record<string, string> = Object.fromEntries(
  Object.values(ROOM_LABEL).map((stem) => [stem, `room.${stem}`]),
)
const DEFAULT_NAME = new RegExp(`^(${Object.values(ROOM_LABEL).join('|')})(?: (\\d+))?$`)

/**
 * Room names are user data and stay in the language they were saved in. A name that is still
 * an untouched default (`Living 3`, created by src/model in English, or a bare `Kitchen` from a
 * template) is shown translated.
 */
export function roomDisplayName(language: string, name: string): string {
  const match = DEFAULT_NAME.exec(name)
  if (!match) return name === 'Outside' || name === 'Room' ? translate(language, name) : name
  const key = STEM_KEYS[match[1]!]
  if (!key) return name
  return match[2] ? `${translate(language, key)} ${match[2]}` : translate(language, key)
}

export function roomStemKeys(): string[] {
  return Object.values(STEM_KEYS)
}

const LEVEL_NUMBERED = /^Level (\d+)$/

/** Level names follow the same rule: "Ground" and "Level 2" from src/model are shown translated. */
export function levelDisplayName(language: string, name: string): string {
  if (name === 'Ground') return translate(language, 'level.Ground')
  const match = LEVEL_NUMBERED.exec(name)
  return match ? fill(language, 'Level {n}', { n: match[1]! }) : name
}
