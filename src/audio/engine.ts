import { useSettings } from '../settings'
import { busGains, type VolumeSettings } from './volume'

export type BusName = 'ui' | 'world' | 'ambience' | 'music'

interface Graph {
  ctx: AudioContext
  master: GainNode
  buses: Record<BusName, GainNode>
}

let graph: Graph | null = null
let releaseGesture: (() => void) | null = null

function audioConstructor(): (new () => AudioContext) | null {
  const scope = globalThis as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** The context created by the first gesture, or null when there has been none (or no API). */
export function currentAudioContext(): AudioContext | null {
  return graph?.ctx ?? null
}

export function getBus(name: BusName): GainNode | null {
  return graph?.buses[name] ?? null
}

export function applyBusGains(settings: VolumeSettings = useSettings.getState()): void {
  if (!graph) return
  const gains = busGains(settings)
  graph.master.gain.value = gains.master
  graph.buses.ui.gain.value = gains.effects
  graph.buses.world.gain.value = gains.effects
  graph.buses.ambience.gain.value = gains.ambience
  graph.buses.music.gain.value = gains.music
}

/**
 * One context, created on the first successful gesture. Capture so a keydown that both
 * unlocks audio and runs a shortcut sees the context before the shortcut's handler.
 * Returns false when the platform has no AudioContext; the listeners stay for a later try.
 */
export function openAudio(): boolean {
  if (graph) return true
  const Ctor = audioConstructor()
  if (!Ctor) return false
  try {
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.connect(ctx.destination)
    const buses: Record<BusName, GainNode> = {
      ui: ctx.createGain(),
      world: ctx.createGain(),
      ambience: ctx.createGain(),
      music: ctx.createGain(),
    }
    buses.ui.connect(master)
    buses.world.connect(master)
    buses.ambience.connect(master)
    buses.music.connect(master)
    graph = { ctx, master, buses }
    applyBusGains()
    void ctx.resume().catch(() => {})
    return true
  } catch {
    graph = null
    return false
  }
}

/** Pointer or key listener, installed once per target until the context exists. */
export function bindAudioGesture(target: EventTarget): void {
  if (releaseGesture) return
  const unlock = () => {
    if (openAudio()) releaseGesture?.()
  }
  target.addEventListener('pointerdown', unlock, true)
  target.addEventListener('keydown', unlock, true)
  releaseGesture = () => {
    target.removeEventListener('pointerdown', unlock, true)
    target.removeEventListener('keydown', unlock, true)
    releaseGesture = null
  }
}

export function releaseAudioGesture(): void {
  releaseGesture?.()
}

export function resetAudioForTests(): void {
  releaseAudioGesture()
  graph = null
}
