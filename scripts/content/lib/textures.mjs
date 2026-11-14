import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { meanSrgb, ormFillByte, ormPlan } from './image.mjs'
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

export async function buildOrmPng(maps, width, height) {
  const plan = ormPlan({
    ao: Boolean(maps.ao),
    roughness: Boolean(maps.roughness),
    metalness: Boolean(maps.metalness),
  })
  const red = await grey(maps.ao, width, height, ormFillByte(plan.r) ?? 255)
  const green = await grey(maps.roughness, width, height, ormFillByte(plan.g) ?? 128)
  const blue = await grey(maps.metalness, width, height, ormFillByte(plan.b) ?? 0)
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = red[i]
    rgb[i * 3 + 1] = green[i]
    rgb[i * 3 + 2] = blue[i]
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

export async function readAlbedo(input, pixels) {
  const { data, info } = await sharp(input)
    .resize(pixels, pixels, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, meanAlbedoSrgb: meanSrgb(data, info.channels) }
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
  const albedo = await readAlbedo(byRole.albedo, pixels)
  const png = await sharp(albedo.data, { raw: { width: albedo.width, height: albedo.height, channels: 3 } }).png().toBuffer()
  const orm = await buildOrmPng(
    { ao: byRole.ao, roughness: byRole.roughness, metalness: byRole.metalness },
    albedo.width,
    albedo.height,
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
  return { meanAlbedoSrgb: albedo.meanAlbedoSrgb, width: albedo.width, height: albedo.height }
}
