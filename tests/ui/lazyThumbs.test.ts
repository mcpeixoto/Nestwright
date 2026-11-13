import { afterEach, describe, expect, it } from 'vitest'
import { cachedThumb, requestLazyThumb, resetLazyThumbsForTests, setThumbScheduler } from '../../src/ui/start/lazyThumbs'

afterEach(() => {
  resetLazyThumbsForTests()
})

describe('lazy thumbnails', () => {
  it('builds one thumbnail per scheduled slice and then serves the cache', () => {
    const queued: Array<() => void> = []
    setThumbScheduler((fn) => {
      queued.push(fn)
    })
    let built = 0
    requestLazyThumb('alpha', () => {
      built += 1
      return 'A'
    })
    requestLazyThumb('beta', () => {
      built += 1
      return 'B'
    })
    expect(built).toBe(0)
    expect(cachedThumb('alpha')).toBe('')
    expect(queued).toHaveLength(1)
    queued.shift()?.()
    expect(built).toBe(1)
    expect(cachedThumb('alpha')).toBe('A')
    expect(cachedThumb('beta')).toBe('')
    queued.shift()?.()
    expect(built).toBe(2)
    expect(cachedThumb('beta')).toBe('B')
    requestLazyThumb('alpha', () => {
      built += 1
      return 'AGAIN'
    })
    expect(built).toBe(2)
    expect(cachedThumb('alpha')).toBe('A')
  })
})
