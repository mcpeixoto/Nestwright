export interface VolumeSettings {
  /** 0–100. */
  volumeMaster: number
  volumeEffects: number
  volumeAmbience: number
  muted: boolean
}

export interface BusGains {
  /** Master gain. Zero while muted, so every bus goes silent. */
  master: number
  /** ui and world. */
  effects: number
  ambience: number
  /** No music slider yet; the master gain still scales this bus. */
  music: number
}

function unit(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(1, Math.max(0, percent / 100))
}

function masterUnit(settings: { volumeMaster: number; muted: boolean }): number {
  return settings.muted ? 0 : unit(settings.volumeMaster)
}

/** Linear gains for the four buses. Effects and ambience are heard through the master. */
export function busGains(settings: VolumeSettings): BusGains {
  return {
    master: masterUnit(settings),
    effects: unit(settings.volumeEffects),
    ambience: unit(settings.volumeAmbience),
    music: 1,
  }
}

/** What an effects voice actually reaches the speakers at: master × effects, or 0 when muted. */
export function audibleEffects(settings: { volumeMaster: number; volumeEffects: number; muted: boolean }): number {
  return masterUnit(settings) * unit(settings.volumeEffects)
}

export function audibleAmbience(settings: { volumeMaster: number; volumeAmbience: number; muted: boolean }): number {
  return masterUnit(settings) * unit(settings.volumeAmbience)
}
