import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import { withRetry } from './retry.mjs'

export const USER_AGENT = 'Nestwright-content-pipeline/1.0'

function fetchImpl(options) {
  return options.fetchImpl ?? globalThis.fetch
}

export async function fetchJson(url, options = {}) {
  return withRetry(async () => {
    const response = await fetchImpl(options)(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`GET ${url} → ${response.status}`)
    return response.json()
  }, options)
}

export async function downloadTo(url, dest, options = {}) {
  await mkdir(dirname(dest), { recursive: true })
  return withRetry(async () => {
    const response = await fetchImpl(options)(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) throw new Error(`GET ${url} → ${response.status}`)
    if (!response.body) throw new Error(`GET ${url} returned no body`)
    const tmp = `${dest}.partial`
    const file = createWriteStream(tmp)
    const hash = createHash('sha256')
    let bytes = 0
    try {
      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buf.length
        hash.update(buf)
        if (!file.write(buf)) await new Promise((resolve) => file.once('drain', resolve))
      }
      await finished(file.end())
    } catch (err) {
      file.destroy()
      await rm(tmp, { force: true })
      throw err
    }
    if (options.expectedSize != null && bytes !== options.expectedSize) {
      await rm(tmp, { force: true })
      throw new Error(`GET ${url} size ${bytes} != ${options.expectedSize}`)
    }
    await rename(tmp, dest)
    return { bytes, sha256: hash.digest('hex') }
  }, options)
}
