import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { applyAlbedoContrast, meanSrgb, ormFillByte, ormPlan } from './image.mjs'
import { encodeCommand, resolveEncoder } from './ktx.mjs'
import { resolutionPixels } from './tile.mjs'

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))
    })
  })
}

export async function encodeMap(role, pngPath, ktxPath, env = process.env) {
  const encoder = resolveEncoder(env)
  const command = encodeCommand(encoder, role, pngPath, ktxPath)
  try {
    await run(command.cmd, command.args)
  } catch (err) {
    if (err?.code !== 'ENOENT' || encoder.kind !== 'toktx') throw err
    const fallback = encoder.bin.endsWith('toktx')
      ? { bin: encoder.bin.replace(/toktx$/, 'ktx'), kind: 'ktx' }
      : { bin: 'ktx', kind: 'ktx' }
    const again = encodeCommand(fallback, role, pngPath, ktxPath)
    await run(again.cmd, again.args)
  }
}

async function grey(input, width, height, fill) {
  if (!input) return Buffer.alloc(width * height, fill)
  const { data, info } = await sharp(input)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== width || info.height !== height) throw new Error('resized map has unexpected dimensions')
  return data
}

/** `aoStrength` < 1 lerps AO toward white: a flattened plaster's AO blotches would undo it. */
export async function buildOrmPng(maps, width, height, aoStrength = 1) {
  const rgb = await buildOrmRaw(maps, width, height, aoStrength)
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/**
 * Mean AO / roughness / metalness of the packed ORM, 0–1. The game divides the material's
 * scalar by these so the scan's variation is kept but its average lands on the library value.
 */
export async function ormMeans(maps, width, height, aoStrength = 1) {
  const rgb = await buildOrmRaw(maps, width, height, aoStrength)
  return meanSrgb(rgb, 3).map((value) => Math.round((value / 255) * 1000) / 1000)
}

async function buildOrmRaw(maps, width, height, aoStrength = 1) {
  const plan = ormPlan({
    ao: Boolean(maps.ao),
    roughness: Boolean(maps.roughness),
    metalness: Boolean(maps.metalness),
  })
  const red = await grey(maps.ao, width, height, ormFillByte(plan.r) ?? 255)
  const green = await grey(maps.roughness, width, height, ormFillByte(plan.g) ?? 128)
  const blue = await grey(maps.metalness, width, height, ormFillByte(plan.b) ?? 0)
  const rgb = Buffer.alloc(width * height * 3)
  const k = Math.min(1, Math.max(0, aoStrength))
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = k === 1 ? red[i] : Math.round(255 - (255 - red[i]) * k)
    rgb[i * 3 + 1] = green[i]
    rgb[i * 3 + 2] = blue[i]
  }
  return rgb
}

/** Round down to a multiple of 4: WebGPU rejects block-compressed textures of any other size. */
export function blockAligned(size) {
  return Math.max(4, Math.floor(size / 4) * 4)
}

export async function readAlbedo(input, pixels, albedoContrast = 1) {
  const fitted = await sharp(input)
    .resize(pixels, pixels, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const width = blockAligned(fitted.info.width)
  const height = blockAligned(fitted.info.height)
  let data = fitted.data
  let channels = fitted.info.channels
  if (width !== fitted.info.width || height !== fitted.info.height) {
    const resized = await sharp(fitted.data, { raw: fitted.info })
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    data = resized.data
    channels = resized.info.channels
  }
  applyAlbedoContrast(data, channels, albedoContrast)
  return { data, width, height, meanAlbedoSrgb: meanSrgb(data, channels) }
}

/**
 * Write albedo, normal and ORM KTX2 files for one cached texture.
 * `encode` defaults to toktx; tests can pass a stub.
 */
export async function processTexture(meta, destDir, options = {}) {
  const albedoFile = meta.files.find((file) => file.role === 'albedo')
  if (!albedoFile) throw new Error(`${meta.key}: cache has no albedo`)
  const byRole = Object.fromEntries(meta.files.filter((file) => file.role).map((file) => [file.role, file.abs]))
  if (!byRole.roughness) throw new Error(`${meta.key}: cache has no roughness map`)
  const pixels = resolutionPixels(meta.resolution)
  const albedo = await readAlbedo(byRole.albedo, pixels, options.albedoContrast ?? 1)
  const png = await sharp(albedo.data, { raw: { width: albedo.width, height: albedo.height, channels: 3 } }).png().toBuffer()
  const orm = await buildOrmPng(
    { ao: byRole.ao, roughness: byRole.roughness, metalness: byRole.metalness },
    albedo.width,
    albedo.height,
    options.albedoContrast ?? 1,
  )
  let normal = null
  if (byRole.normal) {
    normal = await sharp(byRole.normal)
      .resize(albedo.width, albedo.height, { fit: 'fill' })
      .png()
      .toBuffer()
  }
  await mkdir(destDir, { recursive: true })
  const scratch = join(tmpdir(), `nestwright-${meta.key}-${process.pid}`)
  await mkdir(scratch, { recursive: true })
  const encode = options.encode ?? encodeMap
  try {
    const jobs = [
      ['albedo', png, join(destDir, 'albedo.ktx2')],
      ['orm', orm, join(destDir, 'orm.ktx2')],
    ]
    if (normal) jobs.push(['normal', normal, join(destDir, 'normal.ktx2')])
    for (const [role, buffer, dest] of jobs) {
      const src = join(scratch, `${role}.png`)
      await writeFile(src, buffer)
      await encode(role, src, dest, options.env)
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  const meanOrm = await ormMeans(
    { ao: byRole.ao, roughness: byRole.roughness, metalness: byRole.metalness },
    256,
    256,
    options.albedoContrast ?? 1,
  )
  return { meanAlbedoSrgb: albedo.meanAlbedoSrgb, meanOrm, width: albedo.width, height: albedo.height }
}

/** ORM means from the cached maps alone, for manifests written before `meanOrm` existed. */
export async function textureOrmMeans(meta, aoStrength = 1) {
  const byRole = Object.fromEntries(meta.files.filter((file) => file.role).map((file) => [file.role, file.abs]))
  if (!byRole.roughness) throw new Error(`${meta.key}: cache has no roughness map`)
  return ormMeans({ ao: byRole.ao, roughness: byRole.roughness, metalness: byRole.metalness }, 256, 256, aoStrength)
}
