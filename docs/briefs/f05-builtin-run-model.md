# f05 — Built-in run model (kitchen / wardrobe / vanity)

**Epic:** Features **Release:** v0.20.0 **Owner model:** grok-4.7-high
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
A pure model for cabinet runs that live on a wall: `Level.runs` holds `BuiltinRun`s of kind
kitchen, wardrobe or vanity, each a list of modules whose widths snap to 15 cm and fill the run.
`layoutRun()` turns a run into world rectangles the plan, the 3D builder and the inspector can
all use. Nothing is drawn yet (f06). The existing `kitchen-run` catalog item keeps working.

## Context the implementer needs
- `src/model/kitchen.ts`: today's module list `KITCHEN_MODULES` (l.3–13), `KitchenModule {type, width}`
  (l.19), `parseModules` clamps widths to `0.15..2.4` (l.74), `writeKitchen` sets the item
  width to the module sum (l.106). Keep this file untouched; the new model supersedes it for runs.
- `src/model/types.ts`: `Level` (l.207–229), `MaterialRef` (l.18), `Vec2`, `Id`, `PROJECT_VERSION = 1` (l.13).
  `Wall { id, a, b, thickness }` (l.29). `src/model/walls.ts`: `wallLength` (l.34),
  `wallFrame`/`sampleFrame` (l.57, l.91) give the point and normal at a distance along the wall,
  `pointAlongWall` (l.357).
- `src/model/defaults.ts:88` `createLevel` (add `runs: []`). `src/io/migrate.ts` (37 lines):
  version 1 needs no transform; add a step.
- Tests style: `tests/model/kitchen.test.ts`.

## Steps
1. Tests first: `tests/model/builtins.test.ts`.
2. `src/model/types.ts`, after `Item`:
   ```ts
   export type RunKind = 'kitchen' | 'wardrobe' | 'vanity'
   export type RunModuleType =
     | 'base-door' | 'base-drawers' | 'sink' | 'hob' | 'oven-tower' | 'fridge-tall' | 'corner' | 'dishwasher'   // kitchen
     | 'hinged-2' | 'sliding' | 'open-shelves' | 'drawers'                                                      // wardrobe
     | 'basin-60' | 'basin-90' | 'vanity-drawers'                                                               // vanity
   export interface RunModule { id: Id; type: RunModuleType; width: number }
   export interface BuiltinRun {
     id: Id
     kind: RunKind
     wallId: Id
     /** Distances from wall.a along the wall, metres; start < end. */
     start: number
     end: number
     /** Which side of the wall the cabinets stand on: left of a→b or right. */
     side: 'left' | 'right'
     modules: RunModule[]
     worktop?: MaterialRef
     front: MaterialRef
     /** Plinth height in metres (0 = none). */
     plinth: number
     handle: 'bar' | 'knob' | 'groove'
   }
   ```
   `Level` gains `runs?: BuiltinRun[]` (optional: older files and test literals stay valid).
   `PROJECT_VERSION = 2`.
3. `src/io/migrate.ts`: after the range checks, `if (version < 2) for each level: if (!Array.isArray(level.runs)) level.runs = []`;
   set `record.version = PROJECT_VERSION` at the end. Update the doc comment. `createLevel`
   adds `runs: []`.
