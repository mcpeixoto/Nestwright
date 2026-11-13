import { dist, len, normalize, scale, sub } from '../model/geometry'
import type { Vec2 } from '../model/types'

/** Same spot: a click this close to the previous point does not add a segment. */
const SAME_POINT = 0.04
/** A second click this soon, on the same spot, ends the chain. */
const DOUBLE_CLICK_MS = 320
const DOUBLE_CLICK_DIST = 0.15
/** Swallow the click that the browser still delivers after a commit. */
const IGNORE_MS = 280

export interface ChainState {
  points: Vec2[]
  lastClick: number
  ignoreUntil: number
}

export interface ChainStep {
  state: ChainState
  /** Polyline to commit, when this event finished the chain. */
  commit: Vec2[] | null
}

export function initialChain(): ChainState {
  return { points: [], lastClick: 0, ignoreUntil: 0 }
}

/**
 * Pointer-down for the wall tool. A double-click ends the chain only when both
 * clicks land on the same spot; quick clicks at different points keep drawing.
 * Clicking the start point (after at least two segments) closes the loop.
 */
export function chainPointerDown(state: ChainState, point: Vec2, time: number): ChainStep {
  if (time < state.ignoreUntil) return { state, commit: null }
  const prev = state.points[state.points.length - 1]
  if (
    state.lastClick > 0 &&
    time - state.lastClick < DOUBLE_CLICK_MS &&
    state.points.length >= 2 &&
    prev &&
    dist(prev, point) < DOUBLE_CLICK_DIST
  ) {
    return finish(state, time, state.points, true)
  }
  const stamped: ChainState = { ...state, lastClick: time }
  const start = stamped.points[0]
  if (start && stamped.points.length >= 3 && dist(point, start) < SAME_POINT) {
    const closed = [...stamped.points, { x: start.x, y: start.y }]
    return finish(stamped, time, closed, false)
  }
  const last = stamped.points[stamped.points.length - 1]
  if (last && dist(last, point) < SAME_POINT) return { state: stamped, commit: null }
  return {
    state: { ...stamped, points: [...stamped.points, { x: point.x, y: point.y }] },
    commit: null,
  }
}

/** Enter, Escape, right-click, or leaving the tool. */
export function chainFinish(state: ChainState, time: number): ChainStep {
  return finish(state, time, state.points, false)
}

/** Typed length: step from the last point toward `hover`. */
export function chainExtend(state: ChainState, hover: Vec2, metres: number): ChainState {
  const last = state.points[state.points.length - 1]
  if (!last || !(metres > 0.02)) return state
  const dir = normalize(sub(hover, last))
  if (len(dir) === 0) return state
  const step = scale(dir, metres)
  return { ...state, points: [...state.points, { x: last.x + step.x, y: last.y + step.y }] }
}

function finish(state: ChainState, time: number, points: Vec2[], zeroClick: boolean): ChainStep {
  const cleared: ChainState = {
    points: [],
    lastClick: zeroClick ? 0 : state.lastClick,
    ignoreUntil: time + IGNORE_MS,
  }
  if (points.length < 2) return { state: cleared, commit: null }
  return {
    state: cleared,
    commit: points.map((p) => ({ x: p.x, y: p.y })),
  }
}
