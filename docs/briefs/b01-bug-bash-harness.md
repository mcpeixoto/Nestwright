# b01 — Bug-bash harness

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
A Playwright spec set under `tests/e2e/bash/` drives the three owner-reported bug areas
(wall/room editing, camera and 3D navigation, furniture placing) through real clicks plus the
`window.__nestwright` hook, and records every failed check as a row in `docs/BUGS.md`. The
specs are a diagnostic tool for b02–b05, not a CI gate: the normal `npm run test:e2e` ignores
them, and `npm run test:bash` runs only them.

## Context the implementer needs
- `tests/e2e/smoke.spec.ts` and `tests/e2e/furniture.spec.ts`: how a spec seeds a project
  through `AUTOSAVE_KEY` + `serialize(createProject(...))` in `addInitScript`, clicks
  `Continue`, reads state through `window.__nestwright!.useStore.getState()`, and presses
  tool shortcuts (`w` wall, `v` select, `Escape`). Copy that boot sequence into a helper.
- `playwright.config.ts` (36 lines): `testDir: 'tests/e2e'`, two projects (`webgpu`, `webgl`).
- `src/main.tsx:23` sets `window.__nestwright = { useStore, useSettings, getController, loadTemplate, ... }`;
  the type lives in `src/platform/global.d.ts:76`.
- `src/plan2d/PlanRenderer.ts:23` `getPlanRenderer()` returns the live renderer, which
  implements `PlanTransform` (`worldToScreen`, `screenToWorld`, `src/tools/types.ts:3`).
- Model helpers you may call inside `page.evaluate` through the store: `addWallChain`
  (`src/model/ops/index.ts:119`), `splitWall` (`src/model/walls.ts:318`), `detectRooms`
  (`src/model/rooms.ts:461`). Rooms are keyed by the sorted ids of their walls; names live in
  `level.rooms` (`RoomProps`, `src/model/types.ts:97`).
- Top bar view buttons are named `3D`, `Split`, `Walk` (`src/ui/TopBar.tsx:25–27`).
  Walk mode: `src/view3d/rigs/walk.ts` (WASD, body radius `RADIUS = 0.22` at l.16).
  Orbit camera: `src/view3d/SceneController.ts:159` (`OrbitControls`), `pose()` at l.344.
- Shortcuts: `ControlOrMeta+c/v/z/shift+z`, `r` rotate (check `src/ui/builtinShortcuts.ts`
  for the exact rotate key before using it; if there is none, rotate through the store).

## Steps
1. `src/main.tsx` and `src/platform/global.d.ts`: add `planTransform: () => getPlanRenderer() ?? null`
   to `window.__nestwright` (type `() => PlanTransform | null`). This is the only `src/` edit.
2. `playwright.config.ts`: add `testIgnore: ['**/bash/**']` to the config object.
   New `playwright.bash.config.ts`: `import base from './playwright.config'` and
   `export default defineConfig({ ...base, testDir: 'tests/e2e/bash', testIgnore: [] })`.
   `package.json`: add script `"test:bash": "playwright test --config playwright.bash.config.ts --project webgpu"`.
3. `tests/e2e/bash/harness.ts`:
   - `bootWith(page, project: Project)`: the smoke-spec boot (init script, `goto('/')`, click
     `Continue`, wait for the `3D` button), collects `pageerror`/console errors into an array it returns.
   - `clickWorld(page, x, y, opts?: {button?, dblclick?})`: calls `window.__nestwright.planTransform().worldToScreen`
     in `page.evaluate` and clicks `canvas.plan-canvas` at that position.
   - `dragWorld(page, from, to)`: `mouse.move/down`, 6 intermediate moves, `mouse.up`.
   - `state(page)`: returns `{ walls, openings, rooms: detectRooms(level) names+areas, items, selection, canUndo, canRedo }`
     serialised from the store (compute `detectRooms` inside `page.evaluate` by calling
     `window.__nestwright.useStore.getState()` and re-deriving rooms via the room records; if
     `detectRooms` is not reachable from the page, expose the room list by reading
     `level.rooms` plus wall count).
   - `check(testInfo, bug: { id, repro, expected }, ok: boolean, actual: string)`: when `!ok`,
     append `| ${id} | ${repro} | ${expected} | ${actual} | ${testInfo.titlePath().join(' › ')} |`
     to `docs/BUGS.md` (create the file with the header below if missing; skip if a row with
     the same id exists), then `expect.soft(ok, id).toBe(true)`.
4. `docs/BUGS.md` header, created by `check` when missing:
   ```
   # Known bugs

   | id | repro steps | expected | actual | spec |
   |---|---|---|---|---|
   ```
