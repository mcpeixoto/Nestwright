# f10 — Roof builder: valleys, gable infill, plan overlay

**Epic:** Features **Release:** v0.21.0 **Owner model:** claude
**Depends on:** f09
**Time box:** ≤ 20 min of agent work

## Goal
The 3D roof already has slope-aligned metric tile UVs, ridge and hip caps, verge strips, fascia,
half-round gutters and downpipes (`src/builders/roofs.ts`). What is wrong today: a *valley* edge
(the concave joint of an L-shaped hip or a cross-gable) gets the same raised ridge cap as a hip,
which reads as a bump in a gutter; gable infill is hard-coded `plaster-white` instead of the
house's wall finish; the plan overlay draws hips and ridges with one stroke and no eave line;
and the inspector cannot pick the new `cross-gable` shape with a readable label. This brief
fixes those four things.

## Context the implementer needs
- `src/builders/roofs.ts`: `buildRoof` (l.16–57: faces via `faceMesh`, `gableMat = getMaterial({id:'plaster-white'})`
  at l.24, trim via `roofTrim` for non-flat non-dome shapes), `roofTrim` (l.77–135: builds an
  edge map keyed by `key2`, calls `ridgeCap` for every edge shared by two slopes, `vergeStrip`
  for lone sloped edges, collects `eaves`), `ridgeCap` (l.147), `vergeStrip` (l.182),
  `eaveTrim` (l.207–291: fascia profile, gutter profile, downpipes), `metricUv` (l.466),
  `planeBasis` (l.536), `GUTTER`/`FASCIA` material refs (l.51–52), `Sheet`/`sweep`/`prism`/`mitre`
  from `src/builders/trim.ts`.
- f09: `roofEdges(model)` → `{kind: 'ridge'|'hip'|'valley'|'eave'|'verge', a, b, faces}`,
  `roofFaceSlope`, `roofSurfaceArea` (in `src/model/roofs.ts`).
- Wall materials: `Wall.left`/`right: MaterialRef` (`src/model/types.ts:38–40`); the outer face of
  an exterior wall is the side not facing a room — `src/builders/walls.ts` resolves this
  (search `rooms` usage in `buildWall` for the per-side test) and `bucket.weathered`. For the
  gable, "dominant exterior material" = the most frequent `MaterialRef.id` among the exterior
  sides of the level's walls; fall back to `plaster-white`.
- Plan overlay: `src/plan2d/layers/structure.ts:92–104` loops `level.roofs`, builds the model and
  strokes `model.ridges`. `strokeLine(ctx2d, ctx, a, b)` helper in the same file.
- Inspector: `src/ui/inspector/sections/structure.tsx:114–230` `RoofSection`; `ROOF_SHAPES` at l.14.
- Tests: `tests/builders/roofWinding.test.ts` (builds `buildRoof(roof(shape), createLevel(...))`
  and inspects meshes), `tests/builders/trim.test.ts`.

## Steps
1. Tests first: `tests/builders/roofValley.test.ts`, `tests/plan2d/roofOverlay.test.ts`.
2. `src/builders/roofs.ts` `roofTrim`: replace the hand-built edge map with `roofEdges(model)`.
   - `ridge` and `hip` → `ridgeCap` (unchanged geometry).
   - `valley` → new `valleyFlashing(metal, a, b, A, B, thickness)`: a V-shaped metal strip
     `0.3 m` wide across the joint (0.15 into each face along the face's in-plane direction
     perpendicular to the edge, `inward()` at l.140), lying `2 mm` *below* the tile top surface
     (i.e. recessed by `thickness + 0.002` relative to the face plane so the tiles do not z-fight),
     material `GUTTER` (`steel-brushed`). Tag `userData.trim = 'valley'`.
   - `eave` → the existing `Eave` list; `verge` → `vergeStrip`.
   Keep the `mesh.userData.trim` names `ridge | fascia | gutter` and add `valley` to the sheet
   list in `buildRoof` (it can share the `metal` sheet; then the name stays `gutter` — instead
   create a fourth `Sheet valley` so the test can find it by name).
