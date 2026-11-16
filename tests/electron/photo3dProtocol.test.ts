import { describe, expect, it } from 'vitest'
import {
  LineSplitter,
  appendTail,
  isPhotoPath,
  lastLine,
  normalizeQuality,
  parsePhoto3dLine,
  photo3dArgs,
  resolvePhoto3dCommand,
} from '../../electron/photo3dProtocol'

describe('photo3d stdout protocol', () => {
  it('reads progress with its stage words, clamped to 0..1', () => {
    expect(parsePhoto3dLine('PROGRESS 0.25 removing background')).toEqual({
      kind: 'progress',
      value: 0.25,
      stage: 'removing background',
    })
    expect(parsePhoto3dLine('PROGRESS 1')).toEqual({ kind: 'progress', value: 1, stage: '' })
    expect(parsePhoto3dLine('PROGRESS 1.7 over')).toEqual({ kind: 'progress', value: 1, stage: 'over' })
    expect(parsePhoto3dLine('PROGRESS -2 under')).toEqual({ kind: 'progress', value: 0, stage: 'under' })
    expect(parsePhoto3dLine('PROGRESS 0.5 meshing\r')).toEqual({ kind: 'progress', value: 0.5, stage: 'meshing' })
  })

  it('reads DONE with a path that may hold spaces, and ERROR with its message', () => {
    expect(parsePhoto3dLine('DONE /tmp/my models/out.glb')).toEqual({ kind: 'done', path: '/tmp/my models/out.glb' })
    expect(parsePhoto3dLine('ERROR no furniture found')).toEqual({ kind: 'error', message: 'no furniture found' })
    expect(parsePhoto3dLine('ERROR')).toEqual({ kind: 'error', message: 'Unknown error' })
  })

  it('ignores junk: logs, blank lines, malformed progress, an empty DONE', () => {
    for (const line of ['', '   ', 'Loading model weights…', 'progress 0.5 lower case', 'PROGRESS abc stage', 'PROGRESS', 'DONE', 'DONEX /a', 'xPROGRESS 0.1']) {
      expect(parsePhoto3dLine(line), line).toBeNull()
    }
  })

  it('joins a line split across chunks and keeps a last line with no newline for flush', () => {
    const splitter = new LineSplitter()
    expect(splitter.push('PROG')).toEqual([])
    expect(splitter.push('RESS 0.3 seg')).toEqual([])
    expect(splitter.push('menting\nPROGRESS 0.6 mesh\nDO')).toEqual(['PROGRESS 0.3 segmenting', 'PROGRESS 0.6 mesh'])
    expect(splitter.push('NE /tmp/a.glb')).toEqual([])
    expect(splitter.flush()).toEqual(['DONE /tmp/a.glb'])
    expect(splitter.flush()).toEqual([])
    const lines = new LineSplitter().push('a\r\nb\r\n')
    expect(lines.map(parsePhoto3dLine)).toEqual([null, null])
  })

  it('builds argv without joining or quoting anything', () => {
    expect(photo3dArgs('/t/o.glb', 'best', ['/p/a b.jpg', '/p/$(rm).png'])).toEqual([
      '--out',
      '/t/o.glb',
      '--quality',
      'best',
      '/p/a b.jpg',
      '/p/$(rm).png',
    ])
    expect(normalizeQuality('best')).toBe('best')
    expect(normalizeQuality('ultra')).toBe('fast')
  })

  it('accepts only photo extensions', () => {
    expect(isPhotoPath('/a/b.HEIC')).toBe(true)
    expect(isPhotoPath('/a/b.jpeg')).toBe(true)
    expect(isPhotoPath('/a/b.webp')).toBe(true)
    expect(isPhotoPath('/a/b.gif')).toBe(false)
    expect(isPhotoPath('/a/png')).toBe(false)
  })

  it('prefers the setting and falls back to NESTWRIGHT_PHOTO3D', () => {
    expect(resolvePhoto3dCommand(' /opt/p3d.sh ', '/env/p3d')).toBe('/opt/p3d.sh')
    expect(resolvePhoto3dCommand('', '/env/p3d')).toBe('/env/p3d')
    expect(resolvePhoto3dCommand(undefined, undefined)).toBe('')
  })

  it('falls back to the installed converter when nothing is set', () => {
    const installed = '/data/photo3d/photo3d.sh'
    expect(resolvePhoto3dCommand('', '  ', installed)).toBe(installed)
    expect(resolvePhoto3dCommand('', '/env/p3d', installed)).toBe('/env/p3d')
    expect(resolvePhoto3dCommand('/opt/p3d.sh', '/env/p3d', installed)).toBe('/opt/p3d.sh')
  })

  it('keeps a bounded stderr tail and its last line', () => {
    expect(appendTail('abc', 'def', 4)).toBe('cdef')
    expect(lastLine('one\ntwo\n\n')).toBe('two')
    expect(lastLine('')).toBe('')
  })
})
