import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLevel, createWall } from '../../src/model/defaults'
import type { Level, Vec2 } from '../../src/model/types'
import {
  gainedRooms,
  historyKind,
  pitchScale,
  sfxForLabel,
  snapCue,
} from '../../src/audio/logic'
import { audibleAmbience, audibleEffects } from '../../src/audio/volume'
import { bindAudioGesture, resetAudioForTests } from '../../src/audio/engine'
import { registerSfx, resetSfxForTests, setAudioClockForTests, sfx, sfxLengthMs, SFX_NAMES } from '../../src/audio/sfx'
import { initialSettings, normalizeSettings } from '../../src/settings'

function loop(level: Level, points: Vec2[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) level.walls.push(createWall(a, b))
  }
}

function square(id: string): Level {
  const level = createLevel('Ground', 0)
  level.id = id
  loop(level, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ])
  return level
}

class Param {
  value = 0
  setValueAtTime(value: number) {
    this.value = value
    return this
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value
    return this
  }
  linearRampToValueAtTime(value: number) {
    this.value = value
    return this
  }
  cancelScheduledValues() {
    return this
  }
}

const gains: Param[] = []
const links: [object, object][] = []
let contexts = 0
let oscillators = 0
let bufferSources = 0
let now = 1000
let destination: object | null = null

