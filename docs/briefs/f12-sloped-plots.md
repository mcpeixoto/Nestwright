# f12 — Sloped plots

**Epic:** Features **Release:** v0.21.0 **Owner model:** grok-4.7-high
**Depends on:** none (f11 touches the same plan layer; run after it)
**Time box:** ≤ 20 min of agent work

## Goal
The Outside panel offers a slope preset (flat, gentle 5 %, hill 12 %) and a direction. Applying
one rewrites the heightfield as a plane, keeps a level platform under the house (cut on the uphill
side, fill on the downhill side, blended over a margin), and extends the wall plinth down to the
ground so the house never floats over or sinks into the slope. Garden generation keeps working on
a sloped plot.

## Context the implementer needs
- `src/model/terrain.ts`: `Terrain {width, depth, resolution, heights}` (`types.ts:254`),
  `gridToWorld`/`worldToGrid` (l.117–125), `sampleHeight` (l.143, bilinear), `level(terrain, h)`
  (l.256), `flattenUnderBuilding(terrain, outline, height, margin)` (l.449: smoothstep blend over
  `margin` outside the outline), `flattenUnderHouse(project, height = -0.02, margin = 1.15)`
  (l.485: every ground-floor room, or the wall bounds), `forEachSample` (private helper used by
  `flattenUnderBuilding`), `generateGarden` (l.1145: paints splat and scatters plants; heights are
  not touched, so paths and hedges already follow the terrain because the 3D terrain mesh reads
  `heights`).
- `src/ui/panels/OutsidePanel.tsx:221`: `apply('Flatten under house', (draft) => flattenUnderHouse(draft))`
  is the existing button; copy its row for the new controls. `Slider` component at l.35.
- Plinth: `src/builders/walls.ts:443` `exteriorPlinth(wall, level, frame, others, rooms)`: a fixed
  `0.35 m` tall skirt at `y = level.elevation` (l.454, l.464), built only for the ground bucket
  (`ctx.ground`, l.278). `buildWall` receives `level` and a `ctx` object; the terrain is not passed.
  `src/view3d/SceneController.ts` `reconcile()` (~l.470) calls `buildWall(wall, level, level.walls, { rooms, trim, above, ground })`
  and has `project` in scope.
- Tests: `tests/model/terrain.test.ts` (`terrain shaping` block at l.128–180 shows how a terrain
  is created with `createTerrain(width, depth, resolution)` from `src/model/defaults.ts:124`).

## Steps
1. Tests first: `tests/model/slope.test.ts`.
2. New `src/model/slope.ts` (pure):
   ```ts
   export type SlopePreset = 'flat' | 'gentle' | 'hill'
   export const SLOPE_GRADE: Record<SlopePreset, number> = { flat: 0, gentle: 0.05, hill: 0.12 }
   /** Height plane: 0 at the plot centre, rising toward `direction` (radians, plan angle). */
   export function applySlope(terrain: Terrain, preset: SlopePreset, direction: number): void
   export function slopeHeightAt(x: number, y: number, grade: number, direction: number): number   // grade * (x cos + y sin)
   /** Cut/fill platform: flatten the footprint to `floor`, blend over `margin`, and report volumes. */
   export function platformUnderHouse(project: Project, floor?: number, margin?: number): { cut: number; fill: number }
   export function groundUnderWall(terrain: Terrain, a: Vec2, b: Vec2, samples = 8): { min: number; max: number }
   ```
   - `applySlope` writes `heights[i] = slopeHeightAt(world.x, world.y, grade, direction)` for every
     sample (flat → all 0). It takes only the terrain and does not touch the house; the panel
     calls `applySlope` and then `platformUnderHouse` inside one recipe (step 4).
   - `platformUnderHouse` = `flattenUnderHouse(project, floor, margin)` but computes, before
     changing anything, `cut` (m³ removed where old height > floor inside the footprint) and
     `fill` (m³ added where old < floor), using the cell area `(width/res) · (depth/res)`.
     Default `floor = -0.02`, `margin = 1.15` (same as today).
   - `groundUnderWall` samples `sampleHeight` along the outer face of the wall and returns min/max.
