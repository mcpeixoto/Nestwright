import { existsSync } from 'node:fs'
import process from 'node:process'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * toktx 4.4.2 is not deprecated (its own --help still documents these flags).
 * `ktx create` is the fallback when the toktx binary is absent.
 * `--encode etc1s` / `basis-lz` is ETC1S. Normals use UASTC + zstd.
 */
export const TOKTX_ARGS = {
  albedo: ['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--genmipmap', '--assign_oetf', 'srgb'],
  orm: ['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--genmipmap', '--assign_oetf', 'linear'],
  normal: ['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--normal_mode', '--assign_oetf', 'linear'],
}

export const KTX_CREATE_ARGS = {
  albedo: ['create', '--format', 'R8G8B8A8_SRGB', '--encode', 'basis-lz', '--clevel', '4', '--qlevel', '192', '--generate-mipmap', '--assign-oetf', 'srgb'],
  orm: ['create', '--format', 'R8G8B8A8_UNORM', '--encode', 'basis-lz', '--clevel', '4', '--qlevel', '192', '--generate-mipmap', '--assign-oetf', 'linear'],
  normal: ['create', '--format', 'R8G8B8A8_UNORM', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18', '--generate-mipmap', '--normal-mode', '--assign-oetf', 'linear'],
}

export function resolveEncoder(env = process.env, home = homedir(), exists = existsSync) {
  const configured = env.KTX_BIN || join(home, '.local', 'opt', 'ktx', 'bin')
  if (/(^|[/\\])toktx$/.test(configured)) return { bin: configured, kind: 'toktx' }
  if (/(^|[/\\])ktx$/.test(configured)) return { bin: configured, kind: 'ktx' }
  const toktx = join(configured, 'toktx')
  const ktx = join(configured, 'ktx')
  if (exists(toktx)) return { bin: toktx, kind: 'toktx' }
  if (exists(ktx)) return { bin: ktx, kind: 'ktx' }
  return { bin: 'toktx', kind: 'toktx' }
}

export function encodeCommand(encoder, role, input, output) {
  if (role !== 'albedo' && role !== 'orm' && role !== 'normal') throw new Error(`unknown texture role ${role}`)
  if (encoder.kind === 'toktx') return { cmd: encoder.bin, args: [...TOKTX_ARGS[role], output, input] }
  if (encoder.kind === 'ktx') return { cmd: encoder.bin, args: [...KTX_CREATE_ARGS[role], input, output] }
  throw new Error(`unknown encoder ${encoder.kind}`)
}
