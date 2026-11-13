/** sRGB byte (0–255) → linear working-space channel. Vertex colours and raw pixels need this. */
export function srgbByteToLinear(byte: number): number {
  const c = Math.min(255, Math.max(0, byte)) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function linearToSrgbByte(linear: number): number {
  const c = Math.min(1, Math.max(0, linear))
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}

/** Packed sRGB hex (0xRRGGBB) → linear RGB. Three.js vertex colours are linear. */
export function srgbHexToLinear(hex: number): [number, number, number] {
  return [srgbByteToLinear((hex >> 16) & 255), srgbByteToLinear((hex >> 8) & 255), srgbByteToLinear(hex & 255)]
}
