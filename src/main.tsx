import { createRoot } from 'react-dom/client'
import './catalog'
import { bootImportedModels } from './io/importModel'
import { installCrashGuard } from './platform/crash'
import { installGamepadKeyboard } from './platform/gamepadKeyboard'
import { getPlatform } from './platform'
import { useSettings } from './settings'
import { useStore } from './store'
import './tools'
import { getEntry } from './catalog/registry'
import { roomCameraPose } from './model/roomCamera'
import { App } from './ui/App'
import { loadTemplate } from './ui/start/loadTemplate'
import { perfReport } from './view3d/perfMonitor'
import { getController } from './view3d/SceneController'
import './ui/styles.css'

installCrashGuard()
installGamepadKeyboard(getPlatform().steam)

bootImportedModels()

window.__nestwright = {
  useStore,
  useSettings,
  getController,
  loadTemplate,
  roomCameraPose,
  getEntry,
  perf: { report: (frames, options) => perfReport(frames, { settle: 30, ...options }) },
  async samplePixels(points) {
    const controller = getController()
    if (!controller) return points.map(() => null)
    return controller.samplePixels(points)
  },
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
