import { useSyncExternalStore } from 'react'
import { getPlatform } from '../platform'
import { useStore } from '../store'
import { flightDuration, sampleFlight, type FlightPose } from './flight'
import { getController, setBeforeRender } from './SceneController'

export interface FlightState {
  poses: FlightPose[]
  durations: number[]
  playing: boolean
}

const poses: FlightPose[] = []
const durations: number[] = []
let playing = false
let started = 0
let done: (() => void) | null = null
let snapshot: FlightState = { poses, durations, playing }

const listeners = new Set<() => void>()

function publish(): void {
  snapshot = { poses: poses.slice(), durations: durations.slice(), playing }
  for (const listener of listeners) listener()
}

export function subscribeFlight(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getFlightSnapshot(): FlightState {
  return snapshot
}

export function useFlight(): FlightState {
  return useSyncExternalStore(subscribeFlight, getFlightSnapshot, getFlightSnapshot)
}

export function isFlightPlaying(): boolean {
  return playing
}

function applyPose(pose: FlightPose): void {
  const camera = getController()?.camera
  if (!camera) return
  camera.position.set(pose.position[0], pose.position[1], pose.position[2])
  camera.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3])
  if (Math.abs(camera.fov - pose.fov) > 0.05) {
    camera.fov = pose.fov
    camera.updateProjectionMatrix()
  }
}

export function addKeyframe(): void {
  const camera = getController()?.camera
  if (!camera) return
  if (poses.length > 0) durations.push(4)
  poses.push({
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    fov: camera.fov,
  })
  publish()
}

export function removeKeyframe(index: number): void {
  if (index < 0 || index >= poses.length) return
  poses.splice(index, 1)
  if (index === 0) durations.shift()
  else durations.splice(index - 1, 1)
  if (durations.length > Math.max(0, poses.length - 1)) durations.length = Math.max(0, poses.length - 1)
  publish()
}

export function moveKeyframe(index: number, dir: -1 | 1): void {
  const next = index + dir
  if (index < 0 || next < 0 || index >= poses.length || next >= poses.length) return
  const pose = poses[index]
  const other = poses[next]
  if (!pose || !other) return
  poses[index] = other
  poses[next] = pose
  publish()
}

export function setSegmentDuration(index: number, seconds: number): void {
  if (index < 0 || index >= durations.length) return
  durations[index] = Math.min(60, Math.max(0.2, seconds))
  publish()
}

export function playFlight(): Promise<void> {
  if (poses.length < 2 || playing) return Promise.resolve()
  playing = true
  started = typeof performance !== 'undefined' ? performance.now() : 0
  const controls = getController()?.controls
  if (controls) controls.enabled = false
  publish()
  return new Promise((resolve) => {
    done = () => {
      done = null
      resolve()
    }
  })
}

export function tickFlight(): void {
  if (!playing) return
  const total = flightDuration(durations, Math.max(0, poses.length - 1))
  const elapsed = (performance.now() - started) / 1000
  const pose = sampleFlight(poses, durations, Math.min(elapsed, total))
  applyPose(pose)
  if (elapsed < total) return
  playing = false
  const controls = getController()?.controls
  const view = useStore.getState().view
  if (controls && view !== 'walk') controls.enabled = true
  publish()
  const finish = done
  done = null
  finish?.()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

export async function recordFlight(): Promise<void> {
  const canvas = getController()?.canvas
  if (!canvas || poses.length < 2) {
    useStore.getState().setMessage('Add at least two camera keyframes')
    return
  }
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    useStore.getState().setMessage('Video recording is not available here')
    return
  }
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
  const stream = canvas.captureStream(30)
  let recorder: MediaRecorder
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  } catch {
    useStore.getState().setMessage('Could not start the recorder')
    return
  }
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }))
  })
  recorder.start()
  await playFlight()
  if (recorder.state !== 'inactive') recorder.stop()
  const blob = await stopped
  for (const track of stream.getTracks()) track.stop()
  try {
    const url = await blobToDataUrl(blob)
    const ok = await getPlatform().saveFile('flight.webm', url)
    useStore.getState().setMessage(ok ? 'Saved flight.webm' : 'Export cancelled')
  } catch {
    useStore.getState().setMessage('Could not save the video')
  }
}

setBeforeRender(() => {
  if (!playing) return false
  tickFlight()
  return true
})
