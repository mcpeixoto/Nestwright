import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { postTuning } from '../../src/view3d/post/effects'
import { activeEffectIds, neededChannels } from '../../src/view3d/post/registry'
import { CUT_ANGLE_DEG, CUT_DISTANCE, isCameraCut } from '../../src/view3d/post/temporal'
import { qualityProfile } from '../../src/view3d/render/quality'

function cameraMatrix(position: [number, number, number], target: [number, number, number]): number[] {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateMatrixWorld()
  return Array.from(camera.matrixWorld.elements)
}

describe('isCameraCut', () => {
  const base = cameraMatrix([0, 1.6, 0], [0, 1.6, -5])

  it('treats the first frame as a cut', () => {
    expect(isCameraCut(null, base)).toBe(true)
  })

  it('keeps history for a still camera and for ordinary orbit or walk steps', () => {
    expect(isCameraCut(base, base)).toBe(false)
    expect(isCameraCut(base, cameraMatrix([0.05, 1.6, 0], [0.05, 1.6, -5]))).toBe(false)
    const turned = cameraMatrix([0, 1.6, 0], [-5 * Math.tan((5 * Math.PI) / 180), 1.6, -5])
    expect(isCameraCut(base, turned)).toBe(false)
  })

  it('cuts on a jump further than CUT_DISTANCE', () => {
    const far = CUT_DISTANCE + 0.5
    expect(isCameraCut(base, cameraMatrix([far, 1.6, 0], [far, 1.6, -5]))).toBe(true)
  })

  it('cuts on a turn wider than CUT_ANGLE_DEG', () => {
    const angle = ((CUT_ANGLE_DEG + 10) * Math.PI) / 180
    expect(isCameraCut(base, cameraMatrix([0, 1.6, 0], [-5 * Math.sin(angle), 1.6, -5 * Math.cos(angle)]))).toBe(true)
  })

  it('cuts when a matrix holds non-finite values', () => {
    const broken = [...base]
    broken[12] = Number.NaN
    expect(isCameraCut(base, broken)).toBe(true)
  })
})

describe('post chain per tier', () => {
  it('runs FXAA alone on Low and allocates no G-buffer', () => {
    const low = qualityProfile('low')
    expect(activeEffectIds(low, false)).toEqual(['fxaa'])
    expect([...neededChannels(low, false)]).toEqual([])
  })

  it('runs GTAO, bloom and TRAA on Medium, without the SSR inputs', () => {
    const medium = qualityProfile('medium')
    expect(activeEffectIds(medium, false)).toEqual(['gtao', 'bloom', 'traa'])
    expect([...neededChannels(medium, false)].sort()).toEqual(['albedo', 'normal', 'velocity'])
  })

  it('adds SSR and its metal/rough input on High', () => {
    const high = qualityProfile('high')
    expect(activeEffectIds(high, false)).toEqual(['gtao', 'ssr', 'bloom', 'traa'])
    expect([...neededChannels(high, false)].sort()).toEqual(['albedo', 'metalRough', 'normal', 'velocity'])
  })

  it('keeps SSGI off on Ultra until it is retuned, and runs the High chain instead', () => {
    expect(postTuning.ssgi).toBe(false)
    expect(activeEffectIds(qualityProfile('ultra'), false)).toEqual(['gtao', 'ssr', 'bloom', 'traa'])
  })

  it('swaps GTAO for SSGI on Ultra when SSGI is switched on', () => {
    postTuning.ssgi = true
    try {
      const ids = activeEffectIds(qualityProfile('ultra'), false)
      expect(ids).toContain('ssgi')
      expect(ids).not.toContain('gtao')
      expect(activeEffectIds(qualityProfile('high'), false)).not.toContain('ssgi')
    } finally {
      postTuning.ssgi = false
    }
  })

  it('adds depth of field only in photo mode', () => {
    expect(activeEffectIds(qualityProfile('high'), false)).not.toContain('dof')
    expect(activeEffectIds(qualityProfile('high'), true)).toContain('dof')
  })
})
