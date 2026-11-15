import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { getPlatform } from '../../platform'
import { fill, translate } from '../../i18n'
import { useSettings } from '../../settings'
import { useStore } from '../../store'
import { getController } from '../../view3d/SceneController'
import { bytesToDataUrl } from './binary'

function say(key: string, vars?: Record<string, string | number>): void {
  const language = useSettings.getState().language
  useStore.getState().setMessage(vars ? fill(language, key, vars) : translate(language, key))
}

function fileName(name: string): string {
  const clean = name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'house'
  return `${clean}.glb`
}

export async function exportHouseGlb(): Promise<void> {
  const root = getController()?.exportRoot()
  if (!root) {
    say('The 3D view is not ready')
    return
  }
  try {
    const exporter = new GLTFExporter()
    const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true })
    if (!(result instanceof ArrayBuffer)) {
      say('Could not build the GLB')
      return
    }
    const name = fileName(useStore.getState().project.name)
    const ok = await getPlatform().saveFile(name, bytesToDataUrl(new Uint8Array(result), 'model/gltf-binary'))
    if (ok) say('Saved {name}', { name })
    else say('Export cancelled')
  } catch (err) {
    console.error(err)
    say('Could not export the house')
  }
}
