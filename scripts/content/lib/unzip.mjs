import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

function assertSafeZipPath(name) {
  if (!name || name.endsWith('/')) return false
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error(`unsafe zip path ${name}`)
  }
  return true
}

/** Inflate a zip that uses store or deflate, without data descriptors. */
export function unzipBuffer(buffer, dest) {
  let offset = 0
  let wrote = 0
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset)
    if (signature === 0x02014b50 || signature === 0x06054b50) break
    if (signature !== 0x04034b50) throw new Error('zip is not a local-file archive')
    const flags = buffer.readUInt16LE(offset + 6)
    const method = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const dataStart = nameStart + nameLength + extraLength
    if (flags & 0x8) throw new Error('zip data descriptors need the unzip command')
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    offset = dataStart + compressedSize
    if (!assertSafeZipPath(name)) continue
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null
    if (!data) throw new Error(`unsupported zip method ${method}`)
    const target = join(dest, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
    wrote += 1
  }
  if (wrote === 0) throw new Error('zip contained no files')
}

function assertZipNames(buffer) {
  let offset = 0
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset)
    if (signature === 0x02014b50 || signature === 0x06054b50) return
    if (signature !== 0x04034b50) throw new Error('zip is not a local-file archive')
    const flags = buffer.readUInt16LE(offset + 6)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    if (flags & 0x8) break
    assertSafeZipPath(name)
    offset = nameStart + nameLength + extraLength + compressedSize
  }
}

export async function unzipFile(zipPath, dest) {
  const buffer = await readFile(zipPath)
  assertZipNames(buffer)
  const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', dest], { encoding: 'utf8' })
  if (unzip.status === 0) return
  const missing = unzip.error && unzip.error.code === 'ENOENT'
  if (!missing) throw new Error((unzip.stderr || '').trim() || `unzip exited ${unzip.status}`)
  unzipBuffer(buffer, dest)
}
