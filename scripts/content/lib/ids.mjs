import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths.mjs'

export function extractQuotedIds(source) {
  const ids = new Set()
  const re = /\bid:\s*'([^']+)'/g
  for (let match = re.exec(source); match; match = re.exec(source)) ids.add(match[1])
  return ids
}

export function extractSpecies(source) {
  const ids = new Set()
  const re = /species\s*===\s*'([^']+)'/g
  for (let match = re.exec(source); match; match = re.exec(source)) ids.add(match[1])
  return ids
}

export function materialTileSize(source, id) {
  const re = new RegExp(`id:\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^\\n]*tileSize:\\s*([0-9.]+)`)
  const match = re.exec(source)
  return match ? Number(match[1]) : null
}

function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkTs(path, out)
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

export function loadIds(root = paths.root) {
  const libraryPath = join(root, 'src', 'materials', 'library.ts')
  const library = readFileSync(libraryPath, 'utf8')
  const materials = extractQuotedIds(library)
  const catalog = new Set()
  for (const file of walkTs(join(root, 'src', 'catalog', 'entries'))) {
    for (const id of extractQuotedIds(readFileSync(file, 'utf8'))) catalog.add(id)
  }
  const species = new Set()
  for (const file of walkTs(join(root, 'src'))) {
    for (const id of extractSpecies(readFileSync(file, 'utf8'))) species.add(id)
  }
  return { materials, catalog, species, library }
}
