/** Shared argv handling for the content scripts. */
import process from 'node:process'

export function log(message = '') {
  process.stdout.write(`${message}\n`)
}

export function warn(message = '') {
  process.stderr.write(`${message}\n`)
}

export function parseArgs(argv) {
  const out = { help: false, dryRun: false, webp: false, only: null, positionals: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--webp') out.webp = true
    else if (arg === '--only' || arg.startsWith('--only=')) {
      const raw = arg === '--only' ? argv[++i] : arg.slice('--only='.length)
      if (!raw) throw new Error('--only needs a comma-separated list of keys')
      out.only = raw.split(',').map((part) => part.trim()).filter(Boolean)
      if (out.only.length === 0) throw new Error('--only needs a comma-separated list of keys')
    } else if (arg.startsWith('-')) throw new Error(`unknown argument ${arg}`)
    else out.positionals.push(arg)
  }
  return out
}

export function run(main) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    warn(message)
    if (process.env.CONTENT_DEBUG && err instanceof Error && err.stack) warn(err.stack)
    process.exitCode = 1
  })
}
