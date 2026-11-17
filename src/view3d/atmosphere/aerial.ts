import * as THREE from 'three'
import { uniform } from 'three/tsl'

/**
 * Horizon radiance (the fog colour, before tone mapping) for meshes that fade into the distance by
 * their own amount rather than by scene fog. The clear-day fog is thin enough to keep woods at
 * 450 m green, so the ridge behind them carries its aerial perspective per vertex. The atmosphere
 * layer writes it whenever the sky changes.
 */
export const aerialHaze = uniform(new THREE.Vector3(0.6, 0.65, 0.72))

export function setAerialHaze(rgb: readonly [number, number, number]): void {
  aerialHaze.value.set(rgb[0], rgb[1], rgb[2])
}
