import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentCandidates, contentRoots, contentType } from '../../electron/contentPaths'

const roots = contentRoots({ resourcesPath: '/app/Resources', userData: '/u/Nestwright', appPath: '/repo' })

describe('nwcontent:// paths', () => {
  it('maps content and basis hosts onto their roots, resources first', () => {
    expect(contentCandidates('nwcontent://content/textures/a-tex/albedo.ktx2', roots)).toEqual([
      path.join('/app/Resources/content/textures/a-tex/albedo.ktx2'),
      path.join('/u/Nestwright/content/textures/a-tex/albedo.ktx2'),
      path.join('/repo/public/content/textures/a-tex/albedo.ktx2'),
    ])
    expect(contentCandidates('nwcontent://basis/basis_transcoder.wasm', roots)?.[0]).toBe(
      path.join('/app/Resources/basis/basis_transcoder.wasm'),
    )
  })

  it('refuses other hosts, empty paths and traversal', () => {
    expect(contentCandidates('nwcontent://other/x', roots)).toBeNull()
    expect(contentCandidates('nwcontent://content/', roots)).toBeNull()
    expect(contentCandidates('nwcontent://content/..%2f..%2fetc/passwd', roots)).toBeNull()
    // Dot segments the URL parser folds itself still land inside the root.
    for (const file of contentCandidates('nwcontent://content/%2e%2e/%2e%2e/etc/passwd', roots) ?? []) {
      expect(file.includes(`${path.sep}content${path.sep}`)).toBe(true)
    }
    expect(contentCandidates('file:///etc/passwd', roots)).toBeNull()
    expect(contentCandidates('not a url', roots)).toBeNull()
  })

  it('serves wasm and ktx2 with their types', () => {
    expect(contentType('a/basis_transcoder.wasm')).toBe('application/wasm')
    expect(contentType('a/albedo.KTX2')).toBe('image/ktx2')
    expect(contentType('index.json')).toBe('application/json')
  })
})
