import { currentAudioContext, getBus } from './engine'

export type AmbienceView = '2d' | '3d' | 'split' | 'walk'
export type Rng = () => number

export interface AmbienceInput {
  /** 0 night … 1 full daylight. Values outside 0..1 are clamped. */
  daylight: number
  indoor: boolean
  view: AmbienceView
  /**
   * Passed through from the project weather. The wind, birds, and crickets do not
   * retune for rain; a rain bed can read this later without changing the mix contract.
   */
  rain?: boolean
}

export interface MixLevels {
  birds: number
  crickets: number
  wind: number
  /** 1 outdoors, about −8 dB indoors, 0 on the plan. */
  master: number
  lowpassHz: number
  /** 1 s when the plan silences the bed, otherwise 1.5 s. */
  fadeSeconds: number
}

/** Open enough that a 5 kHz chirp is not muffled outdoors. */
const OPEN_LOWPASS_HZ = 16000
const INDOOR_LOWPASS_HZ = 700
/** −8 dB as a linear amplitude. */
const INDOOR_MASTER = 10 ** (-8 / 20)

const BIRD_PEAK = 0.04
const CRICKET_PEAK = 0.032
const WIND_PEAK = 0.016
const POLL_MS = 500

export interface BirdNote {
  at: number
  freq: number
  endFreq: number
  dur: number
}

export interface BirdPhrase {
  species: 0 | 1 | 2
  /** Seconds from now until the phrase. */
  wait: number
  /** −1 left … 1 right. */
  pan: number
  timbre: 'sine' | 'fm'
  notes: BirdNote[]
}

export interface CricketPulse {
  at: number
  dur: number
}

export interface CricketTrain {
  voice: 0 | 1 | 2
  freq: number
  pulses: CricketPulse[]
  /** Silence after the last pulse. Short most of the time, occasionally a real break. */
  breakAfter: number
}

export interface Gust {
  wait: number
  cutoff: number
  /** 0..1 swell on the wind bed. */
  level: number
}

/** Centres a little apart so three crickets do not sing the same note. */
const CRICKET_HZ = [4320, 4500, 4680] as const

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unit(rng: Rng): number {
  const value = rng()
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 0.999999
  return value
}

function range(rng: Rng, min: number, max: number): number {
  return min + unit(rng) * (max - min)
}

function intRange(rng: Rng, min: number, max: number): number {
  return min + Math.floor(unit(rng) * (max - min + 1))
}

