import { translate } from '../../i18n'
import { useSettings } from '../../settings'
import { templateById } from '../../templates'
import { planThumb } from '../../templates/thumbnail'
import { beginProject } from '../session'
import { cachedThumb } from './lazyThumbs'
import { rememberProject } from './recent'

/** Same path as the template gallery card: build the project and open the editor. */
export function loadTemplate(id: string): boolean {
  const info = templateById(id)
  if (!info) return false
  let project
  try {
    project = info.create()
  } catch {
    return false
  }
  project.name = translate(useSettings.getState().language, info.nameKey)
  beginProject(project)
  const remember = () => rememberProject(project, cachedThumb(id) || planThumb(project))
  if (typeof requestIdleCallback === 'function') requestIdleCallback(remember)
  else setTimeout(remember, 1)
  return true
}
