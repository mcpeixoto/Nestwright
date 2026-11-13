import { useTranslate } from '../../i18n'
import { openHome } from '../session'
import { registerTopBarAction } from '../topbar/registry'

function HomeButton() {
  const tr = useTranslate()
  return (
    <button type="button" onClick={() => openHome()}>
      {tr('Home')}
    </button>
  )
}

registerTopBarAction({
  id: 'home',
  label: 'Home',
  order: 0,
  Component: HomeButton,
})
