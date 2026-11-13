import type * as THREE from 'three'

/** A later wave registers a `walk` rig; the viewport activates it when view === 'walk'. */
export interface CameraRig {
  id: string
  activate?(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): void
  deactivate?(): void
  update?(dt: number): void
}

const rigs = new Map<string, CameraRig>()

export function registerRig(rig: CameraRig): void {
  rigs.set(rig.id, rig)
}

export function getRig(id: string): CameraRig | undefined {
  return rigs.get(id)
}
