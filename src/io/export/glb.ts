import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { getPlatform } from '../../platform'
import { useStore } from '../../store'
import { getController } from '../../view3d/SceneController'
import { bytesToDataUrl } from './binary'

function fileName(name: string): string {
  const clean = name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || 'house'
  return `${clean}.glb`
}

export async function exportHouseGlb(): Promise<void> {
  const root = getController()?.exportRoot()
  if (!root) {
    useStore.getState().setMessage('The 3D view is not ready')
    return
  }
  try {
    const exporter = new GLTFExporter()
    const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true })
    if (!(result instanceof ArrayBuffer)) {
      useStore.getState().setMessage('Could not build the GLB')
      return
    }
    const name = fileName(useStore.getState().project.name)
    const ok = await getPlatform().saveFile(name, bytesToDataUrl(new Uint8Array(result), 'model/gltf-binary'))
    useStore.getState().setMessage(ok ? `Saved ${name}` : 'Export cancelled')
  } catch (err) {
    console.error(err)
    useStore.getState().setMessage('Could not export the house')
  }
}
