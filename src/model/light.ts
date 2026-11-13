/** Black-body approximation (Tanner Helland). Returns #rrggbb. */
export function kelvinToHex(kelvin: number): string {
  const temp = Math.min(40000, Math.max(1000, kelvin)) / 100
  let r: number
  let g: number
  let b: number
  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592
    g = 288.1221695283 * (temp - 60) ** -0.0755148492
    b = 255
  }
  const channel = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function clampKelvin(value: number): number {
  if (!Number.isFinite(value)) return 2700
  return Math.min(6500, Math.max(2200, value))
}
