import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hasAutosaveFile,
  isAllowedSaveTarget,
  isSafeRecentId,
  isRecentIndexCorrupt,
  readAutosave,
  readRecentIndex,
  readRecentProject,
  readRecentThumb,
  saveRecentEntry,
  writeAutosave,
  type RecentRecord,
} from '../../electron/saves'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestwright-saves-'))
})

afterEach(() => {
  fs.chmodSync(dir, 0o755)
  fs.rmSync(dir, { recursive: true, force: true })
})

function entry(id: string, updatedAt: number, filePath?: string): RecentRecord {
  return { id, name: id, updatedAt, ...(filePath ? { path: filePath } : {}) }
}

function png(text: string): { ext: 'png'; bytes: Buffer } {
  return { ext: 'png', bytes: Buffer.from(text) }
}

describe('autosave files', () => {
  it('replaces the autosave by rename and leaves no temp file', () => {
    writeAutosave(dir, '{"version":1,"name":"one"}')
    expect(readAutosave(dir)).toBe('{"version":1,"name":"one"}')
    expect(hasAutosaveFile(dir)).toBe(true)
    writeAutosave(dir, '{"version":1,"name":"two"}')
    expect(readAutosave(dir)).toBe('{"version":1,"name":"two"}')
    const names = fs.readdirSync(dir)
    expect(names.filter((name) => name.includes('.tmp'))).toEqual([])
    expect(names).toContain('autosave.nest')
  })

  it('keeps the previous autosave when a replacement cannot be created', () => {
    writeAutosave(dir, 'safe')
    fs.chmodSync(dir, 0o555)
    expect(() => writeAutosave(dir, 'replaced')).toThrow()
    fs.chmodSync(dir, 0o755)
    expect(readAutosave(dir)).toBe('safe')
  })

  it('returns null when there is no autosave', () => {
    expect(readAutosave(dir)).toBeNull()
    expect(hasAutosaveFile(dir)).toBe(false)
  })
})

describe('recent index', () => {
  it('keeps eight projects and deletes the files that fall off', () => {
    for (let i = 0; i < 9; i++) {
      saveRecentEntry(dir, entry(`p${i}`, i), `{"i":${i}}`, png(`png-${i}`))
    }
    const index = readRecentIndex(dir)
    expect(index.map((item) => item.id)).toEqual(['p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1'])
    expect(fs.existsSync(path.join(dir, 'recent', 'p0.nest'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'recent', 'p0.png'))).toBe(false)
    expect(readRecentProject(dir, 'p8')).toBe('{"i":8}')
    expect(readRecentThumb(dir, 'p8')).toBe(`data:image/png;base64,${Buffer.from('png-8').toString('base64')}`)
    expect(fs.existsSync(path.join(dir, 'recent', 'p1.nest'))).toBe(true)
  })

  it('reads a corrupt index as an empty list', () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'recent.json'), '{not json', 'utf8')
    expect(readRecentIndex(dir)).toEqual([])
    expect(isRecentIndexCorrupt(dir)).toBe(true)
    fs.writeFileSync(path.join(dir, 'recent.json'), '{"id":"nope"}', 'utf8')
    expect(readRecentIndex(dir)).toEqual([])
    expect(isRecentIndexCorrupt(dir)).toBe(true)
  })

  it('rejects path-traversal ids and writes nothing outside the saves directory', () => {
    const parent = path.dirname(dir)
    const before = new Set(fs.readdirSync(parent))
    saveRecentEntry(dir, entry('kept', 1), '{"ok":true}', png('ok'))
    for (const id of ['../pwn', '..', 'foo/bar', 'foo\\bar', '', '.hidden']) {
      expect(isSafeRecentId(id)).toBe(false)
      expect(() => saveRecentEntry(dir, entry(id, 2), '{}', null)).toThrow()
    }
    expect(readRecentIndex(dir).map((item) => item.id)).toEqual(['kept'])
    expect(fs.existsSync(path.resolve(dir, '..', 'pwn.nest'))).toBe(false)
    const after = fs.readdirSync(parent)
    expect(after.filter((name) => !before.has(name))).toEqual([])
    expect(readRecentProject(dir, '../pwn')).toBeNull()
  })
})

describe('save targets', () => {
  it('allows a path from this session or the recents index and refuses any other', () => {
    const session = ['/Users/me/Houses/one.nest']
    const recent = ['/Users/me/Houses/two.nest']
    expect(isAllowedSaveTarget('/Users/me/Houses/one.nest', session, recent)).toBe(true)
    expect(isAllowedSaveTarget('/Users/me/Houses/two.nest', session, recent)).toBe(true)
    expect(isAllowedSaveTarget('/Users/me/Houses/../Houses/one.nest', session, recent)).toBe(true)
    expect(isAllowedSaveTarget('/etc/passwd', session, recent)).toBe(false)
    expect(isAllowedSaveTarget('', session, recent)).toBe(false)
    expect(isAllowedSaveTarget('relative.nest', session, recent)).toBe(false)
  })
})
