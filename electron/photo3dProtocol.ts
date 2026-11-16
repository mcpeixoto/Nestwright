/**
 * The photo-to-3D converter's stdout protocol. Pure, so it is unit-tested without Electron.
 *
 *   <command> --out <file.glb> [--quality fast|best] <image> [<image>...]
 *   PROGRESS <0..1> <stage words>   …   DONE <path>   (exit 0)
 *   or ERROR <message>                                 (exit ≠ 0)
 */

export type Photo3dQuality = 'fast' | 'best'

export type Photo3dLine =
  | { kind: 'progress'; value: number; stage: string }
  | { kind: 'done'; path: string }
  | { kind: 'error'; message: string }

/** Most photos a run accepts. */
export const PHOTO3D_MAX_IMAGES = 3
/** A run that takes longer than this is killed. */
export const PHOTO3D_TIMEOUT_MS = 15 * 60 * 1000
export const PHOTO3D_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'heic'] as const

/** One stdout line, or null for anything that is not part of the protocol (logs, blank lines). */
export function parsePhoto3dLine(raw: string): Photo3dLine | null {
  const line = raw.replace(/\r$/, '').trim()
  const match = /^(PROGRESS|DONE|ERROR)(?:\s+(.*))?$/.exec(line)
  if (!match) return null
  const rest = (match[2] ?? '').trim()
  if (match[1] === 'DONE') return rest ? { kind: 'done', path: rest } : null
  if (match[1] === 'ERROR') return { kind: 'error', message: rest || 'Unknown error' }
  const progress = /^(\S+)(?:\s+(.*))?$/.exec(rest)
  if (!progress) return null
  const value = Number(progress[1])
  if (!Number.isFinite(value)) return null
  return { kind: 'progress', value: Math.min(1, Math.max(0, value)), stage: (progress[2] ?? '').trim() }
}

/** Splits a byte stream into whole lines; a line cut across two chunks comes out once, whole. */
export class LineSplitter {
  private rest = ''

  push(chunk: string): string[] {
    const text = this.rest + chunk
    const parts = text.split('\n')
    this.rest = parts.pop() ?? ''
    return parts
  }

  /** What is left after the stream ends (a last line without a newline). */
  flush(): string[] {
    const rest = this.rest
    this.rest = ''
    return rest ? [rest] : []
  }
}

/** Arguments for the converter. Paths go in as separate argv entries; nothing is joined or quoted. */
export function photo3dArgs(out: string, quality: Photo3dQuality, images: readonly string[]): string[] {
  return ['--out', out, '--quality', quality, ...images]
}

export function normalizeQuality(value: unknown): Photo3dQuality {
  return value === 'best' ? 'best' : 'fast'
}

export function isPhotoPath(filePath: string): boolean {
  const ext = /\.([^./\\]+)$/.exec(filePath)?.[1]?.toLowerCase() ?? ''
  return (PHOTO3D_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * The setting wins; then the env var; then `fallback`, the converter that
 * `scripts/photo3d/setup.sh` installs under the app's data folder.
 */
export function resolvePhoto3dCommand(setting: unknown, env: string | undefined, fallback = ''): string {
  const typed = typeof setting === 'string' ? setting.trim() : ''
  if (typed) return typed
  const fromEnv = (env ?? '').trim()
  return fromEnv || fallback
}

/** Keeps the last `max` characters of stderr, for an error message when the converter says nothing. */
export function appendTail(tail: string, chunk: string, max = 2000): string {
  const next = tail + chunk
  return next.length > max ? next.slice(next.length - max) : next
}

export function lastLine(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines[lines.length - 1] ?? ''
}
