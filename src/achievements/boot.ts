import { setHelpOpen } from '../ui/shortcuts'
import { setHelpPage } from './helpPage'
import { installAchievementWatch } from './watch'

installAchievementWatch()

if (typeof window !== 'undefined') {
  const listen = window.nestwright?.onShowAchievements
  if (listen) {
    listen(() => {
      setHelpPage('achievements')
      setHelpOpen(true)
    })
  }
}
