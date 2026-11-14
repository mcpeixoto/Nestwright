import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { pixelFor } from '../../src/view3d/render/readback'
import { backendPreference, rendererBackend } from '../../src/view3d/render/createRenderer'

describe('pixelFor', () => {
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const css = { width: 800, height: 400 }
  const backing = { width: 1600, height: 800 }

  it('maps a world point in front of the camera to the canvas centre', () => {
    expect(pixelFor([0, 0, 0], css, backing, camera)).toEqual({ px: 800, py: 400 })
  })

  it('scales CSS points to backing-store pixels', () => {
    expect(pixelFor({ x: 200, y: 100 }, css, backing, camera)).toEqual({ px: 400, py: 200 })
  })

  it('drops points behind the camera or off the canvas', () => {
    expect(pixelFor([0, 0, 10], css, backing, camera)).toBeNull()
    expect(pixelFor([100, 0, 0], css, backing, camera)).toBeNull()
    expect(pixelFor({ x: -1, y: 4 }, css, backing, camera)).toBeNull()
    expect(pixelFor([Number.NaN, 0, 0], css, backing, camera)).toBeNull()
  })
})

describe('renderer backend choice', () => {
  it('lets ?renderer= override the setting', () => {
    expect(backendPreference('auto', '?renderer=webgl')).toBe('webgl')
    expect(backendPreference('webgl', '?renderer=webgpu')).toBe('webgpu')
    expect(backendPreference('webgl', '')).toBe('webgl')
    expect(backendPreference('auto', '?x=1')).toBe('auto')
  })

  it('reads the backend off the initialised renderer', () => {
    expect(rendererBackend({ backend: { isWebGPUBackend: true } })).toBe('webgpu')
    expect(rendererBackend({ backend: {} })).toBe('webgl2')
  })
})
