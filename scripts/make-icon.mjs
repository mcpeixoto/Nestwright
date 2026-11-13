import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const pngPath = path.join(buildDir, 'icon.png')
const icnsPath = path.join(buildDir, 'icon.icns')
const SIZE = 1024

const SLATE = [0x24, 0x30, 0x38, 255]
const SAND = [0xe8, 0xb8, 0x6d, 255]
const TEAL = [0x3f, 0xb8, 0xaf, 255]

fs.mkdirSync(buildDir, { recursive: true })

function drawPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = SLATE[0]
    pixels[i + 1] = SLATE[1]
    pixels[i + 2] = SLATE[2]
    pixels[i + 3] = 255
  }
  const set = (x, y, color) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return
    const i = (py * SIZE + px) * 4
    pixels[i] = color[0]
    pixels[i + 1] = color[1]
    pixels[i + 2] = color[2]
    pixels[i + 3] = color[3]
  }
  const distToSeg = (px, py, x0, y0, x1, y1) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = dx * dx + dy * dy
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len))
    const x = x0 + t * dx
    const y = y0 + t * dy
    return Math.hypot(px - x, py - y)
  }
  const stroke = (x0, y0, x1, y1, width, color) => {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - width))
    const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(x0, x1) + width))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - width))
    const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(y0, y1) + width))
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (distToSeg(x, y, x0, y0, x1, y1) <= width / 2) set(x, y, color)
      }
    }
  }
  const house = [
    [250, 470],
    [512, 190],
    [774, 470],
    [774, 820],
    [250, 820],
    [250, 470],
  ]
  for (let i = 0; i < house.length - 1; i++) {
    const a = house[i]
    const b = house[i + 1]
    if (!a || !b) continue
    stroke(a[0], a[1], b[0], b[1], 34, SAND)
  }
  const cx = 512
  const cy = 560
  const scale = 118
  for (let y = cy - scale * 1.3; y <= cy + scale * 1.2; y++) {
    for (let x = cx - scale * 1.3; x <= cx + scale * 1.3; x++) {
      const nx = (x - cx) / scale
      const ny = (cy - y) / scale
      const a = nx * nx + ny * ny - 1
      if (a * a * a - nx * nx * ny * ny * ny < 0) set(x, y, TEAL)
    }
  }
  return pixels
}

function crc32(data) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const name = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function writePng(pixels) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1)
    raw[row] = 0
    pixels.copy(raw, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(pngPath, png)
}

async function drawWithCanvas() {
  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#243038'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = '#E8B86D'
  ctx.lineWidth = 34
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(250, 470)
  ctx.lineTo(512, 190)
  ctx.lineTo(774, 470)
  ctx.lineTo(774, 820)
  ctx.lineTo(250, 820)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = '#3FB8AF'
  ctx.beginPath()
  const cx = 512
  const cy = 560
  const s = 118
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2
    const x = cx + s * 16 * Math.sin(t) ** 3 / 16
    const y = cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  fs.writeFileSync(pngPath, canvas.toBuffer('image/png'))
}

try {
  await drawWithCanvas()
} catch {
  writePng(drawPixels())
}

if (process.platform === 'darwin') {
  const iconset = path.join(buildDir, 'icon.iconset')
  fs.rmSync(iconset, { recursive: true, force: true })
  fs.mkdirSync(iconset, { recursive: true })
  const sizes = [16, 32, 128, 256, 512]
  let ok = true
  for (const size of sizes) {
    const plain = spawnSync('sips', ['-z', String(size), String(size), pngPath, '--out', path.join(iconset, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
    const retina = spawnSync('sips', ['-z', String(size * 2), String(size * 2), pngPath, '--out', path.join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
    if (plain.status !== 0 || retina.status !== 0) ok = false
  }
  if (ok) {
    const made = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath], { stdio: 'ignore' })
    ok = made.status === 0
  }
  fs.rmSync(iconset, { recursive: true, force: true })
  if (!ok) process.stderr.write('iconutil could not write build/icon.icns\n')
}

process.stdout.write(fs.existsSync(pngPath) ? `wrote ${pngPath}\n` : 'png missing\n')
