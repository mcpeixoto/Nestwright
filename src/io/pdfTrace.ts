import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'

// pdfjs-dist is pinned to 5.4.296: 6.x calls Map.prototype.getOrInsertComputed, which the
// Chromium in Electron 39 lacks, so PDF import failed in the app (checked with Playwright _electron).
const LONG_SIDE = 2000

let workerSrcReady = false

/**
 * pdf.js loads its worker from `workerSrc`. Under Electron `loadFile` the page
 * origin is `"null"`, so a file:// worker URL is treated as cross-origin and
 * the worker never starts. An inline Vite worker is a blob created by the
 * page, which works for http preview and for file://. `workerSrc` stays set
 * so the library's fallback path has a URL if the port is missing.
 */
function configureWorker(port: Worker): void {
  if (!workerSrcReady) {
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
    workerSrcReady = true
  }
  GlobalWorkerOptions.workerPort = port
}

/** Rasterise PDF page 1 so the long side is about 2000 px. */
export async function rasterizePdf(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const port = new PdfWorker()
  configureWorker(port)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const task = getDocument({
    data: copy,
    verbosity: VerbosityLevel.ERRORS,
    useSystemFonts: true,
    useWasm: false,
  })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const long = Math.max(base.width, base.height, 1)
    const viewport = page.getViewport({ scale: LONG_SIDE / long })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    await page.render({ canvas, viewport }).promise
    page.cleanup()
    return canvas
  } finally {
    await task.destroy().catch(() => undefined)
    port.terminate()
    if (GlobalWorkerOptions.workerPort === port) GlobalWorkerOptions.workerPort = null
  }
}