4. New `src/model/builtins.ts` (pure):
   ```ts
   export const RUN_GRID = 0.15
   export const RUN_DEPTH: Record<RunKind, number> = { kitchen: 0.6, wardrobe: 0.6, vanity: 0.5 }
   export const RUN_HEIGHT: Record<RunKind, number> = { kitchen: 0.9, wardrobe: 2.2, vanity: 0.85 }
   export const RUN_MODULES: Record<RunKind, readonly RunModuleType[]>   // the three lists above
   export interface ModuleSpec { fixed?: number; min: number; max: number; flex: boolean }
   export const MODULE_SPECS: Record<RunModuleType, ModuleSpec>
   ```
   Specs: `base-door` min 0.3 max 1.2 flex; `base-drawers` 0.45–1.2 flex; `sink` fixed 0.6 (or 0.9
   when the caller sets `width >= 0.9`: min 0.6 max 0.9, not flex); `hob` fixed 0.6; `oven-tower`
   fixed 0.6; `fridge-tall` fixed 0.6; `corner` fixed 0.9; `dishwasher` fixed 0.6; `hinged-2`
   0.6–1.2 flex; `sliding` 1.2–3.0 flex; `open-shelves` 0.3–0.9 flex; `drawers` 0.45–1.0 flex;
   `basin-60` fixed 0.6; `basin-90` fixed 0.9; `vanity-drawers` 0.3–0.9 flex.
   Functions:
   - `snapWidth(w)` = `Math.round(w / RUN_GRID) * RUN_GRID`, then clamped to the spec.
   - `defaultModules(kind, length)`: kitchen `[base-door, sink, base-drawers, hob, oven-tower]`
     (fixed first, fill the rest), wardrobe `[hinged-2, hinged-2]`, vanity `[basin-60, vanity-drawers]`,
     then `fitModules`.
   - `fitModules(modules, length): { modules: RunModule[]; overflow: RunModule[]; filler: number }`:
     sum fixed widths; distribute `length - fixed` over flex modules proportionally to their
     current width, snap each to the grid within `[min, max]`; the remainder that cannot be
     absorbed becomes `filler` (0..RUN_GRID, a blank panel at the end). When even the fixed
     modules exceed `length`, pop modules from the end into `overflow` until they fit.
   - `runLength(run, wall)` = `end - start`, with `end` clamped to `wallLength(wall)`.
   - `layoutRun(run, wall): { rects: { module: RunModule; corners: Vec2[]; centre: Vec2; along: number; width: number }[]; filler: number; depth: number; height: number; rotation: number }`:
     corners in plan for each module box of `width × RUN_DEPTH[kind]`, standing against the wall
     face (`wall.thickness / 2` from the centre line) on `run.side` (use `sampleFrame(wallFrame(wall), along)`
     for the point and normal; left of a→b is `perp(dir)`); `rotation` = angle of the run so
     that the module front (+Z in the builder's local frame) faces away from the wall, consistent
     with `src/catalog/entries/kitchen.ts` (front at `+z`). A `corner` module is a square
     `0.9 × 0.9` whose back touches the wall.
   - `addModule(run, type, index?)`, `removeModule(run, id)`, `moveModule(run, id, delta)`,
     `setModuleWidth(run, id, width)` — each returns a new `modules` array passed through `fitModules`.
   - `runsOnWall(level, wallId)`, `runAt(level, point, wall)` (point inside any rect).
5. `src/model/ops/index.ts`: `deleteEntities` drops runs whose id is deleted and runs whose
   `wallId` is deleted; `splitWall` callers: in `src/model/walls.ts` `splitWall`, move runs
   like openings (a run whose `start >= loc.distance` moves to `spawned` with offsets shifted;
   a run straddling the split is clamped to the half holding its centre).

## Tests to add
`tests/model/builtins.test.ts`
- "fills a 3 m kitchen run exactly": `defaultModules('kitchen', 3)` → widths sum to `3`
  (±1e-6), every width is a multiple of 0.15 (±1e-6), `filler === 0`, `overflow` empty.
- "snaps widths to 15 cm": `snapWidth(0.52, 'base-door')` → `0.45`; `snapWidth(0.2, 'base-door')` → `0.3`.
- "reports overflow when fixed modules do not fit": kitchen `[sink, hob, oven-tower, fridge-tall]`
  on `1.5` m → `overflow.length === 2` (the last two), remaining sum `1.2`, `filler === 0.3`.
- "a corner module is 0.9 square against the wall": run on wall `(0,0)-(4,0)` thickness 0.2,
  `side: 'left'`, modules `[corner]` → first rect corners include `{x: 0, y: 0.1}` and
  `{x: 0.9, y: 1.0}` (±1e-6).
- "rects stand on the chosen side and face away from the wall": `side: 'right'` → every corner
  has `y <= -0.1`; `rotation` makes the local +Z point to `-y`.
- "layout clamps the run to the wall length": `end: 10` on a 4 m wall → total width ≤ 4.
- "migrate adds runs to a version-1 file and bumps the version".
- "splitWall moves a run to the half under it" (run `start 2.5, end 3.5` on a 6 m wall split at 2).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/io` green, including the
  pre-existing `tests/model/kitchen.test.ts`, `walls.test.ts`, `ops.test.ts`, `tests/io/*`.
- A version-1 sample file (`createSampleProject()` serialised with `version: 1`) loads through
  `migrate` with `levels[i].runs` equal to `[]`.

## Out of scope / forbidden
- No tool, plan drawing, inspector or 3D (f06). No change to `src/catalog/entries/kitchen.ts`.
- Do not edit existing tests or user-facing strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
