import { LibraryDrawer } from '../LibraryDrawer'
import { icon } from '../../tools/icons'
import { registerPanel } from './registry'

registerPanel({
  id: 'library',
  title: 'Furniture',
  placement: 'right',
  icon: icon('<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z"/>'),
  Component: LibraryDrawer,
})
