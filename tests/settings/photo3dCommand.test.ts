import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeCommandPath, normalizeSettings, type Settings } from '../../src/settings'

describe('photo3dCommand setting', () => {
  it('defaults to empty, also for older saved settings without the field', () => {
    expect(DEFAULT_SETTINGS.photo3dCommand).toBe('')
    expect(normalizeSettings({ units: 'metric' }).photo3dCommand).toBe('')
    expect(normalizeSettings({ photo3dCommand: 42 } as unknown as Partial<Settings>).photo3dCommand).toBe('')
  })

  it('trims, drops pasted quotes and line breaks, and caps the length', () => {
    expect(normalizeSettings({ photo3dCommand: '  /opt/photo3d/photo3d.sh ' }).photo3dCommand).toBe('/opt/photo3d/photo3d.sh')
    expect(normalizeCommandPath('"/Users/me/My Tools/p3d.sh"')).toBe('/Users/me/My Tools/p3d.sh')
    expect(normalizeCommandPath("'/a/b.sh'")).toBe('/a/b.sh')
    expect(normalizeCommandPath('/a/b.sh\n--evil')).toBe('/a/b.sh--evil')
    expect(normalizeCommandPath('"')).toBe('"')
    expect(normalizeCommandPath('x'.repeat(2000))).toHaveLength(1024)
  })
})
