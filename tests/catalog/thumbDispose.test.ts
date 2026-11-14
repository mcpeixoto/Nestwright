import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { disposeThumbObject } from '../../src/catalog/thumbnails'
import { getMaterial } from '../../src/materials/materialCache'

function watch(target: THREE.EventDispatcher<{ dispose: object }>): () => boolean {
  let fired = false
  target.addEventListener('dispose', () => {
    fired = true
  })
  return () => fired
}

describe('thumbnail resource freeing', () => {
  it('frees geometry and owned materials, keeps shared ones', () => {
    const root = new THREE.Group()
    const library = getMaterial({ id: 'oak-planks' })
    const shared = new THREE.MeshStandardMaterial()
    const owned = new THREE.MeshStandardMaterial()
    owned.userData.owned = true
    const ownedMap = new THREE.Texture()
    ownedMap.userData = { owned: true }
    owned.map = ownedMap
    const libraryMap = library.map

    const geoA = new THREE.BoxGeometry()
    const geoB = new THREE.BoxGeometry()
    const geoC = new THREE.BoxGeometry()
    root.add(new THREE.Mesh(geoA, library))
    const inner = new THREE.Group()
    inner.add(new THREE.Mesh(geoB, [shared, owned]))
    inner.add(new THREE.Mesh(geoC, owned))
    root.add(inner)

    const geos = [watch(geoA), watch(geoB), watch(geoC)]
    const libraryFreed = watch(library)
    const sharedFreed = watch(shared)
    const ownedFreed = watch(owned)
    const mapFreed = watch(ownedMap)
    const libraryMapFreed = libraryMap ? watch(libraryMap) : () => false

    disposeThumbObject(root)

    expect(geos.map((fired) => fired())).toEqual([true, true, true])
    expect(ownedFreed()).toBe(true)
    expect(mapFreed()).toBe(true)
    expect(libraryFreed()).toBe(false)
    expect(libraryMapFreed()).toBe(false)
    expect(sharedFreed()).toBe(false)
  })

  it('never frees a library material even if it were marked owned', () => {
    const library = getMaterial({ id: 'brick-red' })
    library.userData.owned = true
    const freed = watch(library)
    disposeThumbObject(new THREE.Mesh(new THREE.BoxGeometry(), library))
    expect(freed()).toBe(false)
    delete library.userData.owned
  })
})
