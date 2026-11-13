import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), 'src/ui')
const ALLOW = new Set([
  'OK',
  'PDF',
  'PNG',
  'GLB',
  'JSON',
  '2D',
  '3D',
  'Nestwright',
  'Esc',
  'm',
  'm²',
  'A',
  'B',
  'C',
])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (name.endsWith('.tsx')) out.push(path)
  }
  return out
}

/** JSX text between tags, not an expression. */
function textNodes(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const found: string[] = []
  const pattern = />([^<{][^<]*)</g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(stripped))) {
    const text = match[1]?.replace(/\s+/g, ' ').trim() ?? ''
    if (text) found.push(text)
  }
  return found
}

describe('ui copy', () => {
  it('keeps plain English JSX text inside t(), tr(), or <T>', () => {
    const offenders: string[] = []
    for (const file of files(ROOT)) {
      const source = readFileSync(file, 'utf8')
      for (const text of textNodes(source)) {
        if (ALLOW.has(text)) continue
        if (!/[A-Za-z]{3,}/.test(text)) continue
        if (!/^[A-Za-z0-9][A-Za-z0-9 '’.,!?…:-]*$/.test(text)) continue
        offenders.push(`${file.replace(process.cwd() + '/', '')}: ${text}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
