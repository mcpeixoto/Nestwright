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
