// node scripts/packaging/check-size.mjs [--max-mib 2048] <unpacked dir>...
// The unpacked build is what a Steam depot installs, so its size is the installed size.
import { checkBudgets, formatMiB } from './size.mjs'
import console from 'node:console'
import process from 'node:process'

const args = process.argv.slice(2)
let maxMiB = 2048
const paths = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-mib') maxMiB = Number(args[++i])
  else paths.push(args[i])
}
if (!paths.length || !Number.isFinite(maxMiB) || maxMiB <= 0) {
  console.error('usage: check-size.mjs [--max-mib N] <dir>...')
  process.exit(2)
}
const rows = checkBudgets(paths, maxMiB * 1024 * 1024)
for (const row of rows) {
  console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${formatMiB(row.bytes).padStart(12)} / ${maxMiB} MiB  ${row.path}${row.reason ? `  (${row.reason})` : ''}`)
}
process.exit(rows.every((r) => r.ok) ? 0 : 1)
