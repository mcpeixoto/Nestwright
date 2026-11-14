import fs from 'node:fs'
import path from 'node:path'

/** Bytes on disk of a file or directory tree (symlinks counted as links, not followed). */
export function treeSize(target) {
  const stat = fs.lstatSync(target)
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const entry of fs.readdirSync(target)) total += treeSize(path.join(target, entry))
  return total
}

export function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

/** One row per path; `ok` is false when the tree is missing or over the budget. */
export function checkBudgets(paths, maxBytes) {
  return paths.map((p) => {
    if (!fs.existsSync(p)) return { path: p, bytes: 0, ok: false, reason: 'missing' }
    const bytes = treeSize(p)
    return { path: p, bytes, ok: bytes <= maxBytes, reason: bytes <= maxBytes ? '' : 'over budget' }
  })
}
