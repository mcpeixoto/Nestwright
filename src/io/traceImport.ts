const MAX_EDGE = 4096
/** Data-URL length under which a PNG is kept instead of JPEG. */
const PNG_SMALL = 400_000

export interface PreparedTrace {
  src: string
  width: number
  height: number
}

function asDataUrl(name: string, data: string): string {
  if (data.startsWith('data:')) return data
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg'
  return `data:${mime};base64,${data}`
}

function isPdf(name: string, dataUrl: string): boolean {
  return dataUrl.startsWith('data:application/pdf') || /\.pdf$/i.test(name)
}

function bytesFromPayload(data: string): Uint8Array {
  const comma = data.indexOf(',')
  const payload = data.startsWith('data:') && comma >= 0 ? data.slice(comma + 1) : data
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255
  return bytes
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read that image.'))
    image.src = src
  })
}

/** Downscale to at most 4096 px on the long side and re-encode. */
export function encodeTraceSource(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): PreparedTrace {
  const long = Math.max(srcW, srcH, 1)
  const factor = long > MAX_EDGE ? MAX_EDGE / long : 1
  const width = Math.max(1, Math.round(srcW * factor))
  const height = Math.max(1, Math.round(srcH * factor))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image.')
  ctx.drawImage(source, 0, 0, width, height)
  const png = canvas.toDataURL('image/png')
  if (png.length <= PNG_SMALL) return { src: png, width, height }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return { src: canvas.toDataURL('image/jpeg', 0.85), width, height }
}

/** PNG, JPEG, WebP, or a PDF (page 1). `data` may be a data URL or raw base64. */
export async function prepareTraceImage(name: string, data: string): Promise<PreparedTrace> {
  const dataUrl = asDataUrl(name, data)
  if (isPdf(name, dataUrl)) {
    const { rasterizePdf } = await import('./pdfTrace')
    const canvas = await rasterizePdf(bytesFromPayload(dataUrl))
    return encodeTraceSource(canvas, canvas.width, canvas.height)
  }
  const image = await loadImage(dataUrl)
  return encodeTraceSource(image, image.naturalWidth, image.naturalHeight)
}
