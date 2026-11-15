import { useSyncExternalStore } from 'react'

export type PhotoAspect = 'free' | '16:9' | '4:3' | '1:1' | '9:16'
export type PhotoResolution = '1080p' | '1440p' | '4k'

export interface PhotoSnapshot {
  photo: boolean
  focus: number
  aperture: number
  /** Exposure compensation in EV (−2…+2). */
  exposure: number
  aspect: PhotoAspect
  resolution: PhotoResolution
  grid: boolean
  savedFov: number | null
}

const listeners = new Set<() => void>()

let snapshot: PhotoSnapshot = {
  photo: false,
  focus: 8,
  aperture: 0.15,
  exposure: 0,
  aspect: 'free',
  resolution: '1080p',
  grid: false,
  savedFov: null,
}

function publish(next: PhotoSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

export function subscribePhoto(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPhotoSnapshot(): PhotoSnapshot {
  return snapshot
}

export function usePhotoSession(): PhotoSnapshot {
  return useSyncExternalStore(subscribePhoto, getPhotoSnapshot, getPhotoSnapshot)
}

export function isPhotoMode(): boolean {
  return snapshot.photo
}

/** Photo-mode exposure compensation in EV; 0 outside photo mode. */
export function photoExposure(): number {
  if (!snapshot.photo) return 0
  return Number.isFinite(snapshot.exposure) ? snapshot.exposure : 0
}

export function enterPhoto(fov: number | null): void {
  publish({ ...snapshot, photo: true, savedFov: fov })
}

export function exitPhoto(): void {
  publish({ ...snapshot, photo: false })
}

export function setPhoto(partial: Partial<Omit<PhotoSnapshot, 'photo' | 'savedFov'>>): void {
  publish({ ...snapshot, ...partial })
}

export function aspectRatio(aspect: PhotoAspect): number | null {
  if (aspect === '16:9') return 16 / 9
  if (aspect === '4:3') return 4 / 3
  if (aspect === '1:1') return 1
  if (aspect === '9:16') return 9 / 16
  return null
}

export function framePixels(aspect: PhotoAspect, resolution: PhotoResolution, freeAspect: number): { width: number; height: number } {
  const longSide = resolution === '4k' ? 3840 : resolution === '1440p' ? 2560 : 1920
  const ratio = aspectRatio(aspect) ?? (freeAspect > 0.05 ? freeAspect : 16 / 9)
  if (ratio >= 1) return { width: longSide, height: Math.max(2, Math.round(longSide / ratio)) }
  return { width: Math.max(2, Math.round(longSide * ratio)), height: longSide }
}
