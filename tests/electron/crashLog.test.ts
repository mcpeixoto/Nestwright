import { describe, expect, it } from 'vitest'
import { bindCrashGuard, crashFileName, formatCrash } from '../../electron/crashLog'

describe('crash log', () => {
  it('names a file that can sit in userData/logs', () => {
    const name = crashFileName(new Date('2026-01-02T03:04:05.006Z'))
    expect(name.endsWith('.log')).toBe(true)
    expect(name.includes(':')).toBe(false)
    expect(name.includes('/')).toBe(false)
    expect(name).toContain('2026-01-02')
    expect(crashFileName(new Date('2026-01-02T03:04:06.000Z'))).not.toBe(name)
  })

  it('keeps the message and stack in the log body', () => {
    const body = formatCrash({
      at: '2026-01-02T03:04:05.000Z',
      kind: 'error',
      message: 'Cannot read walls of undefined',
      stack: 'at draw (plan.ts:10:2)',
    })
    expect(body).toContain('error')
    expect(body).toContain('Cannot read walls of undefined')
    expect(body).toContain('at draw (plan.ts:10:2)')
  })

  it('reports each failure and toasts the autosave line only once', () => {
    const reports: { kind: string; message: string }[] = []
    const toasts: string[] = []
    const host: {
      onerror: ((message: unknown, source?: unknown, line?: unknown, col?: unknown, error?: unknown) => void) | null
      onunhandledrejection: ((event: { reason: unknown }) => void) | null
    } = { onerror: null, onunhandledrejection: null }
    bindCrashGuard(
      host,
      (entry) => reports.push({ kind: entry.kind, message: entry.message }),
      (text) => toasts.push(text),
    )
    host.onerror?.('boom', 'app.js', 4, 2, new Error('boom'))
    host.onunhandledrejection?.({ reason: new Error('later') })
    expect(reports.map((item) => item.message)).toEqual(['boom', 'later'])
    expect(toasts).toEqual(['Something broke — your work is autosaved'])
  })
})
