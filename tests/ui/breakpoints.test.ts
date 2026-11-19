import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPACT_SIDEBARS, NARROW_BAR } from '../../src/ui/breakpoints'

describe('breakpoints', () => {
  it('uses one CSS sidebar breakpoint that matches the JS constants', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
    expect(css.match(/@media \(max-width: 1360px\)/g)).toHaveLength(1)
    expect(css).not.toContain('1359px')
    expect(COMPACT_SIDEBARS).toBe('(max-width: 1360px)')
    expect(NARROW_BAR).toBe('(max-width: 1099px)')
  })
})
