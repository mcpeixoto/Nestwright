import { electronPlatform } from './electron'
import type { Platform } from './types'
import { webPlatform } from './web'

export type { OpenedFile, Photo3dApi, Photo3dQuality, PickedPhoto, Platform } from './types'

export function getPlatform(): Platform {
  if (typeof window !== 'undefined' && window.nestwright) return electronPlatform()
  return webPlatform()
}
