import { describe, expect, it } from 'vitest'
import { adapterLimits, raisedLimits } from '../../src/view3d/render/createRenderer'

describe('raisedLimits', () => {
  it('asks for every sampled texture and sampler the adapter offers', () => {
    // The Ultra ground pass samples 17 textures in its fragment stage; WebGPU's default is 16.
    expect(raisedLimits({ maxSampledTexturesPerShaderStage: 48, maxSamplersPerShaderStage: 32 })).toEqual({
      maxSampledTexturesPerShaderStage: 48,
      maxSamplersPerShaderStage: 32,
    })
  })

  it('never asks below the WebGPU default, and skips limits the adapter does not report', () => {
    expect(raisedLimits({ maxSampledTexturesPerShaderStage: 16 })).toEqual({})
    expect(raisedLimits({ maxSamplersPerShaderStage: 8 })).toEqual({})
    expect(raisedLimits(null)).toEqual({})
  })
})

describe('adapterLimits', () => {
  it('reads limits from the same kind of adapter three requests', async () => {
    const seen: unknown[] = []
    const gpu = {
      requestAdapter: async (options: unknown) => {
        seen.push(options)
        return { limits: { maxSampledTexturesPerShaderStage: 48, maxSamplersPerShaderStage: 16 } }
      },
    }
    const limits = await adapterLimits(gpu)
    expect(limits?.maxSampledTexturesPerShaderStage).toBe(48)
    expect(seen).toEqual([{ featureLevel: 'compatibility' }])
  })

  it('returns null when there is no WebGPU or no adapter, or the request throws', async () => {
    expect(await adapterLimits(undefined)).toBeNull()
    expect(await adapterLimits({ requestAdapter: async () => null })).toBeNull()
    expect(
      await adapterLimits({
        requestAdapter: async () => {
          throw new Error('lost')
        },
      }),
    ).toBeNull()
  })
})
