import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function sha256Text(text) {
  return sha256Buffer(Buffer.from(text))
}

export async function sha256File(path) {
  return sha256Buffer(await readFile(path))
}

/** Stable digest of a download set. Order of `files` does not matter. */
export function sourceDigest(files) {
  const lines = [...files]
    .map((file) => `${file.name} ${file.sha256} ${file.bytes}`)
    .sort()
    .join('\n')
  return sha256Text(lines)
}

export function digestsMatch(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
