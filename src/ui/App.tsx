import { useEffect } from 'react'
import { saveAutosave } from '../io/autosave'
import { PlanCanvas } from '../plan2d/PlanCanvas'
import { useStore } from '../store'
import { Viewport3D } from '../view3d/Viewport3D'
import '../achievements/boot'
import { ToastHost } from '../achievements/toast'
import { HelpDialog } from './HelpDialog'
import { PhotoMode } from './PhotoMode'
import { usePhotoSession } from './photoSession'
import './panels/EnvironmentPanel'
import './topbar/exportMenu'
import { Inspector } from './Inspector'
import { LevelBar } from './LevelBar'
import { PanelSlot } from './panels/PanelSlot'
import { useOpenPanelIds, usePanelList } from './panels/registry'
import './panels/library'
import './panels/OutsidePanel'
import { StatusBar } from './StatusBar'
import { installShortcuts } from './installShortcuts'
import { TopBar } from './TopBar'
import { ToolRail } from './ToolRail'

export function App() {
  const view = useStore((s) => s.view)
  const photo = usePhotoSession().photo
  const panels = usePanelList()
  const openIds = useOpenPanelIds()
  const open = new Set(openIds)
  const showPlan = !photo && (view === '2d' || view === 'split')
  const show3d = photo || view === '3d' || view === 'split' || view === 'walk'
  const left = panels.filter((panel) => panel.placement === 'left' && open.has(panel.id))
  const right = panels.filter((panel) => panel.placement === 'right' && open.has(panel.id))
  const bottom = panels.filter((panel) => panel.placement === 'bottom' && open.has(panel.id))
  const floating = panels.filter((panel) => panel.placement === 'floating' && open.has(panel.id))

  useEffect(() => installShortcuts(), [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((state, prev) => {
      if (state.project === prev.project) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => saveAutosave(useStore.getState().project), 2000)
    })
  }, [])

  return (
    <div className={photo ? 'app photo-mode' : 'app'}>
      <TopBar />
      <div className="workspace">
        <ToolRail />
        {left.map((panel) => (
          <PanelSlot key={panel.id} panel={panel} />
        ))}
        <main className={view === 'split' ? 'stage split' : 'stage'}>
          <div className={showPlan ? 'pane' : 'pane hidden'}>
            <PlanCanvas />
          </div>
          <div className={show3d ? 'pane' : 'pane hidden'}>
            <Viewport3D />
          </div>
          {floating.map((panel) => (
            <PanelSlot key={panel.id} panel={panel} />
          ))}
        </main>
        {right.map((panel) => (
          <PanelSlot key={panel.id} panel={panel} />
        ))}
        <Inspector />
      </div>
      {bottom.length > 0 && (
        <div className="bottom-dock">
          {bottom.map((panel) => (
            <PanelSlot key={panel.id} panel={panel} />
          ))}
        </div>
      )}
      <LevelBar />
      <StatusBar />
      <HelpDialog />
      <ToastHost />
      {photo && <PhotoMode />}
    </div>
  )
}
