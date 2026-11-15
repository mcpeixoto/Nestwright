import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import '../../src/catalog'
import { listEntries } from '../../src/catalog/registry'
import { MATERIAL_CATEGORIES, MATERIALS } from '../../src/materials/library'
import { en } from '../../src/i18n/en'
import { pt } from '../../src/i18n/pt'
import { catalogNameKey, categoryNameKey, materialCategoryKey, paramLabelKey, slotLabelKey } from '../../src/i18n/catalog'
import { deserialize } from '../../src/io/project'
import { useSettings } from '../../src/settings'
import { levelDisplayName, roomDisplayName, roomStemKeys } from '../../src/i18n/rooms'

const SRC = join(process.cwd(), 'src')

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

const STRING = String.raw`(['"])((?:\\.|(?!\1)[^\\\n])*)\1`
const PATTERNS = [
  // tr('…') and t('…'), not foo.tr(…)
  new RegExp(String.raw`(?<![\w.])tr?\(\s*${STRING}`, 'g'),
  // translate(language, '…') / fill(language, '…', …), not ctx.fill(…)
  new RegExp(String.raw`(?<![\w.])(?:translate|fill)\(\s*[\w.()]+\s*,\s*${STRING}`, 'g'),
  // <T k="…"> and <T k={'…'}>
  new RegExp(String.raw`<T\s+k=\{?\s*${STRING}`, 'g'),
]

function unescape(raw: string): string {
  return raw.replace(/\\(.)/g, '$1')
}

function usedKeys(): { key: string; where: string }[] {
  const found: { key: string; where: string }[] = []
  for (const file of files(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(source))) {
        found.push({ key: unescape(match[2] ?? ''), where: relative(process.cwd(), file) })
      }
    }
  }
  return found
}

/**
 * pt values that may equal English. Keep this short: abbreviations, units, product and
 * format names, and words Portuguese borrows unchanged.
 */
const SAME_IN_PT = new Set<string>([
  '2D',
  '3D',
  'GLB',
  'PNG',
  'PDF',
  'JSON',
  'OK',
  'Nestwright',
  'Backend {name}',
  // Portuguese uses these words unchanged.
  'Interior',
  'Imperial',
  'Material',
  'Metal',
  'Latitude',
  'Ultra',
  'Total',
  'Natural (AgX)',
  // City names that are spelled the same.
  'Porto',
  'Sydney',
  // Performance HUD readouts: units and abbreviations only.
  '{n} fps',
  'p50 {n} ms',
  'p95 {n} ms',
  'GPU {n} MB',
  'Render {w}×{h}',
])

/**
 * Brazilian forms, matched as whole words (Unicode-aware, so "você" matches). Keep each one
 * a word pt-PT would not use in this UI.
 */
const BRAZILIAN = [
  'tela',
  'arquivo',
  'arquivos',
  'salvar',
  'salve',
  'salvo',
  'banheiro',
  'banheiros',
  'geladeira',
  'usuário',
  'usuários',
  'você',
  'celular',
  'mouse',
  'registro',
  'câmera',
  'compartilhar',
  'senha',
  'gerenciar',
  'vaso sanitário',
].map((word) => new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu'))

function known(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(en, key)
}

describe('i18n coverage', () => {
  it('has an English entry for every key used in src/', () => {
    const missing = usedKeys()
      .filter(({ key }) => !Object.prototype.hasOwnProperty.call(en, key))
      .map(({ key, where }) => `${where}: ${key}`)
    expect([...new Set(missing)]).toEqual([])
  })

  it('has a key for every catalog entry, category and parameter label', () => {
    const entries = listEntries()
    expect(entries.length).toBeGreaterThan(50)
    const missing: string[] = []
    for (const entry of entries) {
      if (!catalogNameKey(entry.id, entry.name)) missing.push(`name ${entry.id}: ${entry.name}`)
      if (!categoryNameKey(entry.category)) missing.push(`category ${entry.category}`)
      for (const param of entry.params ?? []) {
        if (!paramLabelKey(param.label)) missing.push(`param ${entry.id}: ${param.label}`)
        for (const option of param.options ?? []) {
          if (!paramLabelKey(option)) missing.push(`option ${entry.id}: ${option}`)
        }
      }
      for (const slot of Object.keys(entry.materialSlots)) {
        // Same rule as labelOf() in src/ui/inspector/fields.tsx.
        const label = slot.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
        if (!known(slotLabelKey(slot, label))) missing.push(`slot ${entry.id}: ${slot}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('has a key for every material name and category', () => {
    expect(MATERIALS.length).toBeGreaterThan(10)
    const missing = [
      ...MATERIALS.filter((m) => !Object.prototype.hasOwnProperty.call(en, m.name)).map((m) => `material ${m.id}: ${m.name}`),
      ...MATERIAL_CATEGORIES.filter((c) => !materialCategoryKey(c)).map((c) => `material category ${c}`),
    ]
    expect(missing).toEqual([])
  })

  it('translates default room names but leaves names the player typed', () => {
    for (const key of roomStemKeys()) expect(known(key), key).toBe(true)
    expect(roomDisplayName('pt-PT', 'Living 3')).toBe('Sala 3')
    expect(roomDisplayName('pt-PT', 'Bathroom')).toBe('Casa de banho')
    expect(roomDisplayName('pt-PT', 'Living room of Ana')).toBe('Living room of Ana')
    expect(roomDisplayName('pt-PT', 'Sala 2')).toBe('Sala 2')
    expect(roomDisplayName('en', 'Living 3')).toBe('Living 3')
    expect(levelDisplayName('pt-PT', 'Ground')).toBe('Rés do chão')
    expect(levelDisplayName('pt-PT', 'Level 2')).toBe('Piso 2')
    expect(levelDisplayName('pt-PT', 'Sótão')).toBe('Sótão')
    expect(levelDisplayName('en', 'Level 2')).toBe('Level 2')
  })

  it('translates every value into Portuguese', () => {
    const english = en as Record<string, string>
    const portuguese = pt as Record<string, string>
    const same = Object.keys(english).filter((key) => portuguese[key] === english[key] && !SAME_IN_PT.has(key))
    expect(same).toEqual([])
  })

  it('writes European Portuguese, not Brazilian', () => {
    const offenders = Object.entries(pt as Record<string, string>)
      .filter(([, value]) => BRAZILIAN.some((pattern) => pattern.test(value)))
      .map(([key, value]) => `${key}: ${value}`)
    expect(offenders).toEqual([])
  })

  it('shows file errors in the player\'s language', () => {
    useSettings.getState().setSettings({ language: 'pt-PT' })
    try {
      expect(() => deserialize('{')).toThrow('Não é um ficheiro Nestwright válido: JSON inválido.')
      expect(() => deserialize('{}')).toThrow(/^Não é um ficheiro Nestwright válido/)
    } finally {
      useSettings.getState().setSettings({ language: 'en' })
    }
    expect(() => deserialize('{')).toThrow('Not a valid Nestwright file: invalid JSON.')
  })

  it('keeps {placeholder} tokens identical', () => {
    const english = en as Record<string, string>
    const portuguese = pt as Record<string, string>
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    const broken = Object.keys(english).filter((key) => tokens(english[key]!) !== tokens(portuguese[key]!))
    expect(broken).toEqual([])
  })
})
