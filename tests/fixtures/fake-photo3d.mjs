#!/usr/bin/env node
// Stand-in for the photo-to-3D converter in tests. Follows its contract:
//   fake-photo3d.mjs --out <file.glb> [--quality fast|best] <image>...
// FAKE_PHOTO3D_MODE: ok (default) | error | hang | silent-fail | no-model | split
import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { setInterval, setTimeout } from 'node:timers'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const out = outIndex >= 0 ? args[outIndex + 1] : ''
const mode = process.env.FAKE_PHOTO3D_MODE || 'ok'

/** A 2 × 1 × 0.5 m box (positions + indices only), as a minimal binary glTF. */
function boxGlb() {
  const [x, y, z] = [1, 0.5, 0.25]
  const positions = new Float32Array([
    -x, 0, -z, x, 0, -z, x, 2 * y, -z, -x, 2 * y, -z,
    -x, 0, z, x, 0, z, x, 2 * y, z, -x, 2 * y, z,
  ])
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ])
  const bin = Buffer.alloc(positions.byteLength + indices.byteLength)
  Buffer.from(positions.buffer).copy(bin, 0)
  Buffer.from(indices.buffer).copy(bin, positions.byteLength)
  const json = {
    asset: { version: '2.0', generator: 'fake-photo3d' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.6, 0.4, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-x, 0, -z], max: [x, 2 * y, z] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  }
  let jsonBuf = Buffer.from(JSON.stringify(json))
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)])
  let binBuf = bin
  if (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(4 - (binBuf.length % 4))])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8)
  const chunk = (buf, type) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(buf.length, 0)
    head.writeUInt32LE(type, 4)
    return Buffer.concat([head, buf])
  }
  return Buffer.concat([header, chunk(jsonBuf, 0x4e4f534a), chunk(binBuf, 0x004e4942)])
}

if (mode === 'error') {
  process.stdout.write('PROGRESS 0.1 loading photos\n')
  process.stdout.write('ERROR no furniture found in the photo\n')
  process.exit(2)
} else if (mode === 'silent-fail') {
  process.stderr.write('Traceback: something broke\n')
  process.exit(3)
} else if (mode === 'hang') {
  process.stdout.write('PROGRESS 0.05 waiting\n')
  setInterval(() => {}, 1000)
} else if (mode === 'no-model') {
  process.stdout.write('PROGRESS 1 done\n')
  process.exit(0)
} else {
  if (mode === 'split') {
    process.stdout.write('PROG')
    await new Promise((resolve) => setTimeout(resolve, 30))
    process.stdout.write('RESS 0.25 segment')
    await new Promise((resolve) => setTimeout(resolve, 30))
    process.stdout.write('ing\n')
  }
  process.stdout.write('some log line\n')
  process.stdout.write(`PROGRESS 0.5 meshing ${args.filter((a) => a.endsWith('.jpg')).length} photos\n`)
  writeFileSync(out, boxGlb())
  process.stdout.write('PROGRESS 1 writing\n')
  process.stdout.write(`DONE ${out}`)
  process.exit(0)
}
