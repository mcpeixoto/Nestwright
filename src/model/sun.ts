export interface SunPosition {
  /** Radians clockwise from north. 0 = north, π/2 = east, π = south. */
  azimuth: number
  /** Radians above the horizon. Negative when the sun is down. */
  altitude: number
}

/**
 * Solar position from the Cooper declination and the standard altitude/azimuth
 * equations. Longitude and the equation of time are ignored: `hour` is solar time.
 */
export function sunPosition(dayOfYear: number, hour: number, latitudeDeg: number): SunPosition {
  const lat = (latitudeDeg * Math.PI) / 180
  const decl = ((23.45 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  const hourAngle = ((hour - 12) * 15 * Math.PI) / 180
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.min(1, Math.max(-1, sinAlt)))
  const cosAlt = Math.cos(altitude)
  let azimuth = 0
  if (Math.abs(cosAlt) > 1e-6) {
    const sinAz = (-Math.sin(hourAngle) * Math.cos(decl)) / cosAlt
    const cosAz =
      (Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(hourAngle)) / cosAlt
    azimuth = Math.atan2(sinAz, cosAz)
  }
  if (azimuth < 0) azimuth += Math.PI * 2
  return { azimuth, altitude }
}

/** Unit vector toward the sun. Plan +y is north, which is world +z. `hour` is solar time. */
export function sunVector(dayOfYear: number, hour: number, latitudeDeg: number): { x: number; y: number; z: number } {
  const { azimuth, altitude } = sunPosition(dayOfYear, hour, latitudeDeg)
  return {
    x: Math.cos(altitude) * Math.sin(azimuth),
    y: Math.sin(altitude),
    z: Math.cos(altitude) * Math.cos(azimuth),
  }
}

interface SiteClock {
  latitude: number
  /** Degrees east of Greenwich. */
  longitude: number
  /** Standard-time offset from UTC, hours, before daylight saving. */
  standardOffset: number
  /** When set, DST is the local summer (opposite months south of the equator). */
  daylightSaving: boolean
  southern: boolean
}

/** Preset sites the environment panel offers. Longitude is what makes the clock civil, not solar. */
const SITES: readonly SiteClock[] = [
  { latitude: 41.15, longitude: -8.63, standardOffset: 0, daylightSaving: true, southern: false },
  { latitude: 38.72, longitude: -9.14, standardOffset: 0, daylightSaving: true, southern: false },
  { latitude: 51.51, longitude: -0.13, standardOffset: 0, daylightSaving: true, southern: false },
  { latitude: 40.71, longitude: -74.01, standardOffset: -5, daylightSaving: true, southern: false },
  { latitude: -33.87, longitude: 151.21, standardOffset: 10, daylightSaving: true, southern: true },
  { latitude: 35.68, longitude: 139.69, standardOffset: 9, daylightSaving: false, southern: false },
  { latitude: 64.15, longitude: -21.94, standardOffset: 0, daylightSaving: false, southern: false },
]

/** Nearest preset within 0.25°, else Greenwich with no daylight saving. */
export function siteClock(latitudeDeg: number): SiteClock {
  let best = SITES[0]!
  let score = Infinity
  for (const site of SITES) {
    const d = Math.abs(site.latitude - latitudeDeg)
    if (d < score) {
      score = d
      best = site
    }
  }
  if (score > 0.25) {
    return { latitude: latitudeDeg, longitude: 0, standardOffset: 0, daylightSaving: false, southern: latitudeDeg < 0 }
  }
  return best
}

/** Approximate civil UTC offset, including a coarse daylight-saving season. */
export function utcOffsetHours(dayOfYear: number, latitudeDeg: number): number {
  const site = siteClock(latitudeDeg)
  if (!site.daylightSaving) return site.standardOffset
  const day = ((Math.round(dayOfYear) - 1) % 365) + 1
  const northernSummer = day >= 86 && day <= 299
  const dst = site.southern ? !northernSummer : northernSummer
  return site.standardOffset + (dst ? 1 : 0)
}

/** Equation of time in hours (Spencer). Positive means the sun is ahead of mean time. */
export function equationOfTimeHours(dayOfYear: number): number {
  const day = Number.isFinite(dayOfYear) ? dayOfYear : 172
  const b = (2 * Math.PI * (day - 81)) / 364
  const minutes = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
  return minutes / 60
}

/**
 * Local civil clock hour → solar hour for {@link sunPosition}.
 * The project clock is wall time at the preset nearest `latitudeDeg`
 * (Porto at 41.15°). Solar noon is not 12:00 there in summer.
 */
export function solarHour(dayOfYear: number, clockHour: number, latitudeDeg: number): number {
  const clock = Number.isFinite(clockHour) ? clockHour : 12
  const site = siteClock(latitudeDeg)
  const offset = utcOffsetHours(dayOfYear, latitudeDeg)
  return clock + equationOfTimeHours(dayOfYear) + (site.longitude - 15 * offset) / 15
}

/** Solar altitude for a civil clock hour at a preset latitude. */
export function clockAltitude(dayOfYear: number, clockHour: number, latitudeDeg: number): number {
  return sunPosition(dayOfYear, solarHour(dayOfYear, clockHour, latitudeDeg), latitudeDeg).altitude
}
