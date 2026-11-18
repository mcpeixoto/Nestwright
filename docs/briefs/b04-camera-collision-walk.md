# b04 — Camera: walk capsule and orbit clamping

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** grok-4.7-high
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Walk mode moves a 0.3 m-radius, 1.7 m-tall capsule: it cannot clip a wall with a shoulder, cannot
walk under a mezzanine slab or a stair flight that is lower than head height, still passes through
door openings, and still climbs stairs. The orbit camera's target can no longer be panned off the
house, never rolls, and glides (not jumps) to the new level when the active level changes.
Bugs `C-WALK-WALL`, `C-ORBIT-LEVEL`, `C-ORBIT-ROLL` from `docs/BUGS.md` close.

## Context the implementer needs
- Walk rig: `src/view3d/rigs/walk.ts`. `RADIUS = 0.22` (l.16), `EYE = 1.65` (l.14),
  `supportAt` (l.86, floor/stair/item support under the feet), `blockingFurniture` (l.124,
  items taller than 0.4 m block; items whose bottom is above `feetY + 1.6` do not),
  `update(dt)` (l.353–398) integrates with `integrateWalk` from `src/model/walkMove.ts`, which
  calls `moveCircle` (`src/model/collision.ts:154`). Walls come from `levelObstacles(level)`
  (`collision.ts:69`; door-like openings are gaps via `isPassableOpening`, windows stay solid).
- Stairs: `stairHeightAt` (walk.ts:48) gives the tread height under a point. A flight on the
  level below is an overhead obstacle for someone walking under it.
- Orbit: `src/view3d/SceneController.ts:159–164` creates `OrbitControls` with
  `enableDamping`, `maxPolarAngle = Math.PI * 0.48`, `target.set(5, 1, 4)`. `frameOn` (l.625–645)
  sets `controls.target` straight to the bounding sphere centre. `sync()` (l.383) runs on every
  store change and sees `state.activeLevelId`; `applyVisibility` (l.587) already finds the active
  level. The per-frame loop is the method that calls `this.controls.update()` (grep `controls.update`).
  `visibleWallBounds(project, state)` (l.976) returns a `THREE.Box3` of the visible walls.
- Pure tests only in `tests/view3d/*.test.ts` (node environment, `three` importable).

## Steps
1. Tests first: `tests/view3d/walkCollision.test.ts`.
2. New `src/model/headroom.ts` (pure):
   ```ts
   export const WALK_RADIUS = 0.3
   export const WALK_HEIGHT = 1.7
   /** Lowest solid surface above `feetY` at (x, y), or null when the sky is open. */
   export function ceilingAt(project: Project, levelId: string, x: number, y: number, feetY: number): number | null
   export function headroomBlocked(project, levelId, x, y, feetY, height = WALK_HEIGHT): boolean
   ```
   `ceilingAt` checks, for every level with `elevation > feetY + 0.05`: the level's floor
   (`level.elevation - level.slabThickness`) where a room polygon of that level contains the point
   (`detectRooms` or `roomsFor`; use `detectRooms` from `src/model/rooms.ts` to stay pure) unless
   the point is inside a stair hole of a stair on the level below (`stairHoleOutline` in
   `src/model/stairs.ts` — check the export name); the underside of any stair flight of any level
   where `stairHeightAt`-equivalent height minus 0.25 (stringer) is above `feetY`; and any item
   whose footprint contains the point with `bottom = level.elevation + item.elevation > feetY + 0.4`
   (a wall cabinet) → bottom. Return the minimum. Move `stairHeightAt` from walk.ts into
   `src/model/stairs.ts` as an export (same body) so the model can use it.
3. `src/view3d/rigs/walk.ts`: `RADIUS = WALK_RADIUS`; in `update`, after `integrateWalk`, if
   `headroomBlocked(project, activeId, moved.x, moved.y, feetY)` and not blocked at the
   current position, keep the old `feetX/feetZ` (slide attempt: try the move along x only, then
   along y only, accept the first that is not blocked). Also when `vy > 0` (jump), cap
   `nextFeet` at `ceilingAt(...) - WALK_HEIGHT` when that is finite.
   `blockingFurniture`: replace the `1.6` with `WALK_HEIGHT`.
4. New `src/model/orbitClamp.ts` (pure):
   ```ts
   export interface Bounds3 { min: {x,y,z}; max: {x,y,z} }
   export function clampOrbitTarget(target: {x,y,z}, bounds: Bounds3, margin = 3): {x,y,z}
   export function easeTarget(from, to, dt, tau = 0.12): {x,y,z}   // exponential ease, 1 - exp(-dt/tau)
   ```
   `clampOrbitTarget` clamps x/z to `[min - margin, max + margin]` and y to `[min.y, max.y]`.
5. `src/view3d/SceneController.ts`:
   - keep `this.orbitGoal: THREE.Vector3 | null`. In `sync()`, when `prev.activeLevelId !==
     state.activeLevelId` and the view is not `walk`: compute the new level's bounds
     (`visibleWallBounds`), set `orbitGoal` to the current target with `y` replaced by
     `level.elevation + 1` (clamped into the bounds), do **not** set the target directly.
   - in the per-frame update before `controls.update()`: if `orbitGoal`, move
     `controls.target` with `easeTarget(target, goal, dt)` and move `camera.position` by the
     same delta (the view translates, the orbit radius stays); clear the goal when within 1 cm.
     Then always `controls.target.copy(clampOrbitTarget(target, boundsOfActiveLevel, 3))` and
     apply the same correction delta to the camera position, so panning stops at the edge
     instead of snapping back.
   - `this.camera.up.set(0, 1, 0)` once in the constructor and `controls.update()` leaves it
     (OrbitControls never rolls, but `matchPose`/`frameAt` callers must not set `up`; assert
     by reading it in the e2e check).
   - `frameOn` keeps its direct set (that is the explicit "frame" action).

## Tests to add
`tests/view3d/walkCollision.test.ts`
- "a 0.3 m body cannot pass a 0.5 m gap between two walls": two parallel `ThickSegment`s 0.5 m
  apart (half-widths 0.1) → `moveCircle(origin, 0.3, delta, segs)` ends on the near side
  (`x < gapX - 0.3 + 1e-3`).
- "a 0.3 m body passes a 0.9 m door": `solidSegments` of a 6 m wall with a 0.9 door at offset 3
  → a move through x=3 crosses the wall centre line.
- "headroom blocks under a low slab and not under a stair hole": project with ground level
  (room 0..6×0..5) and upper level at elevation 1.2 (deliberately low) with the same room;
  `headroomBlocked(project, ground.id, 3, 2, 0)` is true; add a stair on the ground level whose
  hole covers (3, 2) → false.
- "headroom is open outdoors": point outside every room → `ceilingAt` returns null.
- "clampOrbitTarget holds x/z inside bounds + margin and y inside the level":
  bounds `(0,0,0)-(6,2.7,5)`, target `(20, -3, 2)` → `(9, 0, 2)`.
- "easeTarget converges": 30 steps of `dt = 1/60` from 0 to 10 end within 0.1 of 10 and never overshoot.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d tests/model` green
  (pre-existing `tests/model/collision.test.ts`, `walkSpawn.test.ts`, `roomCamera*.test.ts` included).
- `npm run test:bash -- camera` (b01): `C-WALK-WALL`, `C-WALK-DOOR`, `C-ORBIT-LEVEL`,
  `C-ORBIT-ROLL` pass; remove their rows from `docs/BUGS.md`.

## Out of scope / forbidden
- No change to OrbitControls' zoom or rotate behaviour; no new rig.
- Do not edit existing tests or user-facing strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
