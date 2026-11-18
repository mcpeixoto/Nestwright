# b03 — Wall-edit hitch: per-wall diffing

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Dragging one wall on a 20-wall level rebuilds only that wall, its joint neighbours, its openings
and the floors, instead of every wall, opening and floor on the level. A single wall drag costs
< 16 ms of rebuild on the perf report, down from the > 50 ms hitch the owner sees.

## Context the implementer needs
- `src/view3d/SceneController.ts:470–513` `reconcile()`: the `same` check compares
  `bucket.walls === level.walls` etc. by reference; when anything differs it
  `disposeTree(bucket.structural)`, clears it, and rebuilds every wall (`buildWall(wall, level,
  level.walls, {rooms, trim, above, ground})`), every opening (`buildOpening`) and the floors
  (`buildFloors`). `Bucket` is defined earlier in the same file (`emptyBucket()`); `syncItems`
  (l.515) already does per-item diffing with `bucket.itemMap` — copy that pattern.
- `buildWall` (`src/builders/walls.ts`) mitres against `others` (`wallPolygon`, `mitrePoint` in
  `src/model/walls.ts:189,218`), so a wall's mesh depends on the walls sharing its endpoints.
  It also reads `rooms` (interior trim, `interiorTrim`) and `ctx.above`.
- `src/view3d/layers/structure.ts:35–71`: `rebuild(group, level)` rebuilds stairs, columns,
  slabs and roofs for the level whenever `builtFrom.get(level.id) !== level`.
- immer keeps the reference of untouched array elements, so `prevWall === nextWall` means
  "unchanged" for a wall object; a wall touched in the recipe gets a new object.
- `window.__nestwright.perf.report(frames?, options?)` (`src/view3d/perfMonitor.ts:236`,
  type at `src/platform/global.d.ts:86`) resolves with a `PerfReport`. `setPerfExtra(name, read)`
  (l.113) adds a diagnostic to every report.
- `JOIN_EPS` from `src/model/walls.ts:21`.

## Steps
1. Test first: `tests/view3d/wallDiff.test.ts` (see below).
2. New pure module `src/view3d/wallDiff.ts` (no three):
   ```ts
   export interface WallDiff { rebuild: string[]; remove: string[]; floors: boolean }
   export function diffWalls(prev: readonly Wall[] | undefined, next: readonly Wall[],
     prevOpenings: readonly Opening[] | undefined, nextOpenings: readonly Opening[]): WallDiff
   ```
   - `prev === undefined` → rebuild every wall, `floors: true`.
   - changed = walls whose object reference differs from the prev wall with the same id, plus
     added walls; removed = ids no longer present.
   - A wall whose openings changed (any opening with `wallId === wall.id` differs by reference,
     was added, or was removed) is also changed.
   - neighbours: any wall sharing an endpoint (within `JOIN_EPS`) with a changed or removed wall,
     in either the prev or the next geometry, is added to `rebuild`.
   - `floors` is true when any wall was added, removed or had its `a`, `b`, `bulge` or
     `thickness` change (compare values, not references; a material-only change leaves floors alone).
   - Result arrays are sorted and unique.
3. `src/view3d/SceneController.ts`: extend `Bucket` with `wallObjects: Map<string, THREE.Object3D[]>`
   (the wall group plus its opening groups) and `floorObject: THREE.Object3D | null`. In
   `reconcile()`, when the only differences are `walls`/`openings` (everything else in the
   `same` check equal), call `diffWalls` and:
   - for each id in `remove ∪ rebuild`: remove and `disposeTree` its objects, delete the map entry;
   - for each id in `rebuild`: `buildWall(...)` + its `buildOpening(...)`s, add to `structural`
     and to the map;
   - when `diff.floors`: dispose and rebuild the floors object only.
   When anything else differs (rooms, elevation, height, trim, above, ground, belowStairs,
   roofs) keep the full rebuild, but populate the map from it so the next drag can diff.
   `rooms` passed to `buildWall` must be `roomsFor(level)` of the new level even for the
   per-wall path (room polygons move with the wall).
4. `src/view3d/layers/structure.ts`: replace `rebuild(group, level)` with per-entity maps
   `Map<id, {source: object, object: Object3D}>` for stairs, columns, slabs and roofs; rebuild
   only entries whose source reference changed, remove missing ids. Roofs also depend on
   `level.walls`/`level.height`/`level.elevation` (eave height, `outerOutline`) — rebuild every
   roof when `level.walls` reference, `height` or `elevation` changed.
5. Instrumentation: in `reconcile()`, time the structural rebuild with `performance.now()` and
   expose it via `setPerfExtra('structuralRebuildMs', () => lastRebuildMs)` and the number of
   walls rebuilt (`structuralWallsRebuilt`).
6. Measure: build (`npm run build`), serve with `npx vite preview --port 4173`, open the
   `family` template through `window.__nestwright.loadTemplate('family')` in a Playwright
   script or the browser console, drag one wall through the store
   (`apply('Move wall', d => moveWall(d.levels[0], id, {x: 0.1, y: 0}))`) and read
   `(await window.__nestwright.perf.report()).extras.structuralRebuildMs` before and after the
   change. Quote both numbers in the summary.

## Tests to add
`tests/view3d/wallDiff.test.ts` (pure, imports only `src/view3d/wallDiff.ts`, `src/model/defaults.ts`)
- "rebuilds everything on first sync": `prev === undefined`, 4 walls → `rebuild.length === 4`, `floors === true`.
- "rebuilds only the moved wall and its two joint neighbours": square of 4 walls; next array
  = same objects except wall 0 replaced by `{...wall0, b: {x: 4, y: 0.1}}` → `rebuild` is
  `[w0, w1, w3]` sorted, `remove` empty, `floors === true`.
- "a material change rebuilds the wall but not the floors or neighbours": wall 0 replaced
  with a new `left` material (same `a`, `b`, `bulge`, `thickness`) → `rebuild === [w0]`,
  `floors === false`. (Neighbours join only on geometry: `diffWalls` adds them only when a
  changed wall's `a`, `b`, `bulge` or `thickness` differs from before.)
- "an opening change rebuilds only its wall": openings array with one door on w2 replaced by
  `{...door, offset: 2}` → `rebuild === [w2]`, `floors === false`.
- "a removed wall rebuilds its former neighbours": next without w2 → `remove === [w2]`,
  `rebuild === [w1, w3]`, `floors === true`.
- "identical arrays produce an empty diff".

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d tests/builders` green.
- `tests/e2e/smoke.spec.ts` still passes (`npx playwright test tests/e2e/smoke.spec.ts --project webgpu`).
- Perf: `structuralRebuildMs` for one wall move on the `family` template < 16 ms; quote the
  before/after values. Full rebuild path unchanged for level-level changes.

## Out of scope / forbidden
- No change to `src/builders/*` geometry, no change to `src/model/*`.
- Do not edit existing tests or user-facing strings.
- Do not start a dev server except the preview used for the measurement. Do not commit, push
  or merge. No new dependencies.
