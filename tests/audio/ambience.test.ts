import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import type { Level, Vec2 } from '../../src/model/types'
import {
  ambienceMix,
  crossfadeMix,
  installAmbience,
  nextBirdPhrase,
  nextCricketTrain,
  nextGust,
  resetAmbienceForTests,
  syncAmbience,
  type BirdPhrase,
  type CricketTrain,
} from '../../src/audio/ambience'
import { getBus, openAudio, resetAudioForTests } from '../../src/audio/engine'
import { newRoomNames } from '../../src/audio/logic'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

class Param {
  value = 0
  setValueAtTime(value: number) {
    this.value = value
    return this
  }
  linearRampToValueAtTime(value: number) {
    this.value = value
    return this
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value
    return this
  }
  cancelScheduledValues() {
    return this
  }
}

const links: [object, object][] = []
let bufferSources = 0
let oscillators = 0
let contexts = 0

class FakeAudioContext {
  state = 'running'
  currentTime = 10
  sampleRate = 8000
  destination = {}
  constructor() {
    contexts += 1
  }
  createGain() {
    const gain = new Param()
    const node = {
      gain,
      connect(dest: object) {
        links.push([node, dest])
      },
    }
    return node
  }
  createOscillator() {
    oscillators += 1
    const node = {
      type: 'sine',
      frequency: new Param(),
      connect(dest: object) {
        links.push([node, dest])
      },
      start() {},
      stop() {},
    }
    return node
  }
  createStereoPanner() {
    const node = {
      pan: new Param(),
      connect(dest: object) {
        links.push([node, dest])
      },
    }
    return node
  }
  createBiquadFilter() {
    const node = {
      type: 'lowpass',
      frequency: new Param(),
      Q: new Param(),
      connect(dest: object) {
        links.push([node, dest])
      },
    }
    return node
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    return {
      duration: length / sampleRate,
      length,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => data,
    }
  }
  createBufferSource() {
    bufferSources += 1
    const node = {
      buffer: null as unknown,
      loop: false,
      playbackRate: new Param(),
      connect(dest: object) {
        links.push([node, dest])
      },
      start() {},
      stop() {},
    }
    return node
  }
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
}

const originalAudio = globalThis.AudioContext

function reaches(from: object, target: object): boolean {
  const seen = new Set<object>()
  const queue = [from]
  while (queue.length > 0) {
    const node = queue.pop()
    if (!node || seen.has(node)) continue
    seen.add(node)
    if (node === target) return true
    for (const [src, dest] of links) if (src === node) queue.push(dest)
  }
  return false
}

