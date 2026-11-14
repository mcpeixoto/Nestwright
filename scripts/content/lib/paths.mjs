import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const repoRoot = join(here, '..', '..', '..')

export const paths = {
  root: repoRoot,
  sources: join(repoRoot, 'content', 'sources.json'),
  lock: join(repoRoot, 'content', 'lock.json'),
  manifests: join(repoRoot, 'content', 'manifest'),
  cache: join(repoRoot, 'content', 'cache'),
  output: join(repoRoot, 'public', 'content'),
  assetsDoc: join(repoRoot, 'docs', 'ASSETS.md'),
  library: join(repoRoot, 'src', 'materials', 'library.ts'),
  catalogEntries: join(repoRoot, 'src', 'catalog', 'entries'),
  src: join(repoRoot, 'src'),
}

export function cacheDir(entry) {
  return join(paths.cache, entry.provider, entry.sourceId, entry.resolution)
}