class FakeAudioContext {
  state = 'running'
  currentTime = 0
  sampleRate = 48000
  destination = {}
  constructor() {
    contexts += 1
    destination = this.destination
  }
  createGain() {
    const gain = new Param()
    gains.push(gain)
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
      connect() {
        return node
      },
      start() {},
      stop() {},
    }
    return node
  }
  createBiquadFilter() {
    const node = {
      type: 'lowpass',
      frequency: new Param(),
      Q: new Param(),
      connect() {
        return node
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
      playbackRate: new Param(),
      connect() {
        return node
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

function installMock() {
  ;(globalThis as { AudioContext: typeof AudioContext }).AudioContext = FakeAudioContext as unknown as typeof AudioContext
}

describe('edit sounds', () => {
  it('maps wall, item, and delete labels onto sfx names', () => {
    expect(sfxForLabel('Draw walls')).toBe('place-wall')
    expect(sfxForLabel('Draw room')).toBe('place-wall')
    expect(sfxForLabel('Place item')).toBe('place-item')
    expect(sfxForLabel('Paste')).toBe('place-item')
    expect(sfxForLabel('Duplicate')).toBe('place-item')
    expect(sfxForLabel('Delete')).toBe('delete')
    expect(sfxForLabel('Delete level')).toBe('delete')
    expect(sfxForLabel('Remove trace')).toBe('delete')
    expect(sfxForLabel('Place door')).toBe('door')
    expect(sfxForLabel('Place window')).toBeNull()
    expect(sfxForLabel('Rename')).toBeNull()
  })

  it('tells an undo or redo apart from a new edit by the history entry', () => {
    const drawn = { label: 'Draw walls' }
    const renamed = { label: 'Rename' }
    expect(historyKind({ past: [drawn], future: [] }, { past: [], future: [drawn] })).toBe('undo')
    expect(historyKind({ past: [], future: [drawn] }, { past: [drawn], future: [] })).toBe('redo')
    expect(historyKind({ past: [], future: [] }, { past: [drawn], future: [] })).toBe('apply')
    expect(historyKind({ past: [drawn], future: [renamed] }, { past: [drawn, renamed], future: [] })).toBe('redo')
    expect(historyKind({ past: [drawn], future: [] }, { past: [], future: [] })).toBeNull()
    const coalesced = { label: 'Draw walls' }
    expect(historyKind({ past: [drawn], future: [] }, { past: [coalesced], future: [] })).toBe('apply')
  })
})

describe('volume', () => {
  it('scales effects and ambience by the master and drops both when muted', () => {
    expect(audibleEffects({ volumeMaster: 80, volumeEffects: 70, muted: false })).toBeCloseTo(0.56)
    expect(audibleEffects({ volumeMaster: 80, volumeEffects: 70, muted: true })).toBe(0)
    expect(audibleAmbience({ volumeMaster: 80, volumeAmbience: 50, muted: false })).toBeCloseTo(0.4)
    expect(audibleAmbience({ volumeMaster: 80, volumeAmbience: 50, muted: true })).toBe(0)
  })

  it('fills sound defaults for an older saved settings file and clamps the sliders', () => {
    const legacy = initialSettings(JSON.stringify({ units: 'imperial' }))
    expect(legacy.volumeMaster).toBe(80)
    expect(legacy.volumeEffects).toBe(70)
    expect(legacy.volumeAmbience).toBe(50)
    expect(legacy.muted).toBe(false)
    expect(legacy.units).toBe('imperial')

    const broken = normalizeSettings({
      volumeMaster: 180,
      volumeEffects: -3,
      volumeAmbience: Number.POSITIVE_INFINITY,
      muted: 1 as unknown as boolean,
    })
    expect(broken.volumeMaster).toBe(100)
    expect(broken.volumeEffects).toBe(0)
    expect(broken.volumeAmbience).toBe(50)
    expect(broken.muted).toBe(false)
    expect(normalizeSettings({ volumeMaster: 0, muted: true }).volumeMaster).toBe(0)
    expect(normalizeSettings({ volumeMaster: 0, muted: true }).muted).toBe(true)
  })
})

describe('room completion', () => {
  it('is true only when a level’s detected room count increases', () => {
    const empty = createLevel('Ground', 0)
    const closed = square(empty.id)
    const split = square(empty.id)
    split.walls.push(createWall({ x: 0, y: 2 }, { x: 4, y: 2 }))
    expect(gainedRooms([empty], [closed])).toBe(true)
    expect(gainedRooms([closed], [split])).toBe(true)
    expect(gainedRooms([closed], [closed])).toBe(false)
    expect(gainedRooms([split], [closed])).toBe(false)
    const upstairs = createLevel('First', 3)
    expect(gainedRooms([empty], [empty, upstairs])).toBe(false)
    expect(gainedRooms([empty], [empty, square(upstairs.id)])).toBe(true)
  })
})

describe('snap cue', () => {
  it('fires when the snapped point changes and stays quiet while it holds', () => {
    const first = snapCue(null, { x: 1.02, y: 0 }, { x: 1, y: 0 })
    expect(first.play).toBe(true)
    const held = snapCue(first.key, { x: 1.03, y: 0 }, { x: 1, y: 0 })
    expect(held.play).toBe(false)
    expect(held.key).toBe(first.key)
    const sitting = snapCue(held.key, { x: 1, y: 0 }, { x: 1, y: 0 })
    expect(sitting.play).toBe(false)
    const next = snapCue(sitting.key, { x: 1.07, y: 0 }, { x: 1.05, y: 0 })
    expect(next.play).toBe(true)
    const free = snapCue(next.key, { x: 2, y: 2 }, { x: 2, y: 2 })
    expect(free.play).toBe(false)
    const again = snapCue(free.key, { x: 1.02, y: 0 }, { x: 1, y: 0 })
    expect(again.play).toBe(true)
  })
})

describe('synth voices', () => {
  it('keeps every effect between 40 and 400 ms and jitters pitch by three percent', () => {
    for (const name of SFX_NAMES) {
      const ms = sfxLengthMs(name)
      expect(ms, name).toBeGreaterThanOrEqual(40)
      expect(ms, name).toBeLessThanOrEqual(400)
    }
    expect(pitchScale(0)).toBeCloseTo(0.97)
    expect(pitchScale(1)).toBeCloseTo(1.03)
    expect(pitchScale(0.5)).toBeCloseTo(1)
  })
})

describe('audio engine', () => {
  beforeEach(() => {
    contexts = 0
    oscillators = 0
    bufferSources = 0
    gains.length = 0
    links.length = 0
    destination = null
    now = 1000
    installMock()
    resetAudioForTests()
    resetSfxForTests()
    setAudioClockForTests(() => now)
  })

  afterEach(() => {
    globalThis.AudioContext = originalAudio
    resetAudioForTests()
    resetSfxForTests()
  })

  it('makes no sound and no context until the first gesture', () => {
    const target = new EventTarget()
    bindAudioGesture(target)
    sfx('click')
    expect(contexts).toBe(0)
    expect(oscillators).toBe(0)
    target.dispatchEvent(new Event('pointerdown'))
    expect(contexts).toBe(1)
    const values = gains.map((gain) => Math.round(gain.value * 100)).sort((a, b) => a - b)
    expect(values).toEqual([50, 70, 70, 80, 100])
    const masterLink = links.find(([, dest]) => dest === destination)
    expect(masterLink).toBeTruthy()
    const master = masterLink?.[0]
    expect(links.filter(([, dest]) => dest === master)).toHaveLength(4)
    sfx('click')
    expect(oscillators).toBe(1)
    target.dispatchEvent(new Event('keydown'))
    expect(contexts).toBe(1)
  })

  it('also unlocks from a keydown', () => {
    const target = new EventTarget()
    bindAudioGesture(target)
    target.dispatchEvent(new Event('keydown'))
    expect(contexts).toBe(1)
    sfx('click')
    expect(oscillators).toBe(1)
  })

  it('installs the gesture listeners once', () => {
    const target = new EventTarget()
    let adds = 0
    const real = target.addEventListener.bind(target)
    target.addEventListener = ((type, listener, options) => {
      adds += 1
      real(type, listener, options)
    }) as typeof target.addEventListener
    bindAudioGesture(target)
    bindAudioGesture(target)
    expect(adds).toBe(2)
  })

  it('plays one name at most once per 60 ms and still plays a different name', () => {
    const target = new EventTarget()
    bindAudioGesture(target)
    target.dispatchEvent(new Event('pointerdown'))
    const start = oscillators
    sfx('click')
    sfx('click')
    expect(oscillators).toBe(start + 1)
    now += 59
    sfx('click')
    expect(oscillators).toBe(start + 1)
    now += 1
    sfx('click')
    expect(oscillators).toBe(start + 2)
    sfx('snap')
    expect(oscillators).toBe(start + 3)
  })

  it('plays a registered buffer in place of the synth', () => {
    const target = new EventTarget()
    bindAudioGesture(target)
    target.dispatchEvent(new Event('pointerdown'))
    now += 100
    const oscBefore = oscillators
    registerSfx('click', () => ({ getChannelData: () => new Float32Array(8) }) as unknown as AudioBuffer)
    sfx('click')
    expect(bufferSources).toBe(1)
    expect(oscillators).toBe(oscBefore)
  })

  it('does nothing when AudioContext is unavailable', () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext
    const target = new EventTarget()
    bindAudioGesture(target)
    expect(() => target.dispatchEvent(new Event('pointerdown'))).not.toThrow()
    expect(() => sfx('unlock')).not.toThrow()
    expect(contexts).toBe(0)
    expect(oscillators).toBe(0)
  })
})
