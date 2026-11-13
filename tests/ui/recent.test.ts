import { describe, expect, it } from 'vitest'
import { pushRecent, type RecentEntry } from '../../src/ui/start/recentList'

function entry(id: string, name = id): RecentEntry {
  return { id, name, updatedAt: 1, thumb: '', data: id }
}

describe('pushRecent', () => {
  it('keeps the newest eight and replaces a repeated project', () => {
    let list: RecentEntry[] = []
    for (let i = 0; i < 10; i++) list = pushRecent(list, entry(String(i)))
    expect(list.map((item) => item.id)).toEqual(['9', '8', '7', '6', '5', '4', '3', '2'])
    const again = pushRecent(list, entry('4', 'renamed'))
    expect(again[0]?.name).toBe('renamed')
    expect(again.filter((item) => item.id === '4')).toHaveLength(1)
    expect(again).toHaveLength(8)
  })
})
