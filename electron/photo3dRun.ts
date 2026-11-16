import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import {
  LineSplitter,
  PHOTO3D_TIMEOUT_MS,
  appendTail,
  lastLine,
  parsePhoto3dLine,
  photo3dArgs,
  type Photo3dQuality,
} from './photo3dProtocol'

export type Photo3dResult =
  | { ok: true; data: string }
  | { ok: false; error: string; cancelled?: boolean }

export interface Photo3dRunOptions {
  command: string
  images: readonly string[]
  quality: Photo3dQuality
  /** Where the converter writes the GLB. Deleted once read. */
  out: string
  onProgress?: (value: number, stage: string) => void
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

export interface Photo3dRun {
  result: Promise<Photo3dResult>
  cancel(): void
}

/**
 * Runs the converter once. `spawn` gets the command as an executable path and every argument
 * as its own argv entry, with no shell, so nothing the player typed is ever parsed as a command line.
 */
export function runPhoto3d(options: Photo3dRunOptions): Photo3dRun {
  let child: ChildProcess | null = null
  let cancelled = false
  let timedOut = false
  let killTimer: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    killTimer = setTimeout(() => {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 3000)
  }

  const result = new Promise<Photo3dResult>((resolve) => {
    let settled = false
    const finish = (value: Photo3dResult) => {
      if (settled) return
      settled = true
      if (killTimer) clearTimeout(killTimer)
      clearTimeout(timer)
      void fs
        .rm(options.out, { force: true })
        .catch(() => {})
        .then(() => resolve(value))
    }

    try {
      child = spawn(options.command, photo3dArgs(options.out, options.quality, options.images), {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.env ?? process.env,
        windowsHide: true,
      })
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
      return
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeoutMs ?? PHOTO3D_TIMEOUT_MS)

    const splitter = new LineSplitter()
    let donePath: string | null = null
    let errorMessage: string | null = null
    let stderrTail = ''

    const handle = (line: string) => {
      const parsed = parsePhoto3dLine(line)
      if (!parsed) return
      if (parsed.kind === 'progress') options.onProgress?.(parsed.value, parsed.stage)
      else if (parsed.kind === 'done') donePath = parsed.path
      else errorMessage = parsed.message
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      for (const line of splitter.push(chunk)) handle(line)
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderrTail = appendTail(stderrTail, chunk)
    })
    child.on('error', (err) => {
      finish({ ok: false, error: err.message })
    })
    child.on('close', (code) => {
      for (const line of splitter.flush()) handle(line)
      if (cancelled) {
        finish({ ok: false, error: 'Cancelled', cancelled: true })
        return
      }
      if (timedOut) {
        finish({ ok: false, error: 'The converter took too long and was stopped.' })
        return
      }
      if (errorMessage) {
        finish({ ok: false, error: errorMessage })
        return
      }
      if (code !== 0) {
        finish({ ok: false, error: lastLine(stderrTail) || `The converter exited with code ${String(code)}.` })
        return
      }
      const target = donePath ?? options.out
      void fs.readFile(target).then(
        (bytes) => {
          if (bytes.byteLength < 20) finish({ ok: false, error: 'The converter wrote an empty model.' })
          else finish({ ok: true, data: bytes.toString('base64') })
        },
        () => finish({ ok: false, error: 'The converter finished without writing a model.' }),
      )
    })
  })

  return {
    result,
    cancel() {
      cancelled = true
      stop()
    },
  }
}
