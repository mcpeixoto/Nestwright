import { createRoot } from 'react-dom/client'
import './catalog'
import { useSettings } from './settings'
import { useStore } from './store'
import './tools'
import { App } from './ui/App'
import './ui/styles.css'

window.__nestwright = { useStore, useSettings }

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
