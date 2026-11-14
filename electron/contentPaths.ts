import path from 'node:path'

/** Mirrors `CONTENT_SCHEME` in src/materials/contentUrl.ts. */
export const CONTENT_SCHEME = 'nwcontent'

export interface ContentRoots {
  /** Folders that may hold the content pack, first match wins. */
  content: string[]
  /** Folders that may hold basis_transcoder.{js,wasm}. */
  basis: string[]
}

/** Where the pack and the KTX2 transcoder can live, packaged and unpackaged. */
export function contentRoots(opts: { resourcesPath: string; userData: string; appPath: string }): ContentRoots {
  return {
    content: [
      path.join(opts.resourcesPath, 'content'),
      path.join(opts.userData, 'content'),
      path.join(opts.appPath, 'public', 'content'),
    ],
    basis: [
      path.join(opts.resourcesPath, 'basis'),
      path.join(opts.appPath, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis'),
    ],
  }
}

/**
 * Map `nwcontent://content/<path>` or `nwcontent://basis/<file>` onto candidate files.
 * Null for any other host, an empty path, or a path that escapes its root.
 */
export function contentCandidates(url: string, roots: ContentRoots): string[] | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${CONTENT_SCHEME}:`) return null
  const bases = parsed.hostname === 'content' ? roots.content : parsed.hostname === 'basis' ? roots.basis : null
  if (!bases) return null
  let rel: string
  try {
    rel = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (!rel || rel.includes('\0')) return null
  const out: string[] = []
  for (const base of bases) {
    const abs = path.resolve(base, rel)
    if (abs !== base && abs.startsWith(base + path.sep)) out.push(abs)
  }
  return out.length ? out : null
}

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.ktx2': 'image/ktx2',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.webp': 'image/webp',
  '.png': 'image/png',
}

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Body served for a missing index.json, so the game logs "no pack" instead of a 404. */
export const EMPTY_INDEX = '{"version":1,"textures":{}}'
