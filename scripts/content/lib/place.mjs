import { getBounds } from '@gltf-transform/functions'

/** Axis-aligned size. Width is X, depth is Z, height is Y. */
export function boundsSize(min, max) {
  return {
    w: max[0] - min[0],
    d: max[2] - min[2],
    h: max[1] - min[1],
  }
}

/**
 * Translation that puts the bottom face on y = 0 and the XZ centre on the origin.
 * `min` and `max` are world-space corners.
 */
function zero(value) {
  return value === 0 ? 0 : value
}

export function bottomCentreOffset(min, max) {
  return {
    x: zero(-((min[0] + max[0]) / 2)),
    y: zero(-min[1]),
    z: zero(-((min[2] + max[2]) / 2)),
  }
}

function sceneOf(document) {
  const scene = document.getRoot().listScenes()[0]
  if (!scene) throw new Error('glTF has no scene')
  return scene
}

function measure(scene) {
  const box = getBounds(scene)
  return boundsSize(box.min, box.max)
}

/**
 * Scale the scene into metres, turn it `rotateY` degrees about +Y (counter-clockwise seen
 * from above), and move it so the origin is the bottom centre.
 * Returns the bounds from before the transform and the bounds after it.
 */
export function applyBottomCentre(document, scale = 1, rotateY = 0) {
  const scene = sceneOf(document)
  const original = measure(scene)
  const wrapper = document.createNode('nestwright-origin')
  for (const child of [...scene.listChildren()]) {
    scene.removeChild(child)
    wrapper.addChild(child)
  }
  scene.addChild(wrapper)
  wrapper.setScale([scale, scale, scale])
  if (rotateY) {
    const half = (rotateY * Math.PI) / 360
    wrapper.setRotation([0, Math.sin(half), 0, Math.cos(half)])
  }
  const scaled = getBounds(scene)
  const offset = bottomCentreOffset(scaled.min, scaled.max)
  wrapper.setTranslation([offset.x, offset.y, offset.z])
  return { original, bounds: measure(scene), offset, scale }
}
