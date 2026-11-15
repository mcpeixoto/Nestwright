import { currentAudioContext, getBus, type BusName } from './engine'
import { pitchScale, SFX_NAMES, type SfxName } from './logic'

export { SFX_NAMES }
export type { SfxName }

/** A voice plays into the bus. A buffer is scheduled as-is; a function is a synth. */
export type SfxSynth = (ctx: AudioContext, destination: AudioNode, pitch: number) => void
export type SfxFactory = () => AudioBuffer | SfxSynth

export interface SfxOptions {
  /** Playback rate. Defaults to a random ±3%. */
  pitch?: number
}

interface Tone {
  type: OscillatorType
  freq: number
  at: number
  dur: number
  gain: number
  cutoff?: number
}

interface Noise {
  at: number
  dur: number
  gain: number
  cutoff: number
  filter: BiquadFilterType
}

interface Recipe {
  tones: Tone[]
  noise: Noise[]
}

/**
 * Short and quiet. Length is the last event's end, kept between 40 and 400 ms.
 * A later pack can replace any name via `registerSfx` with a decoded buffer.
 */
const RECIPES: Record<SfxName, Recipe> = {
  'place-item': {
    tones: [{ type: 'sine', freq: 168, at: 0, dur: 0.08, gain: 0.045, cutoff: 520 }],
    noise: [{ at: 0, dur: 0.05, gain: 0.06, cutoff: 880, filter: 'lowpass' }],
  },
  'place-wall': {
    tones: [{ type: 'sine', freq: 102, at: 0, dur: 0.11, gain: 0.05, cutoff: 400 }],
    noise: [{ at: 0, dur: 0.07, gain: 0.07, cutoff: 540, filter: 'lowpass' }],
  },
  snap: {
    tones: [{ type: 'sine', freq: 1760, at: 0, dur: 0.04, gain: 0.022 }],
    noise: [{ at: 0, dur: 0.03, gain: 0.035, cutoff: 2400, filter: 'highpass' }],
  },
  delete: {
    tones: [
      { type: 'sine', freq: 310, at: 0, dur: 0.05, gain: 0.04 },
      { type: 'sine', freq: 168, at: 0.045, dur: 0.07, gain: 0.032 },
    ],
    noise: [],
  },
  undo: {
    tones: [
      { type: 'triangle', freq: 523, at: 0, dur: 0.09, gain: 0.038 },
      { type: 'triangle', freq: 392, at: 0.07, dur: 0.09, gain: 0.036 },
    ],
    noise: [],
  },
  redo: {
    tones: [
      { type: 'triangle', freq: 392, at: 0, dur: 0.09, gain: 0.036 },
      { type: 'triangle', freq: 523, at: 0.07, dur: 0.09, gain: 0.038 },
    ],
    noise: [],
  },
  door: {
    tones: [{ type: 'sine', freq: 92, at: 0.02, dur: 0.12, gain: 0.048 }],
    noise: [{ at: 0, dur: 0.04, gain: 0.05, cutoff: 1400, filter: 'bandpass' }],
  },
  click: {
    tones: [{ type: 'sine', freq: 1180, at: 0, dur: 0.045, gain: 0.028 }],
    noise: [],
  },
  unlock: {
    tones: [
      { type: 'triangle', freq: 659, at: 0, dur: 0.16, gain: 0.04 },
      { type: 'triangle', freq: 880, at: 0.12, dur: 0.18, gain: 0.046 },
    ],
    noise: [],
  },
  'room-complete': {
    tones: [
      { type: 'triangle', freq: 262, at: 0, dur: 0.18, gain: 0.038, cutoff: 1400 },
      { type: 'triangle', freq: 330, at: 0.1, dur: 0.18, gain: 0.04, cutoff: 1400 },
      { type: 'triangle', freq: 392, at: 0.2, dur: 0.18, gain: 0.044, cutoff: 1600 },
    ],
    noise: [],
  },
}

const BUS: Record<SfxName, BusName> = {
  'place-item': 'world',
  'place-wall': 'world',
  snap: 'world',
  delete: 'world',
  undo: 'ui',
  redo: 'ui',
  door: 'world',
  click: 'ui',
  unlock: 'ui',
  'room-complete': 'world',
}

