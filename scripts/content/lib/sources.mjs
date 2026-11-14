import { readFile } from 'node:fs/promises'
import { assertAllowedLicence } from './licence.mjs'
import { paths } from './paths.mjs'

const KINDS = new Set(['texture', 'model', 'hdri'])
const PROVIDERS = new Set(['polyhaven', 'ambientcg', 'sketchfab', 'local'])
const RESOLUTIONS = new Set(['1k', '2k', '4k'])

export function assertEntry(entry, index = 0) {
  const where = entry && typeof entry.key === 'string' ? entry.key : `entries[${index}]`
  if (!entry || typeof entry !== 'object') throw new Error(`${where} is not an object`)
  for (const field of ['key', 'kind', 'provider', 'sourceId', 'resolution', 'licence', 'targets']) {
    if (entry[field] == null || entry[field] === '') throw new Error(`${where} missing ${field}`)
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.key)) throw new Error(`${where} key must be lowercase kebab-case`)
  if (!KINDS.has(entry.kind)) throw new Error(`${where} kind must be texture, model or hdri`)
  if (!PROVIDERS.has(entry.provider)) throw new Error(`${where} provider is not supported`)
  if (!RESOLUTIONS.has(entry.resolution)) throw new Error(`${where} resolution must be 1k, 2k or 4k`)
  if (!entry.targets || typeof entry.targets !== 'object') throw new Error(`${where} targets must be an object`)
  assertAllowedLicence(entry.licence, where)
  const manual = entry.provider === 'sketchfab' || entry.provider === 'local'
  if (entry.licence === 'CC-BY-4.0' && (!entry.author || !entry.url)) {
    throw new Error(`${where} CC-BY-4.0 needs author and url`)
  }
  if (manual && (!entry.author || !entry.url)) throw new Error(`${where} needs author and url in the source entry`)
  if ((entry.provider === 'polyhaven' || entry.provider === 'ambientcg') && entry.licence !== 'CC0') {
    throw new Error(`${where} ${entry.provider} assets must be declared CC0`)
  }
  return entry
}

export function assertSources(doc) {
  if (!doc || !Array.isArray(doc.entries)) throw new Error('content/sources.json needs an entries array')
  const seen = new Set()
  doc.entries.forEach((entry, index) => {
    assertEntry(entry, index)
    if (seen.has(entry.key)) throw new Error(`duplicate source key ${entry.key}`)
    seen.add(entry.key)
  })
  return doc.entries
}

export async function loadSources(file = paths.sources) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err instanceof Error ? err.message : err}`, { cause: err })
  }
  return assertSources(parsed)
}

export function selectEntries(entries, only) {
  if (!only) return entries
  const missing = only.filter((key) => !entries.some((entry) => entry.key === key))
  if (missing.length) throw new Error(`unknown source key: ${missing.join(', ')}`)
  return entries.filter((entry) => only.includes(entry.key))
}
