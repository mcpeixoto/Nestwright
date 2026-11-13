import { exportJson, newProject, openProject, saveProject } from '../actions'
import { registerTopBarAction } from './registry'

registerTopBarAction({ id: 'new', label: 'New', order: 10, run: () => newProject() })
registerTopBarAction({ id: 'open', label: 'Open', order: 20, run: () => void openProject() })
registerTopBarAction({ id: 'save', label: 'Save', order: 30, run: () => void saveProject() })
registerTopBarAction({ id: 'export-json', label: 'Export JSON', order: 40, run: () => void exportJson() })