describe('ambience mix', () => {
  it('scales birds with daylight, crickets with night, and keeps the wind', () => {
    const dusk = ambienceMix({ daylight: 0.25, indoor: false, view: '3d' })
    expect(dusk.birds).toBe(0.25)
    expect(dusk.crickets).toBe(0.75)
    expect(dusk.wind).toBe(1)
    expect(dusk.master).toBe(1)
    expect(dusk.lowpassHz).toBeGreaterThanOrEqual(10000)
    expect(dusk.fadeSeconds).toBe(1.5)

    const day = ambienceMix({ daylight: 1, indoor: false, view: 'split' })
    expect(day.birds).toBe(1)
    expect(day.crickets).toBe(0)
    const night = ambienceMix({ daylight: 0, indoor: false, view: 'walk' })
    expect(night.birds).toBe(0)
    expect(night.crickets).toBe(1)
    expect(night.wind).toBe(1)

    expect(ambienceMix({ daylight: 4, indoor: false, view: '3d' }).birds).toBe(1)
    expect(ambienceMix({ daylight: -2, indoor: false, view: '3d' }).crickets).toBe(1)
    expect(ambienceMix({ daylight: Number.NaN, indoor: false, view: '3d' }).birds).toBe(0)
  })

  it('muffles an indoor camera by 8 dB and a 700 Hz low-pass without dropping the wind', () => {
    const indoor = ambienceMix({ daylight: 0.5, indoor: true, view: 'walk' })
    expect(indoor.birds).toBe(0.5)
    expect(indoor.crickets).toBe(0.5)
    expect(indoor.wind).toBe(1)
    expect(indoor.master).toBeCloseTo(0.3981, 3)
    expect(indoor.lowpassHz).toBe(700)
    expect(indoor.fadeSeconds).toBe(1.5)
  })

  it('silences the plan view and leaves rain on the same three layers', () => {
    const plan = ambienceMix({ daylight: 1, indoor: false, view: '2d' })
    expect(plan.birds).toBe(0)
    expect(plan.crickets).toBe(0)
    expect(plan.wind).toBe(0)
    expect(plan.master).toBe(0)
    expect(plan.fadeSeconds).toBe(1)

    const dry = ambienceMix({ daylight: 0.4, indoor: false, view: '3d' })
    const wet = ambienceMix({ daylight: 0.4, indoor: false, view: '3d', rain: true })
    expect(wet.birds).toBe(dry.birds)
    expect(wet.crickets).toBe(dry.crickets)
    expect(wet.wind).toBe(dry.wind)
    expect(wet.master).toBe(dry.master)
  })

  it('crossfades a mix change over 1.5 s and the plan over 1 s', () => {
    const day = ambienceMix({ daylight: 1, indoor: false, view: '3d' })
    const night = ambienceMix({ daylight: 0, indoor: false, view: '3d' })
    const halfway = crossfadeMix(day, night, 0.75, day.fadeSeconds)
    expect(halfway.birds).toBeCloseTo(0.5, 5)
    expect(halfway.crickets).toBeCloseTo(0.5, 5)
    expect(halfway.wind).toBe(1)
    const early = crossfadeMix(day, night, 1, 1.5)
    expect(early.birds).toBeCloseTo(1 / 3, 5)
    const done = crossfadeMix(day, night, 1.5, 1.5)
    expect(done.birds).toBe(0)
    expect(done.crickets).toBe(1)

    const indoors = ambienceMix({ daylight: 1, indoor: true, view: '3d' })
    const muffling = crossfadeMix(day, indoors, 1.5, indoors.fadeSeconds)
    expect(muffling.master).toBeCloseTo(0.3981, 3)
    expect(muffling.lowpassHz).toBe(700)

    const plan = ambienceMix({ daylight: 1, indoor: false, view: '2d' })
    expect(crossfadeMix(day, plan, 0.5, plan.fadeSeconds).master).toBeCloseTo(0.5, 5)
    expect(crossfadeMix(day, plan, 1, plan.fadeSeconds).master).toBe(0)
    expect(crossfadeMix(day, plan, 1, plan.fadeSeconds).wind).toBe(0)
  })
})

