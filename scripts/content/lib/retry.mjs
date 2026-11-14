import { setTimeout as delay } from 'node:timers/promises'

const sleep = (ms) => delay(ms)

/** Three attempts, delays 400ms then 800ms, unless `sleep` is injected. */
export async function withRetry(fn, options = {}) {
  const tries = options.tries ?? 3
  const wait = options.sleep ?? sleep
  let last
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      last = err
      if (attempt === tries) break
      await wait(400 * 2 ** (attempt - 1))
    }
  }
  throw last
}
