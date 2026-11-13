export interface CrashReport {
  kind: 'error' | 'rejection'
  message: string
  stack?: string
}

export interface ErrorHost {
  onerror: ((message: unknown, source?: unknown, line?: unknown, col?: unknown, error?: unknown) => void) | null
  onunhandledrejection: ((event: { reason: unknown }) => void) | null
}

export function crashFileName(date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-')
  return `crash-${stamp}.log`
}

export function formatCrash(entry: { at: string; kind: string; message: string; stack?: string }): string {
  const stack = entry.stack ? `\n${entry.stack}` : ''
  return `[${entry.at}] ${entry.kind}: ${entry.message}${stack}\n`
}

export function sanitizeCrash(payload: unknown): CrashReport | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.kind !== 'error' && record.kind !== 'rejection') return null
  if (typeof record.message !== 'string' || record.message.trim().length === 0) return null
  const stack = typeof record.stack === 'string' ? record.stack.slice(0, 12000) : undefined
  return { kind: record.kind, message: record.message.slice(0, 4000), stack }
}

const TOAST = 'Something broke — your work is autosaved'

export function bindCrashGuard(
  host: ErrorHost,
  report: (entry: CrashReport) => void,
  toast: (message: string) => void,
): void {
  let toasted = false
  const note = (kind: CrashReport['kind'], message: unknown, stack?: string) => {
    const text = String(message ?? 'Unknown error').slice(0, 4000)
    try {
      report({ kind, message: text, stack: stack ? stack.slice(0, 12000) : undefined })
    } catch {
      /* reporting must not hide the toast */
    }
    if (toasted) return
    toasted = true
    try {
      toast(TOAST)
    } catch {
      /* a broken toast host is not another crash */
    }
  }
  host.onerror = (message, _source, _line, _col, error) => {
    const err = error instanceof Error ? error : null
    const text = err?.message || message
    note('error', text, err?.stack)
  }
  host.onunhandledrejection = (event) => {
    const reason = event?.reason
    if (reason instanceof Error) note('rejection', reason.message, reason.stack)
    else note('rejection', reason)
  }
}