3. `src/builders/walls.ts`: `exteriorPlinth` gets an extra parameter `ground?: { min: number; max: number }`.
   When given, the skirt bottom is `min(level.elevation - 0.35, ground.min - 0.05)` and the top
   stays at `level.elevation` (so the plinth reaches 5 cm below the lowest ground point under
   that wall; height = `elevation - bottom`, ≥ 0.35). `buildWall`'s `ctx` gains
   `terrain?: Terrain`; when present, pass `groundUnderWall(ctx.terrain, wall.a, wall.b)`.
   `src/view3d/SceneController.ts` passes `terrain: project.terrain.enabled ? project.terrain : undefined`
   in the ground bucket's ctx. Add `bucket.terrainHeights === project.terrain.heights` to the
   `same` check so a sculpt rebuilds the ground-floor walls (reference compare; sculpt strokes
   replace the array through immer).
4. `src/ui/panels/OutsidePanel.tsx`: a `Slope` row: `<select>` preset (`'Flat' | 'Gentle 5 %' | 'Hill 12 %'`),
   a direction `Slider` 0–359 ° (step 15, default 0 = rising toward +x; label `'Uphill direction'`),
   and an `Apply slope` button:
   `apply('Apply slope', (draft) => { applySlope(draft.terrain, preset, dirRad); const v = platformUnderHouse(draft); lastVolumes = v })`
   then `setMessage(tr('Platform: cut {cut} m³, fill {fill} m³', {cut: v.cut.toFixed(1), fill: v.fill.toFixed(1)}))`.
   Strings en + pt: `'Slope'`/`'Declive'`, `'Flat'`/`'Plano'`, `'Gentle 5 %'`/`'Suave 5 %'`,
   `'Hill 12 %'`/`'Colina 12 %'`, `'Uphill direction'`/`'Direcção da subida'`, `'Apply slope'`/`'Aplicar declive'`,
   `'Platform: cut {cut} m³, fill {fill} m³'`/`'Plataforma: escavação {cut} m³, aterro {fill} m³'`.
5. `src/model/terrain.ts` `generateGarden`: no height change, but the hedge and tree `scale`
   must not depend on height — nothing to do; add a guard so `paintPath` is skipped when a path
   endpoint is `null` (already). Verify with the test below that a garden on a `hill` plot has
   the same plant count as on a flat one.

## Tests to add
`tests/model/slope.test.ts` (terrain `createTerrain(40, 30, 40)`; house = `createProject` with a
6×5 ground-floor room via `addWallChain`)
- "gentle preset writes a 5 % plane rising toward +x": after `applySlope(t, 'gentle', 0)`,
  `sampleHeight(t, 10, 0) - sampleHeight(t, 0, 0) ≈ 0.5` (±1e-3), `sampleHeight(t, 0, 7)` ≈ `sampleHeight(t, 0, -7)`.
- "direction rotates the plane": `direction = π/2` → the rise is along +y, flat along x.
- "flat resets a sculpted terrain to 0": raise a bump first, then `applySlope(t, 'flat', 0)` → every height 0.
- "platformUnderHouse levels the footprint and reports cut on the uphill side":
  hill at `direction 0`, house centred at `x = 0`; after `platformUnderHouse(project)` every
  sample inside the room polygon is `-0.02` (±1e-6); `cut > 0` and `fill > 0`; `cut ≈ fill`
  (±15 %) for a house centred on the plot (symmetric plane); samples `3 m` beyond the margin keep
  the plane height (±1e-6).
- "groundUnderWall spans the slope under a wall": wall `(-3, 2.5)-(3, 2.5)` on the 12 % hill →
  `max - min ≈ 0.72` (±0.02) before the platform; ≈ 0 after.
- "a sloped garden grows the same plants as a flat one": `generateGarden(project, 7)` on flat
  and on `hill` → equal `terrain.plants.length` and equal species sequence.
- `tests/builders/plinthSlope.test.ts`: `buildWall` with `ctx.terrain` whose ground under the
  wall is `[-0.9, -0.3]` produces a `plinth` mesh whose `Box3.min.y ≈ -0.95` (±0.01) and
  `max.y ≈ level.elevation` (±0.01); without `terrain` the plinth is 0.35 tall (pre-existing
  `tests/builders/plinth.test.ts` must still pass).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/builders tests/i18n` green,
  including the pre-existing `tests/model/terrain.test.ts`, `gardenLayout.test.ts`,
  `tests/builders/plinth.test.ts`, `walls.test.ts`.
- `npm run build` green.
- Manual, described: family template → Outside → Hill 12 %, direction 90° → Apply slope: the
  house sits on a level bench, the plinth reaches the ground on the downhill side, the status bar
  reports cut and fill, one Undo restores the flat plot.

## Out of scope / forbidden
- Retaining walls, steps in the garden, terrace slabs following the slope, 2D contour styling.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
