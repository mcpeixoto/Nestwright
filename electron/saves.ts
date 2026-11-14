import fs from 'node:fs'
import path from 'node:path'

export const AUTOSAVE_FILE = 'autosave.nest'
export const RECENT_INDEX = 'recent.json'
export const RECENT_LIMIT = 8

/** Ids become file names under `recent/`. Dots and slashes would escape that folder. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export interface RecentRecord {
  id: string
  name: string
  updatedAt: number
  path?: string
}

export interface RecentThumb {
  ext: 'png' | 'jpg'
  bytes: Buffer
}

export function isSafeRecentId(id: string): boolean {
  return typeof id === 'string' && SAFE_ID.test(id)
}

function atomicWrite(file: string, data: string | Buffer): void {
  const folder = path.dirname(file)
  fs.mkdirSync(folder, { recursive: true })
  const tmp = path.join(folder, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  try {
    fs.writeFileSync(tmp, data)
    try {
      fs.renameSync(tmp, file)
    } catch {
      // Windows refuses to rename over a file that already exists.
      fs.rmSync(file, { force: true })
      fs.renameSync(tmp, file)
    }
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* the temp file was never created */
    }
    throw err
  }
}

export function writeAutosave(dir: string, data: string): void {
  atomicWrite(path.join(dir, AUTOSAVE_FILE), data)
}

export function readAutosave(dir: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, AUTOSAVE_FILE), 'utf8')
  } catch {
    return null
  }
}

export function hasAutosaveFile(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, AUTOSAVE_FILE))
  } catch {
    return false
  }
}

export function hasRecentIndex(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, RECENT_INDEX))
  } catch {
    return false
  }
}

/** True when `recent.json` exists but is not a JSON array. A missing file is not corrupt. */
export function isRecentIndexCorrupt(dir: string): boolean {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(dir, RECENT_INDEX), 'utf8')
  } catch {
    return false
  }
  try {
    return !Array.isArray(JSON.parse(raw))
  } catch {
    return true
  }
}

function parseRecord(value: unknown): RecentRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<RecentRecord>
  if (typeof record.id !== 'string' || !isSafeRecentId(record.id)) return null
  const parsed: RecentRecord = {
    id: record.id,
    name: typeof record.name === 'string' && record.name ? record.name : 'Untitled',
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
  }
  if (typeof record.path === 'string' && path.isAbsolute(record.path)) parsed.path = record.path
  return parsed
}

export function readRecentIndex(dir: string): RecentRecord[] {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(dir, RECENT_INDEX), 'utf8')
  } catch {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: RecentRecord[] = []
  for (const item of parsed) {
    const record = parseRecord(item)
    if (!record) continue
    out.push(record)
    if (out.length >= RECENT_LIMIT) break
  }
  return out
}

function recentFile(dir: string, id: string, ext: string): string | null {
  if (!isSafeRecentId(id)) return null
  if (ext !== 'nest' && ext !== 'png' && ext !== 'jpg') return null
  const base = path.resolve(dir, 'recent')
  const file = path.resolve(base, `${id}.${ext}`)
  if (!file.startsWith(base + path.sep)) return null
  return file
}

function removeRecentFiles(dir: string, id: string): void {
  for (const ext of ['nest', 'png', 'jpg']) {
    const file = recentFile(dir, id, ext)
    if (!file) continue
    try {
      fs.rmSync(file, { force: true })
    } catch {
      /* a missing snapshot is already gone */
    }
  }
}

export function saveRecentEntry(
  dir: string,
  entry: RecentRecord,
  projectJson: string,
  thumb: RecentThumb | null,
): RecentRecord[] {
  if (!isSafeRecentId(entry.id)) throw new Error('Unsafe recent id')
  const projectFile = recentFile(dir, entry.id, 'nest')
  if (!projectFile) throw new Error('Unsafe recent id')
  const current = readRecentIndex(dir)
  const record: RecentRecord = {
    id: entry.id,
    name: entry.name || 'Untitled',
    updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
  }
  if (typeof entry.path === 'string' && path.isAbsolute(entry.path)) record.path = entry.path
  const next = [record, ...current.filter((item) => item.id !== record.id)].slice(0, RECENT_LIMIT)
  const dropped = current.filter((item) => !next.some((kept) => kept.id === item.id))
  atomicWrite(projectFile, projectJson)
  if (thumb && (thumb.ext === 'png' || thumb.ext === 'jpg') && thumb.bytes.length > 0) {
    for (const ext of ['png', 'jpg'] as const) {
      const oldThumb = recentFile(dir, entry.id, ext)
      if (oldThumb) fs.rmSync(oldThumb, { force: true })
    }
    const thumbFile = recentFile(dir, entry.id, thumb.ext)
    if (!thumbFile) throw new Error('Unsafe recent id')
    atomicWrite(thumbFile, thumb.bytes)
  }
  atomicWrite(path.join(dir, RECENT_INDEX), JSON.stringify(next))
  for (const old of dropped) removeRecentFiles(dir, old.id)
  return next
}

export function readRecentProject(dir: string, id: string): string | null {
  const file = recentFile(dir, id, 'nest')
  if (!file) return null
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

export function readRecentThumb(dir: string, id: string): string | null {
  if (!isSafeRecentId(id)) return null
  for (const ext of ['png', 'jpg'] as const) {
    const file = recentFile(dir, id, ext)
    if (!file) continue
    try {
      const bytes = fs.readFileSync(file)
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      /* try the other extension */
    }
  }
  return null
}

export function decodeThumb(dataUrl: string): RecentThumb | null {
  if (typeof dataUrl !== 'string' || !dataUrl) return null
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl)
  if (!match?.[1] || !match[2]) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length === 0) return null
  return { ext: match[1] === 'png' ? 'png' : 'jpg', bytes }
}

/** A direct write is only allowed to a path a dialog, an open, or the recents index already named. */
export function isAllowedSaveTarget(
  candidate: string,
  sessionPaths: readonly string[],
  recentPaths: readonly (string | undefined)[],
): boolean {
  if (typeof candidate !== 'string' || !candidate || !path.isAbsolute(candidate)) return false
  const resolved = path.resolve(candidate)
  const allowed = new Set<string>()
  for (const item of [...sessionPaths, ...recentPaths]) {
    if (typeof item !== 'string' || !item || !path.isAbsolute(item)) continue
    allowed.add(path.resolve(item))
  }
  return allowed.has(resolved)
}