describe('ambience schedulers', () => {
  function phrases(seed: number, count: number): BirdPhrase[] {
    const rng = mulberry32(seed)
    return Array.from({ length: count }, () => nextBirdPhrase(rng))
  }

  it('keeps bird phrases inside the day-song bounds, with three different patterns', () => {
    const all = phrases(7, 80)
    const species = new Set(all.map((phrase) => phrase.species))
    expect(species).toEqual(new Set([0, 1, 2]))
    for (const phrase of all) {
      expect(phrase.wait).toBeGreaterThanOrEqual(3)
      expect(phrase.wait).toBeLessThanOrEqual(10)
      expect(phrase.pan).toBeGreaterThanOrEqual(-1)
      expect(phrase.pan).toBeLessThanOrEqual(1)
      expect(phrase.notes.length).toBeGreaterThanOrEqual(2)
      expect(phrase.notes.length).toBeLessThanOrEqual(6)
      let previousAt = -1
      let previousFreq = phrase.species === 1 ? 6000 : 0
      for (const note of phrase.notes) {
        expect(note.freq).toBeGreaterThanOrEqual(2000)
        expect(note.freq).toBeLessThanOrEqual(5000)
        expect(note.endFreq).toBeGreaterThanOrEqual(2000)
        expect(note.endFreq).toBeLessThanOrEqual(5000)
        expect(note.dur).toBeGreaterThanOrEqual(0.06)
        expect(note.dur).toBeLessThanOrEqual(0.18)
        expect(note.at).toBeGreaterThan(previousAt)
        previousAt = note.at
        if (phrase.species === 0) expect(note.freq).toBeGreaterThanOrEqual(previousFreq)
        if (phrase.species === 1) expect(note.freq).toBeLessThanOrEqual(previousFreq)
        previousFreq = note.freq
      }
      if (phrase.species === 0) {
        expect(phrase.timbre).toBe('sine')
        for (const note of phrase.notes) expect(note.endFreq).toBeGreaterThanOrEqual(note.freq)
      }
      if (phrase.species === 1) {
        expect(phrase.timbre).toBe('sine')
        for (const note of phrase.notes) expect(note.endFreq).toBeLessThanOrEqual(note.freq)
      }
      if (phrase.species === 2) {
        expect(phrase.timbre).toBe('fm')
        expect(phrase.notes.length % 2).toBe(0)
        const first = phrase.notes[0]
        const second = phrase.notes[1]
        expect(first && second && first.freq !== second.freq).toBe(true)
        for (let i = 0; i < phrase.notes.length; i++) {
          expect(phrase.notes[i]?.freq).toBe(phrase.notes[i % 2]?.freq)
        }
      }
    }
  })

  it('detunes cricket voices inside 4.2–4.8 kHz and leaves random breaks between trains', () => {
    const mid = () => 0.5
    const centers = [0, 1, 2].map((voice) => nextCricketTrain(mid, voice as 0 | 1 | 2).freq)
    expect(Math.abs(centers[0]! - centers[1]!)).toBeGreaterThanOrEqual(50)
    expect(Math.abs(centers[1]! - centers[2]!)).toBeGreaterThanOrEqual(50)
    expect(Math.abs(centers[0]! - centers[2]!)).toBeGreaterThanOrEqual(50)

    const rng = mulberry32(11)
    const trains: CricketTrain[] = []
    for (let i = 0; i < 60; i++) trains.push(nextCricketTrain(rng, (i % 3) as 0 | 1 | 2))
    const breaks = trains.map((train) => train.breakAfter)
    expect(Math.min(...breaks)).toBeLessThan(0.25)
    expect(Math.max(...breaks)).toBeGreaterThan(0.4)
    for (const train of trains) {
      expect(train.freq).toBeGreaterThanOrEqual(4200)
      expect(train.freq).toBeLessThanOrEqual(4800)
      expect(train.pulses.length).toBeGreaterThanOrEqual(4)
      expect(train.pulses.length).toBeLessThanOrEqual(24)
      expect(train.breakAfter).toBeGreaterThan(0)
      expect(train.breakAfter).toBeLessThanOrEqual(3)
      let previous = -1
      for (const pulse of train.pulses) {
        expect(pulse.at).toBeGreaterThan(previous)
        expect(pulse.dur).toBeGreaterThan(0)
        expect(pulse.dur).toBeLessThanOrEqual(0.05)
        previous = pulse.at
      }
    }
  })

  it('spaces wind gusts between 4 and 12 s inside the 300–900 Hz band', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 40; i++) {
      const gust = nextGust(rng)
      expect(gust.wait).toBeGreaterThanOrEqual(4)
      expect(gust.wait).toBeLessThanOrEqual(12)
      expect(gust.cutoff).toBeGreaterThanOrEqual(300)
      expect(gust.cutoff).toBeLessThanOrEqual(900)
    }
  })
})

describe('ambience graph', () => {
  beforeEach(() => {
    links.length = 0
    bufferSources = 0
    oscillators = 0
    contexts = 0
    ;(globalThis as { AudioContext: typeof AudioContext }).AudioContext = FakeAudioContext as unknown as typeof AudioContext
  })

  afterEach(() => {
    resetAmbienceForTests()
    resetAudioForTests()
    globalThis.AudioContext = originalAudio
  })

  it('waits for the gesture context, then loops the wind bed into the ambience bus', () => {
    installAmbience(() => ({ daylight: 1, indoor: false, view: '3d' }))
    syncAmbience()
    expect(contexts).toBe(0)
    expect(bufferSources).toBe(0)
    expect(oscillators).toBe(0)

    expect(openAudio()).toBe(true)
    syncAmbience()
    const bus = getBus('ambience')
    expect(bus).not.toBeNull()
    expect(bufferSources).toBe(1)
    expect(oscillators).toBe(3)
    const source = links.map(([src]) => src).find((node) => 'loop' in node && (node as { loop: boolean }).loop)
    expect(source).toBeTruthy()
    expect(reaches(source as object, bus as object)).toBe(true)

    syncAmbience()
    expect(bufferSources).toBe(1)
    expect(oscillators).toBe(3)
  })
})

describe('room-complete names', () => {
  it('names rooms detectRooms did not already see on that level', () => {
    const before = createLevel('Ground', 0)
    before.id = 'ground'
    const after = createLevel('Ground', 0)
    after.id = 'ground'
    loop(after, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    expect(newRoomNames([before], [after])).toEqual(['Living 1'])
    expect(newRoomNames([after], [after])).toEqual([])
  })
})
