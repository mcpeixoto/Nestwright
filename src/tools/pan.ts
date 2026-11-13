import { icon } from './icons'
import { registerTool } from './registry'

let last: { x: number; y: number } | null = null

registerTool({
  id: 'pan',
  label: 'Pan',
  group: 'build',
  cursor: 'grab',
  icon: icon('<path d="M12 3v18M3 12h18M8 7l-4 5 4 5M16 7l4 5-4 5"/>'),
  activate() {
    last = null
  },
  onPointerDown(ctx) {
    last = { ...ctx.screen }
  },
  onPointerMove(ctx) {
    if (!last) return
    ctx.transform.panBy(ctx.screen.x - last.x, ctx.screen.y - last.y)
    last = { ...ctx.screen }
  },
  onPointerUp() {
    last = null
  },
})
