import { createRoot } from 'react-dom/client'
import './catalog'
import { bootImportedModels } from './io/importModel'
import { installCrashGuard } from './platform/crash'
import { useSettings } from './settings'
import { useStore } from './store'
import './tools'
import { roomCameraPose } from './model/roomCamera'
import { App } from './ui/App'
import { loadTemplate } from './ui/start/loadTemplate'
import { perfReport } from './view3d/perfMonitor'
import { getController } from './view3d/SceneController'
import './ui/styles.css'

installCrashGuard()

bootImportedModels()

window.__nestwright = {
  useStore,
  useSettings,
  getController,
  loadTemplate,
  roomCameraPose,
  perf: { report: perfReport },
  async samplePixels(points) {
    const controller = getController()
    if (!controller) return points.map(() => null)
    return controller.samplePixels(points)
  },
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
