import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBudgets, treeSize } from '../../scripts/packaging/size.mjs'
import { Buffer } from 'node:buffer'

let dir
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

describe('installed size budget', () => {
  it('sums a directory tree and flags anything over the budget or missing', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-size-'))
    fs.mkdirSync(path.join(dir, 'app', 'resources'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'app', 'a.bin'), Buffer.alloc(1000))
    fs.writeFileSync(path.join(dir, 'app', 'resources', 'b.bin'), Buffer.alloc(500))
    expect(treeSize(path.join(dir, 'app'))).toBe(1500)
    const [fits, over, missing] = [
      ...checkBudgets([path.join(dir, 'app')], 1500),
      ...checkBudgets([path.join(dir, 'app')], 1499),
      ...checkBudgets([path.join(dir, 'nope')], 1500),
    ]
    expect(fits.ok).toBe(true)
    expect(over).toMatchObject({ ok: false, reason: 'over budget' })
    expect(missing).toMatchObject({ ok: false, reason: 'missing' })
  })
})