const RATE_MS = 60
const claimed = new Map<SfxName, number>()
let clock: () => number = () => Date.now()

function recipeSeconds(recipe: Recipe): number {
  let end = 0
  for (const tone of recipe.tones) end = Math.max(end, tone.at + tone.dur)
  for (const burst of recipe.noise) end = Math.max(end, burst.at + burst.dur)
  return end
}

export function sfxLengthMs(name: SfxName): number {
  return Math.round(recipeSeconds(RECIPES[name]) * 1000)
}

function envelope(param: AudioParam, start: number, dur: number, peak: number): void {
  const attack = Math.max(0.001, Math.min(dur * 0.3, 0.012))
  const end = start + Math.max(dur, attack + 0.001)
  param.setValueAtTime(0.0001, start)
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack)
  param.exponentialRampToValueAtTime(0.0001, end)
}

function playTone(ctx: AudioContext, dest: AudioNode, tone: Tone, pitch: number): void {
  const osc = ctx.createOscillator()
  osc.type = tone.type
  osc.frequency.value = tone.freq * pitch
  const gain = ctx.createGain()
  const start = ctx.currentTime + tone.at
  envelope(gain.gain, start, tone.dur, tone.gain)
  if (tone.cutoff) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = tone.cutoff
    filter.Q.value = 0.7
    osc.connect(filter)
    filter.connect(gain)
  } else {
    osc.connect(gain)
  }
  gain.connect(dest)
  osc.start(start)
  osc.stop(start + tone.dur + 0.02)
}

function playNoise(ctx: AudioContext, dest: AudioNode, burst: Noise, pitch: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * Math.max(burst.dur, 0.02)))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = pitch
  const filter = ctx.createBiquadFilter()
  filter.type = burst.filter
  filter.frequency.value = burst.cutoff
  filter.Q.value = 0.8
  const gain = ctx.createGain()
  const start = ctx.currentTime + burst.at
  envelope(gain.gain, start, burst.dur, burst.gain)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  src.start(start)
  src.stop(start + burst.dur + 0.02)
}

function playRecipe(ctx: AudioContext, dest: AudioNode, recipe: Recipe, pitch: number): void {
  for (const tone of recipe.tones) playTone(ctx, dest, tone, pitch)
  for (const burst of recipe.noise) playNoise(ctx, dest, burst, pitch)
}

function playBuffer(ctx: AudioContext, dest: AudioNode, buffer: AudioBuffer, pitch: number): void {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = pitch
  src.connect(dest)
  const start = ctx.currentTime
  src.start(start)
  if (Number.isFinite(buffer.duration) && buffer.duration > 0) src.stop(start + buffer.duration + 0.02)
}

const factories = new Map<SfxName, SfxFactory>()
for (const name of SFX_NAMES) {
  factories.set(name, () => (ctx, dest, pitch) => playRecipe(ctx, dest, RECIPES[name], pitch))
}
const defaultFactories = new Map(factories)

/** Swap one name for a decoded buffer (or a different synth) without touching call sites. */
export function registerSfx(name: SfxName, factory: SfxFactory): void {
  factories.set(name, factory)
}

function claim(name: SfxName, now: number): boolean {
  const prev = claimed.get(name)
  if (prev !== undefined && now - prev < RATE_MS) return false
  claimed.set(name, now)
  return true
}

export function sfx(name: SfxName, opts?: SfxOptions): void {
  const dest = getBus(BUS[name])
  const ctx = currentAudioContext()
  if (!dest || !ctx) return
  if (!claim(name, clock())) return
  const make = factories.get(name)
  if (!make) return
  const pitch = opts?.pitch ?? pitchScale(Math.random())
  try {
    const source = make()
    if (typeof source === 'function') source(ctx, dest, pitch)
    else playBuffer(ctx, dest, source, pitch)
  } catch {
    /* a broken voice must not break the edit that asked for it */
  }
}

export function setAudioClockForTests(fn: () => number): void {
  clock = fn
}

export function resetSfxForTests(): void {
  factories.clear()
  for (const [name, factory] of defaultFactories) factories.set(name, factory)
  claimed.clear()
  clock = () => Date.now()
}
