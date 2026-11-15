/** ORM channel plan. Absent AO is white, absent metalness is black, absent roughness is mid grey. */
export function ormPlan({ ao = false, roughness = false, metalness = false } = {}) {
  return {
    r: ao ? 'ao' : 'white',
    g: roughness ? 'roughness' : 'grey',
    b: metalness ? 'metalness' : 'black',
  }
}

const ORM_FILL = { white: 255, grey: 128, black: 0 }

/** Byte a constant channel writes. `null` means the channel is sampled from a map. */
export function ormFillByte(source) {
  if (source in ORM_FILL) return ORM_FILL[source]
  return null
}

function toLinear(byte) {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toByte(linear) {
  const v = Math.min(1, Math.max(0, linear))
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(c * 255)
}

/**
 * Lerp every texel toward the image's mean colour in linear light, in place. `contrast` 1
 * keeps the scan, 0 flattens it to the mean. Painted plaster is nearly one colour; its
 * character belongs in the normal and roughness maps, not in albedo blotches.
 */
export function applyAlbedoContrast(raw, channels, contrast) {
  if (contrast == null || contrast >= 1) return raw
  const k = Math.max(0, contrast)
  const count = raw.length / channels
  if (!Number.isInteger(count) || count === 0) throw new Error('raw buffer is not a whole pixel grid')
  const lut = new Float64Array(256)
  for (let i = 0; i < 256; i++) lut[i] = toLinear(i)
  const mean = [0, 0, 0]
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) mean[c] += lut[raw[i * channels + c]]
  for (let c = 0; c < 3; c++) mean[c] /= count
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      const at = i * channels + c
      raw[at] = toByte(mean[c] + (lut[raw[at]] - mean[c]) * k)
    }
  }
  return raw
}

/** Mean of an interleaved raw RGB(A) buffer, in sRGB 0–255. */
export function meanSrgb(raw, channels = 3) {
  if (raw.length % channels !== 0) throw new Error('raw buffer is not a whole pixel grid')
  const count = raw.length / channels
  if (count === 0) throw new Error('empty image')
  const acc = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    acc[0] += raw[i * channels]
    acc[1] += raw[i * channels + 1]
    acc[2] += raw[i * channels + 2]
  }
  return acc.map((value) => Math.round((value / count) * 1000) / 1000)
}
