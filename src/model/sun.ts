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

/** Unit vector toward the sun. Plan +y is north, which is world +z. */
export function sunVector(dayOfYear: number, hour: number, latitudeDeg: number): { x: number; y: number; z: number } {
  const { azimuth, altitude } = sunPosition(dayOfYear, hour, latitudeDeg)
  return {
    x: Math.cos(altitude) * Math.sin(azimuth),
    y: Math.sin(altitude),
    z: Math.cos(altitude) * Math.cos(azimuth),
  }
}