/** Birds follow the day, crickets the night, wind always. The plan fades the whole bed out. */
export function ambienceMix(input: AmbienceInput): MixLevels {
  const daylight = clamp01(input.daylight)
  if (input.view === '2d') {
    return {
      birds: 0,
      crickets: 0,
      wind: 0,
      master: 0,
      lowpassHz: input.indoor ? INDOOR_LOWPASS_HZ : OPEN_LOWPASS_HZ,
      fadeSeconds: 1,
    }
  }
  return {
    birds: daylight,
    crickets: 1 - daylight,
    wind: 1,
    master: input.indoor ? INDOOR_MASTER : 1,
    lowpassHz: input.indoor ? INDOOR_LOWPASS_HZ : OPEN_LOWPASS_HZ,
    fadeSeconds: 1.5,
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** Linear crossfade. `duration` is the mix's fade (1 s onto the plan, 1.5 s otherwise). */
export function crossfadeMix(from: MixLevels, to: MixLevels, elapsed: number, duration: number): MixLevels {
  const t = duration <= 0 ? 1 : clamp01(elapsed / duration)
  return {
    birds: lerp(from.birds, to.birds, t),
    crickets: lerp(from.crickets, to.crickets, t),
    wind: lerp(from.wind, to.wind, t),
    master: lerp(from.master, to.master, t),
    lowpassHz: lerp(from.lowpassHz, to.lowpassHz, t),
    fadeSeconds: to.fadeSeconds,
  }
}

/**
 * Three daytime patterns inside the shared chirp bounds.
 * 0 rises on a sine, 1 falls on a sine, 2 alternates two pitches with FM.
 */
export function nextBirdPhrase(rng: Rng): BirdPhrase {
  const species = Math.min(2, Math.floor(unit(rng) * 3)) as 0 | 1 | 2
  const wait = range(rng, 3, 10)
  const pan = range(rng, -1, 1)
  if (species === 0) {
    const count = intRange(rng, 3, 5)
    let cursor = range(rng, 2200, 3200)
    const notes: BirdNote[] = []
    let at = 0
    for (let i = 0; i < count; i++) {
      const freq = clamp(cursor, 2000, 4800)
      const endFreq = clamp(freq + range(rng, 40, 280), freq, 5000)
      const dur = range(rng, 0.06, 0.12)
      notes.push({ at, freq, endFreq, dur })
      at += dur + range(rng, 0.03, 0.07)
      cursor = freq + range(rng, 120, 380)
    }
    return { species, wait, pan, timbre: 'sine', notes }
  }
  if (species === 1) {
    const count = intRange(rng, 2, 4)
    let cursor = range(rng, 3800, 4800)
    const notes: BirdNote[] = []
    let at = 0
    for (let i = 0; i < count; i++) {
      const freq = clamp(cursor, 2200, 5000)
      const endFreq = clamp(freq - range(rng, 40, 280), 2000, freq)
      const dur = range(rng, 0.1, 0.18)
      notes.push({ at, freq, endFreq, dur })
      at += dur + range(rng, 0.04, 0.09)
      cursor = freq - range(rng, 150, 420)
    }
    return { species, wait, pan, timbre: 'sine', notes }
  }
  const count = unit(rng) < 0.5 ? 4 : 6
  const low = range(rng, 2200, 3000)
  const high = clamp(low + range(rng, 500, 1400), low + 200, 5000)
  const notes: BirdNote[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    const freq = i % 2 === 0 ? low : high
    const endFreq = i % 2 === 0 ? high : low
    const dur = range(rng, 0.06, 0.14)
    notes.push({ at, freq, endFreq, dur })
    at += dur + range(rng, 0.02, 0.05)
  }
  return { species: 2, wait, pan, timbre: 'fm', notes }
}

/** One chirp train for a voice. The three centres stay inside 4.2–4.8 kHz after detune. */
export function nextCricketTrain(rng: Rng, voice: 0 | 1 | 2): CricketTrain {
  const freq = clamp(CRICKET_HZ[voice] + range(rng, -35, 35), 4200, 4800)
  const count = intRange(rng, 6, 16)
  const pulses: CricketPulse[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    const dur = range(rng, 0.012, 0.028)
    pulses.push({ at, dur })
    at += dur + range(rng, 0.02, 0.045)
  }
  const breakAfter = unit(rng) < 0.3 ? range(rng, 0.5, 2.2) : range(rng, 0.05, 0.18)
  return { voice, freq, pulses, breakAfter }
}

/** A slow gust: new bandpass centre and a swell, 4–12 s apart. */
export function nextGust(rng: Rng): Gust {
  return {
    wait: range(rng, 4, 12),
    cutoff: range(rng, 300, 900),
    level: range(rng, 0.35, 1),
  }
}

/** Paul Kellet's economy pink filter. The bandpass does the rest of the wind. */
function fillPinkNoise(data: Float32Array, rng: Rng): void {
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < data.length; i++) {
    const white = rng() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
}

type Reader = () => AmbienceInput

let reader: Reader | null = null
let timer: ReturnType<typeof setInterval> | null = null
let builtFor: AudioContext | null = null
let wind: AudioBufferSourceNode | null = null
let windFilter: BiquadFilterNode | null = null
let gustGain: GainNode | null = null
let windGain: GainNode | null = null
let birdGain: GainNode | null = null
let cricketGain: GainNode | null = null
let lowpass: BiquadFilterNode | null = null
let masterGain: GainNode | null = null
let crickets: OscillatorNode[] = []
let voiceGains: GainNode[] = []
let nextBirdAt = 0
let nextGustAt = 0
let cricketAt: number[] = [0, 0, 0]
let held: MixLevels | null = null

function sameMix(a: MixLevels, b: MixLevels): boolean {
  return (
    a.birds === b.birds &&
    a.crickets === b.crickets &&
    a.wind === b.wind &&
    a.master === b.master &&
    a.lowpassHz === b.lowpassHz
  )
}

function ramp(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(value, now + Math.max(0.05, seconds))
}

function stopGraph(): void {
  try {
    wind?.stop()
  } catch {
    /* already stopped */
  }
  for (const osc of crickets) {
    try {
      osc.stop()
    } catch {
      /* already stopped */
    }
  }
  wind = null
  windFilter = null
  gustGain = null
  windGain = null
  birdGain = null
  cricketGain = null
  lowpass = null
  masterGain = null
  crickets = []
  voiceGains = []
  builtFor = null
  held = null
}

function ensure(ctx: AudioContext, bus: AudioNode): void {
  if (builtFor === ctx && wind) return
  stopGraph()
  builtFor = ctx
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  fillPinkNoise(buffer.getChannelData(0), Math.random)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  windFilter = ctx.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 550
  windFilter.Q.value = 0.65
  gustGain = ctx.createGain()
  gustGain.gain.value = 0.55
  windGain = ctx.createGain()
  windGain.gain.value = 0
  birdGain = ctx.createGain()
  birdGain.gain.value = 0
  cricketGain = ctx.createGain()
  cricketGain.gain.value = 0
  lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = OPEN_LOWPASS_HZ
  lowpass.Q.value = 0.5
  masterGain = ctx.createGain()
  masterGain.gain.value = 0
  source.connect(windFilter)
  windFilter.connect(gustGain)
  gustGain.connect(windGain)
  windGain.connect(lowpass)
  birdGain.connect(lowpass)
  cricketGain.connect(lowpass)
  lowpass.connect(masterGain)
  masterGain.connect(bus)
  source.start()
  wind = source
  crickets = CRICKET_HZ.map((freq) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(cricketGain as GainNode)
    osc.start()
    voiceGains.push(gain)
    return osc
  })
  const now = ctx.currentTime
  nextBirdAt = now + 3
  nextGustAt = now + 4
  cricketAt = [now + 0.05, now + 0.08, now + 0.12]
}

function applyMix(ctx: AudioContext, target: MixLevels): void {
  if (!birdGain || !cricketGain || !windGain || !masterGain || !lowpass) return
  if (held && sameMix(held, target)) return
  const now = ctx.currentTime
  ramp(birdGain.gain, target.birds * BIRD_PEAK, now, target.fadeSeconds)
  ramp(cricketGain.gain, target.crickets * CRICKET_PEAK, now, target.fadeSeconds)
  ramp(windGain.gain, target.wind * WIND_PEAK, now, target.fadeSeconds)
  ramp(masterGain.gain, target.master, now, target.fadeSeconds)
  ramp(lowpass.frequency, target.lowpassHz, now, target.fadeSeconds)
  held = target
}

function scheduleBird(ctx: AudioContext, dest: AudioNode, start: number, phrase: BirdPhrase): void {
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
  const target = panner ?? dest
  if (panner) {
    panner.pan.setValueAtTime(phrase.pan, start)
    panner.connect(dest)
  }
  for (const note of phrase.notes) {
    const when = start + note.at
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(note.freq, when)
    osc.frequency.linearRampToValueAtTime(Math.max(1, note.endFreq), when + Math.max(0.02, note.dur))
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(0.85, when + Math.min(0.02, note.dur * 0.35))
    gain.gain.linearRampToValueAtTime(0.0001, when + note.dur)
    if (phrase.timbre === 'fm') {
      const mod = ctx.createOscillator()
      const depth = ctx.createGain()
      mod.frequency.value = 34
      depth.gain.value = 90
      mod.connect(depth)
      depth.connect(osc.frequency)
      mod.start(when)
      mod.stop(when + note.dur + 0.02)
    }
    osc.connect(gain)
    gain.connect(target)
    osc.start(when)
    osc.stop(when + note.dur + 0.02)
  }
}

function scheduleTrain(osc: OscillatorNode, gain: GainNode, start: number, train: CricketTrain): void {
  osc.frequency.setValueAtTime(train.freq, start)
  for (const pulse of train.pulses) {
    const on = start + pulse.at
    const off = on + pulse.dur
    gain.gain.setValueAtTime(0.0001, on)
    gain.gain.linearRampToValueAtTime(1, on + Math.min(0.008, pulse.dur * 0.45))
    gain.gain.linearRampToValueAtTime(0.0001, off)
  }
}

function schedule(ctx: AudioContext, target: MixLevels): void {
  const horizon = ctx.currentTime + 0.6
  const audible = target.master > 0.001
  if (!audible || target.birds <= 0.001) {
    nextBirdAt = Math.max(nextBirdAt, ctx.currentTime + 3)
  } else if (birdGain) {
    if (nextBirdAt < ctx.currentTime) nextBirdAt = ctx.currentTime + 0.05
    let guard = 0
    while (nextBirdAt <= horizon && guard < 3) {
      const phrase = nextBirdPhrase(Math.random)
      scheduleBird(ctx, birdGain, nextBirdAt, phrase)
      nextBirdAt += Math.max(3, phrase.wait)
      guard += 1
    }
  }
  if (!audible || target.crickets <= 0.001) {
    cricketAt = cricketAt.map(() => ctx.currentTime + 0.05)
  } else {
    for (let voice = 0; voice < 3; voice++) {
      const osc = crickets[voice]
      const gain = voiceGains[voice]
      if (!osc || !gain) continue
      let guard = 0
      while ((cricketAt[voice] ?? 0) <= horizon && guard < 4) {
        const at = Math.max(ctx.currentTime + 0.02, cricketAt[voice] ?? ctx.currentTime)
        const train = nextCricketTrain(Math.random, voice as 0 | 1 | 2)
        scheduleTrain(osc, gain, at, train)
        const last = train.pulses[train.pulses.length - 1]
        cricketAt[voice] = at + (last ? last.at + last.dur : 0) + train.breakAfter
        guard += 1
      }
    }
  }
  if (!windFilter || !gustGain) return
  if (!audible || target.wind <= 0.001) {
    nextGustAt = Math.max(nextGustAt, ctx.currentTime + 4)
    return
  }
  if (nextGustAt > horizon) return
  const gust = nextGust(Math.random)
  const when = Math.max(ctx.currentTime, nextGustAt)
  windFilter.frequency.cancelScheduledValues(when)
  windFilter.frequency.setValueAtTime(windFilter.frequency.value, when)
  windFilter.frequency.linearRampToValueAtTime(gust.cutoff, when + 1.2)
  gustGain.gain.cancelScheduledValues(when)
  gustGain.gain.setValueAtTime(gustGain.gain.value, when)
  gustGain.gain.linearRampToValueAtTime(gust.level, when + 1.2)
  nextGustAt = when + gust.wait
}

/**
 * One poll. Does nothing until a gesture has created the context — this never calls
 * `openAudio`. The ambience bus already carries the ambience slider and the mute.
 */
export function syncAmbience(): void {
  if (!reader) return
  const ctx = currentAudioContext()
  const bus = getBus('ambience')
  if (!ctx || !bus) return
  try {
    ensure(ctx, bus)
    const target = ambienceMix(reader())
    applyMix(ctx, target)
    schedule(ctx, target)
  } catch {
    /* a broken bed must not break the edit */
  }
}

/** Poll the scene at 2 Hz. The bed starts on the first poll that finds a context. */
export function installAmbience(read: Reader): () => void {
  resetAmbienceForTests()
  reader = read
  const handle = setInterval(() => syncAmbience(), POLL_MS)
  if (typeof handle === 'object' && handle && 'unref' in handle) handle.unref()
  timer = handle
  return () => resetAmbienceForTests()
}

export function resetAmbienceForTests(): void {
  if (timer) clearInterval(timer)
  timer = null
  reader = null
  nextBirdAt = 0
  nextGustAt = 0
  cricketAt = [0, 0, 0]
  stopGraph()
}
