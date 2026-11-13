export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const parts: string[] = []
  const size = 0x2000
  for (let i = 0; i < bytes.length; i += size) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + size))
    parts.push(String.fromCharCode(...slice))
  }
  return `data:${mime};base64,${btoa(parts.join(''))}`
}