5. `tests/e2e/bash/walls.spec.ts`, project seeded with a 6×5 m room (`addWallChain` as in
   `furniture.spec.ts`) plus a door (`createOpening`) at offset 3 on the bottom wall. Checks:
   - `W-T1` draw `w`: click (3,5)→(3,8), Escape. Expected `walls.length === 6` (top wall split
     at x=3) and every wall shares both endpoints with another wall (joint count 0 open ends).
   - `W-NEAR2` draw a wall from (6.02, 2) to (9, 2). Expected the new wall's `a` equals
     exactly `{x: 6, y: 2}` (snapped onto the right wall) and `walls.length === 8`.
   - `W-NEAR8` draw from (6.08, 3.5) to (9, 3.5). Expected the same join (b02 decides 0.05 m,
     so record the actual gap; this check is expected to FAIL until b02).
   - `W-SPLIT-DOOR` call `splitWall(level, bottomWallId, {x: 2, y: 0})` through the store.
     Expected one opening still exists, its `wallId` is the half whose span contains x=3, and
     `offset ≈ 1` on the spawned half.
   - `W-MOVE-ROOM` rename the room to `Studio` through the store (`level.rooms.push({...})`),
     then drag the top wall from (3, 5) to (3, 5.6) in select mode. Expected after the drag:
     `detectRooms` has one room named `Studio` with area ≈ 6 × 5.6 = 33.6 (±0.3).
   - After each of the above: `ControlOrMeta+z` then `ControlOrMeta+shift+z`; expected
     `walls.length`, `openings.length` and the room name equal their pre-undo values.
6. `tests/e2e/bash/camera.spec.ts`:
   - `C-WALK-WALL` click `Walk`, hold `w` 2.5 s facing the nearest wall (set yaw through
     `walkSpawn`: spawn faces −Z; seed the room so a wall is 2 m ahead). Expected the camera
     `position.z` stops ≥ `wallZ + 0.22 + 0.1` (never inside the 0.2 m wall).
   - `C-WALK-DOOR` same with the door ahead. Expected the camera passes through (z crosses
     the wall centre line).
   - `C-ORBIT-LEVEL` in `3D`, add a level through the store, `setActiveLevel(level2.id)`.
     Expected `getController().pose().target.y` within `[level2.elevation, level2.elevation + level2.height]`
     within 1 s (poll).
   - `C-ORBIT-ROLL` read `getController().camera.up`; expected `(0, 1, 0)` after any orbit drag.
7. `tests/e2e/bash/placing.spec.ts`:
   - `P-SOFA-WALL` `beginPlace('sofa-3')` via `window.__nestwright.useStore.getState().setTool`
     after `getEntry` (or click the library entry), click at (3, 0.5). Expected the item's
     back edge is flush with the wall face: `position.y ≈ 0.1 + size.d / 2` (±0.02) and
     `rotation ≈ 0` or `π` (front away from the wall).
   - `P-ROTATE` press the rotate shortcut once; expected `rotation` changed by exactly π/2 (±1e-6).
   - `P-DRAG-WALL` drag the sofa from (3, y) to (4.5, y + 0.05). Expected `position.y` unchanged
     (stays snapped) and `position.x ≈ 4.5` (±0.05).
   - `P-LAMP-TABLE` place `coffee-table` at (3, 2.5), then `table-lamp` at (3, 2.5). Expected
     the lamp `elevation ≈ table.size.h` (±0.02). Expected to FAIL until b05/c01; record it.
   - `P-COPY-PASTE` select the sofa, `ControlOrMeta+c`, `ControlOrMeta+v`; expected
     `items.length + 1`, the pasted item has `rotation` equal to the source, and one
     `ControlOrMeta+z` removes exactly one item.
   - Every placement step: `canUndo` true and one `ControlOrMeta+z` reverts exactly that placement.

## Tests to add
The three spec files above plus `harness.ts`. No vitest files.

## Acceptance
- `npm run typecheck && npm run lint && npm test` green (the hook change compiles).
- `npx playwright test --list` does not list anything under `tests/e2e/bash/`.
- `npm run test:bash` runs 3 files; failures are soft and every failed check has a row in
  `docs/BUGS.md` with id, repro, expected, actual, spec. Paste the resulting `docs/BUGS.md`
  table into the summary.

## Out of scope / forbidden
- Do not fix any bug found; this brief only records them.
- Do not edit existing specs in `tests/e2e/`, existing tests, or user-facing strings.
- Do not add these specs to CI. Do not start a dev server. Do not commit, push or merge.
- No new dependencies.
