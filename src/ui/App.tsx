import { useEffect } from 'react'
import { installAudio } from '../audio/install'
import { saveAutosave } from '../io/autosave'
import { PlanCanvas } from '../plan2d/PlanCanvas'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { Viewport3D } from '../view3d/Viewport3D'
import '../achievements/boot'
import { ToastHost } from '../achievements/toast'
import { HelpDialog } from './HelpDialog'
import { PerfHud } from './PerfHud'
import { PhotoMode } from './PhotoMode'
import { usePhotoSession } from './photoSession'
import './panels/EnvironmentPanel'
import './together/install'
import './topbar/exportMenu'
import { Inspector } from './Inspector'
import { LevelBar } from './LevelBar'
import { PanelSlot } from './panels/PanelSlot'
import { useOpenPanelIds, usePanelList } from './panels/registry'
import './panels/library'
import './panels/OutsidePanel'
import { SettingsDialog } from './SettingsDialog'
import { StatusBar } from './StatusBar'
import { installDocumentSession } from './documentSession'
import { installShortcuts } from './installShortcuts'
import { TopBar } from './TopBar'
import { ToolRail } from './ToolRail'
import { TogetherChrome } from './together/chrome'
import { ConfirmHost } from './confirm'
import { useCompareVariant } from './together/compare'
import { CompareBanner } from './together/CompareBanner'
import { VariantPane } from './together/VariantPane'
import { Tour } from './onboarding/Tour'
import { useScreen } from './session'
import { StartScreen } from './start/StartScreen'
import './start/home'
import { scheduleThumb } from './start/thumbs'
import { rememberProject } from './start/recent'

const OUTSIDE_PANELS = new Set(['outside', 'brush'])

function EditorShell() {
  const view = useStore((s) => s.view)
  const photo = usePhotoSession().photo
  const compareId = useCompareVariant()
  const apartment = useStore((s) => s.project.kind === 'apartment')
  const panels = usePanelList()
  const openIds = useOpenPanelIds()
  const open = new Set(openIds)
  const showPlan = !photo && !compareId && (view === '2d' || view === 'split')
  const show3d = photo || !!compareId || view === '3d' || view === 'split' || view === 'walk'
  const visible = (id: string) => open.has(id) && !(apartment && OUTSIDE_PANELS.has(id))
  const left = panels.filter((panel) => panel.placement === 'left' && visible(panel.id))
  const right = panels.filter((panel) => panel.placement === 'right' && visible(panel.id))
  const bottom = panels.filter((panel) => panel.placement === 'bottom' && visible(panel.id))
  const floating = panels.filter((panel) => panel.placement === 'floating' && visible(panel.id))

  return (
    <>
      <TopBar />
      <div className="workspace">
        <ToolRail />
        {left.map((panel) => (
          <PanelSlot key={panel.id} panel={panel} />
        ))}
        <main className={compareId ? 'stage compare' : view === 'split' ? 'stage split' : 'stage'}>
          {compareId && <CompareBanner />}
          <div className="compare-row">
            <div className={showPlan ? 'pane' : 'pane hidden'}>
              <PlanCanvas />
            </div>
            <div className={show3d ? 'pane' : 'pane hidden'}>
              <Viewport3D />
            </div>
            {compareId && <VariantPane />}
          </div>
          {floating.length > 0 && (
            <div className="float-stack">
              {floating.map((panel) => (
                <PanelSlot key={panel.id} panel={panel} stacked />
              ))}
            </div>
          )}
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
      <TogetherChrome />
      <ToastHost />
      {photo && <PhotoMode />}
      <Tour />
    </>
  )
}

export function App() {
  const screen = useScreen()
  const photo = usePhotoSession().photo

  useEffect(() => installShortcuts(), [])
  useEffect(() => installDocumentSession(), [])
  useEffect(() => installAudio(), [])

  useEffect(() => {
    const apply = () => {
      const scale = useSettings.getState().uiScale
      if (typeof document === 'undefined') return
      document.documentElement.style.setProperty('--ui-scale', String(Number.isFinite(scale) ? scale : 1))
    }
    apply()
    return useSettings.subscribe(apply)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((state, prev) => {
      if (state.project === prev.project) return
      if (timer) clearTimeout(timer)
      const seconds = useSettings.getState().autosaveInterval
      if (!(seconds > 0)) return
      timer = setTimeout(() => {
        const project = useStore.getState().project
        saveAutosave(project)
        scheduleThumb((thumb) => rememberProject(project, thumb))
      }, seconds * 1000)
    })
  }, [])

  const className = [photo && screen === 'editor' ? 'app photo-mode' : 'app', screen === 'editor' ? '' : 'start-mode']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {screen === 'editor' ? <EditorShell /> : <StartScreen />}
      <PerfHud />
      <HelpDialog />
      <SettingsDialog />
      <ConfirmHost />
    </div>
  )
}