3. `src/builders/roofs.ts` `buildRoof`: `gableMat = getMaterial(exteriorWallMaterial(level))`
   where `exteriorWallMaterial(level: Level): MaterialRef` is a new pure helper in
   `src/model/roofs.ts` (uses `detectRooms` to decide the exterior side per wall: the side whose
   offset point `sampleFrame(...).point ± normal · (thickness/2 + 0.05)` is in no room; count ids;
   most frequent wins; ties → first in wall order; no walls → `plaster-white`).
4. `src/plan2d/layers/structure.ts`: draw with `roofEdges(model)`: ridges solid 1.5 px, hips
   and valleys dashed `[6, 4]` 1 px, eaves solid 0.75 px in the muted colour `#7A7065`
   (selected roof: accent `#C8643B` for all). Keep verges undrawn. Cache per roof object
   reference (`WeakMap<Roof, RoofEdge[]>`) so the plan does not rebuild the skeleton every frame.
5. `src/ui/inspector/sections/structure.tsx`: `ROOF_SHAPES` includes `'cross-gable'` (f09 added
   the type and the i18n keys; add it to this list if f09 did not). Below the shape select show a
   readout `tr('Roof area {area}', { area: formatArea(roofSurfaceArea(buildRoofModel(roof)), units) })`
   — new string `'Roof area {area}'`/`'Área do telhado {area}'` (en/pt; `formatArea` from
   `src/model/units.ts`).

## Tests to add
`tests/builders/roofValley.test.ts`
- "an L-shaped hip roof gets one valley flashing and no cap on the valley": roof `hip` on the L
  outline from f09's tests, `overhang 0` → the group has exactly one mesh with
  `userData.trim === 'valley'`; its `Box3` centre is within 0.3 m (plan) of the reflex corner
  `(4, 6)`; its highest vertex `y` is below the tile surface at the valley midpoint
  (`y0 + roofHeightAt(model, mid) - 0.001`).
- "a hip rectangle has caps and no valley": `hip` 8×6 → no `'valley'` mesh, one `'ridge'` sheet mesh.
- "gable infill uses the exterior wall material": level whose walls have `left: {id:'brick-red'}`
  (check the id exists in `src/materials/library.ts`; else use `render-stucco`) on the exterior
  side → a `gable` face mesh's material equals `getMaterial({id: thatId})` (same object: the cache
  returns the same instance for the same ref).
- "exteriorWallMaterial picks the most frequent outside finish": square room, three walls
  `right: render-stucco` outside and one `right: brick-red` → `render-stucco`.
- "UVs run up the slope": for a `shed` 8×6 roof at 30°, take the tile face mesh, read `uv` and
  `position`; the vertex with the greatest `y` has the greatest `v` (±1e-6) among the face's
  vertices, and two vertices at equal `y` have equal `v`.

`tests/plan2d/roofOverlay.test.ts`
- the structure layer's `draw` with a stub `ctx2d` (`vi.fn()` methods, record `setLineDash`
  calls) on a level with a hip-L roof calls `setLineDash([6, 4])` at least once and
  `setLineDash([])` for ridges; with a flat roof it draws only eaves.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/builders tests/plan2d tests/model tests/i18n` green,
  including the pre-existing `tests/builders/roofWinding.test.ts`, `trim.test.ts`, `uvs.test.ts`, `uvScale.test.ts`.
- `npm run build` green.
- Manual, described: family template, select the roof, switch to `Cross-gable`: valleys show a
  flat metal strip, gables match the render colour, the plan shows dashed hips and solid ridges,
  and the inspector reads the roof area.

## Out of scope / forbidden
- No change to the tile UV mapping or gutter profile. No budget line for roof area.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
