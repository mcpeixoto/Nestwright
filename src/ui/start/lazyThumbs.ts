type Job = { id: string; build: () => string }

const cache = new Map<string, string>()
const queued = new Set<string>()
const pending: Job[] = []
const listeners = new Set<() => void>()
let pumping = false
let revision = 0

export function thumbRevision(): number {
  return revision
}

export function cachedThumb(id: string): string {
  return cache.get(id) ?? ''
}

export function subscribeLazyThumbs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  revision += 1
  for (const listener of listeners) listener()
}

function defaultSchedule(fn: () => void): void {
  const idle = globalThis.requestIdleCallback
  if (typeof idle === 'function') {
    idle(() => fn())
    return
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => fn())
    return
  }
  setTimeout(fn, 16)
}

let schedule: (fn: () => void) => void = defaultSchedule

/** One thumbnail per idle slice. Tests inject a synchronous scheduler. */
export function setThumbScheduler(next: (fn: () => void) => void): void {
  schedule = next
}

export function resetLazyThumbsForTests(): void {
  cache.clear()
  queued.clear()
  pending.length = 0
  pumping = false
  schedule = defaultSchedule
}

function pump(): void {
  if (pumping) return
  pumping = true
  const step = () => {
    const job = pending.shift()
    if (!job) {
      pumping = false
      return
    }
    queued.delete(job.id)
    if (!cache.has(job.id)) {
      try {
        cache.set(job.id, job.build())
      } catch {
        cache.set(job.id, '')
      }
      notify()
    }
    if (pending.length > 0) schedule(step)
    else pumping = false
  }
  schedule(step)
}

/** Queue a thumbnail. A cached id is not built again. Placeholder until `cachedThumb` is set. */
export function requestLazyThumb(id: string, build: () => string): void {
  if (!id || cache.has(id) || queued.has(id)) return
  queued.add(id)
  pending.push({ id, build })
  pump()
}
