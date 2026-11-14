import { app, protocol } from 'electron'
import fs from 'node:fs/promises'
import { CONTENT_SCHEME, EMPTY_INDEX, contentCandidates, contentRoots, contentType } from './contentPaths'

/** Call before `app.whenReady()`: privileges can only be granted before the app is ready. */
export function registerContentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CONTENT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ])
}

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }

/**
 * Serve the content pack (resources/content, then userData/content, then the repo's
 * public/content when unpackaged) and the KTX2 transcoder to the file:// page.
 */
export function handleContentScheme(): void {
  const roots = contentRoots({
    resourcesPath: process.resourcesPath,
    userData: app.getPath('userData'),
    appPath: app.getAppPath(),
  })
  protocol.handle(CONTENT_SCHEME, async (request) => {
    const candidates = contentCandidates(request.url, roots)
    if (!candidates) return new Response('bad request', { status: 400, headers: HEADERS })
    for (const file of candidates) {
      try {
        const body = await fs.readFile(file)
        return new Response(body, { status: 200, headers: { ...HEADERS, 'Content-Type': contentType(file) } })
      } catch {
        // try the next root
      }
    }
    if (request.url.endsWith('/index.json')) {
      return new Response(EMPTY_INDEX, { status: 200, headers: { ...HEADERS, 'Content-Type': 'application/json' } })
    }
    return new Response('not found', { status: 404, headers: HEADERS })
  })
}
