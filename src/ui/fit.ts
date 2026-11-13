import { getPlanRenderer } from '../plan2d/PlanRenderer'
import { getController } from '../view3d/SceneController'

/** Fit whichever views are on screen. F and both Fit buttons call this. */
export function fitVisible(): void {
  getPlanRenderer()?.fit()
  getController()?.frame()
}
