import { exportJson, newProject, openProject, saveProject, saveProjectAs } from '../actions'
import { registerTopBarAction } from './registry'

registerTopBarAction({ id: 'new', label: 'New', order: 10, run: () => newProject() })
registerTopBarAction({ id: 'open', label: 'Open', order: 20, run: () => void openProject() })
registerTopBarAction({ id: 'save', label: 'Save', order: 30, run: () => void saveProject() })
registerTopBarAction({ id: 'save-as', label: 'Save As…', order: 35, run: () => void saveProjectAs() })
registerTopBarAction({ id: 'export-json', label: 'Backup file (JSON)', order: 40, run: () => void exportJson() })
