import * as THREE from 'three'
import { wishAnchor } from '../../model/wishes'
import type { Project } from '../../model/types'
import { getPresencePeers, getSelfId } from '../../net/presence'
import { showWishPins } from '../../ui/together/wishView'
import { registerSceneLayer } from '../layers'

function disposeSprite(sprite: THREE.Sprite): void {
  const material = sprite.material
  if (material instanceof THREE.SpriteMaterial) {
    material.map?.dispose()
    material.dispose()
  }
}

function labelSprite(text: string, colour: string, wide: boolean): THREE.Sprite {
  const plain = () => {
    const material = new THREE.SpriteMaterial({ color: colour, depthTest: false, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(wide ? 1.4 : 0.4, 0.4, 1)
    sprite.renderOrder = 20
    return sprite
  }
  if (typeof document === 'undefined') return plain()
  try {
    const canvas = document.createElement('canvas')
    canvas.width = wide ? 256 : 128
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return plain()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(23, 26, 31, 0.88)'
    ctx.fillRect(4, 10, canvas.width - 8, 44)
    ctx.fillStyle = colour
    ctx.font = '28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text.slice(0, 22), canvas.width / 2, 32)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(wide ? 1.8 : 0.7, 0.45, 1)
    sprite.renderOrder = 20
    return sprite
  } catch {
    return plain()
  }
}

const GLYPH = { love: '❤', no: '✕', idea: '💡' } as const

registerSceneLayer({
  id: 'together',
  create(ctx) {
    const group = new THREE.Group()
    group.name = 'together'
    ctx.scene.add(group)
    let project: Project | null = null
    let stamp = ''
    const pins: THREE.Sprite[] = []
    const tags = new Map<string, { sprite: THREE.Sprite; key: string }>()

    const clearPins = () => {
      for (const sprite of pins) {
        group.remove(sprite)
        disposeSprite(sprite)
      }
      pins.length = 0
    }

    const rebuildPins = () => {
      if (!project) return
      const next = `${showWishPins()}:${project.wishes?.length ?? 0}:${project.updatedAt ?? 0}`
      if (next === stamp) return
      stamp = next
      clearPins()
      if (!showWishPins()) return
      for (const wish of project.wishes ?? []) {
        if (wish.resolved) continue
        let anchor: { x: number; y: number; z: number } | null
        try {
          anchor = wishAnchor(project, wish)
        } catch {
          continue
        }
        if (!anchor) continue
        const colour = wish.reaction === 'idea' ? '#e8b86d' : wish.reaction === 'no' ? '#8a847a' : '#d4655a'
        const sprite = labelSprite(GLYPH[wish.reaction] ?? '•', colour, false)
        sprite.position.set(anchor.x, anchor.y, anchor.z)
        group.add(sprite)
        pins.push(sprite)
      }
    }

    return {
      sync(next: Project) {
        project = next
        try {
          rebuildPins()
        } catch {
          clearPins()
        }
      },
      update() {
        try {
          if (showWishPins() !== stamp.startsWith('true') && showWishPins() !== stamp.startsWith('false')) rebuildPins()
          if ((showWishPins() ? 'true' : 'false') !== stamp.slice(0, stamp.indexOf(':'))) rebuildPins()
          const self = getSelfId()
          const peers = getPresencePeers().filter((peer) => peer.id !== self && peer.camera)
          const live = new Set(peers.map((peer) => peer.id))
          for (const [id, entry] of tags) {
            if (live.has(id)) continue
            group.remove(entry.sprite)
            disposeSprite(entry.sprite)
            tags.delete(id)
          }
          for (const peer of peers) {
            const camera = peer.camera
            if (!camera) continue
            const key = `${peer.name}:${peer.colour}`
            let entry = tags.get(peer.id)
            if (!entry || entry.key !== key) {
              if (entry) {
                group.remove(entry.sprite)
                disposeSprite(entry.sprite)
              }
              const sprite = labelSprite(peer.name || 'Partner', peer.colour || '#3FB8AF', true)
              group.add(sprite)
              entry = { sprite, key }
              tags.set(peer.id, entry)
            }
            entry.sprite.position.set(camera.pos.x, camera.pos.y + 0.4, camera.pos.z)
          }
        } catch {
          /* presence is cosmetic */
        }
      },
      dispose() {
        clearPins()
        for (const entry of tags.values()) disposeSprite(entry.sprite)
        tags.clear()
        ctx.scene.remove(group)
      },
    }
  },
})
