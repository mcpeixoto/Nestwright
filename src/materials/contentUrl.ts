/**
 * Where the content pack lives. Dev and the visual harness serve `public/content` over http;
 * the packaged app loads `index.html` from file://, where fetch does not work, so Electron
 * serves the pack on the privileged `nwcontent://` scheme instead (see electron/contentProtocol.ts).
 */
export const CONTENT_SCHEME = 'nwcontent'

function pageProtocol(): string {
  try {
    return globalThis.location?.protocol ?? ''
  } catch {
    return ''
  }
}

function clean(path: string): string {
  return path.replace(/^\/+/, '')
}

/** URL of a file inside the content pack, e.g. `contentUrl('textures/oak-planks-tex/albedo.ktx2')`. */
export function contentUrl(path: string, protocol: string = pageProtocol()): string {
  if (protocol === 'file:') return `${CONTENT_SCHEME}://content/${clean(path)}`
  return `./content/${clean(path)}`
}

/**
 * Folder holding basis_transcoder.{js,wasm}. Empty means "next to KTX2Loader", which Vite
 * resolves for http pages; file:// pages cannot fetch it, so Electron serves a copy.
 */
export function transcoderPath(protocol: string = pageProtocol()): string {
  return protocol === 'file:' ? `${CONTENT_SCHEME}://basis/` : ''
}
