import { createRoot } from 'react-dom/client'
import './catalog'
import { bootImportedModels } from './io/importModel'
import { installCrashGuard } from './platform/crash'
import { useSettings } from './settings'
import { useStore } from './store'
import './tools'
import { App } from './ui/App'
import { getController } from './view3d/SceneController'
import './ui/styles.css'

installCrashGuard()

bootImportedModels()

window.__nestwright = { useStore, useSettings, getController }

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
