# f09 — Roof types model: cross-gable and edge classification

**Epic:** Features **Release:** v0.21.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
The roof model already knows `flat | shed | gable | hip | mansard | dome` with `pitch`,
`overhang` and `ridgeAngle` (`Roof` in `src/model/types.ts:130–145`), so no `kind` field is
added: `shed` is the mono-pitch roof. What is missing: a gable roof on an L- or T-shaped house
(today `gableRoof` runs one ridge through the whole footprint and slopes the wing wrongly), and a
classification of roof edges (ridge / hip / valley / eave / verge) that the 3D builder (f10) and
the plan overlay need to put a cap on a hip and a flashing in a valley. This brief adds
`shape: 'cross-gable'`, `roofEdges()`, `roofFaceSlope()` and `roofSurfaceArea()`.

## Context the implementer needs
- `src/model/roofs.ts`: `RoofVertex {x,y,h}`, `RoofFace {ring, kind: 'slope'|'gable'|'dome'}`,
  `RoofModel {footprint, faces, ridges, usedBoundingRect, cutouts}` (l.18–41);
  `buildRoofModel` switch (l.59–89); `gableRoof` (l.142) uses `orientedFrame` + `lineHits` +
  `splitRing`; `hipRoof` (l.185) uses `skeletonFaces` (l.277) over `straightSkeleton` from
  `src/model/skeleton.ts:45` (convex: edge events; orthogonal: edge + split events; returns
  `SkelFace[]` with `ring: SkelVertex[] {x, y, time}`; null when faces do not cover the polygon);
  `ridgeLines` (l.286) collects every non-eave edge once (hips and ridges mixed); `edgeKey` (l.308).
- `src/model/polygon.ts`: `isConvex`, `isOrthogonal`, `orientedBoundingRect`, `cleanRing`, `offsetPolygon`.
- `src/model/geometry.ts`: `polygonArea`, `dot`, `sub`, `normalize`, `perp`, `cross`.
- Tests: `tests/model/roofs.test.ts` (rectangle 8×6, orthogonal L cases at l.99–130).
- Inspector list `ROOF_SHAPES` (`src/ui/inspector/sections/structure.tsx:14`) and the shape
  labels in `src/i18n/en.ts`/`pt.ts` (`labelOf(shape)` title-cases the id; find the existing
  `Gable`/`Hip` keys and add `'Cross-gable'`/`'Duas águas cruzadas'`).

## Steps
1. Tests first: `tests/model/roofGeometry.test.ts`.
2. `src/model/types.ts`: `RoofShape` gains `'cross-gable'`. No new field, so no migration and
   no `PROJECT_VERSION` bump (old files never contain the value). Add the inspector option and
   the two i18n keys.
3. New `src/model/roofGeometry.ts` (pure), re-exported from `roofs.ts` where convenient:
   ```ts
   export type RoofEdgeKind = 'ridge' | 'hip' | 'valley' | 'eave' | 'verge'
   export interface RoofEdge { kind: RoofEdgeKind; a: RoofVertex; b: RoofVertex; faces: number[] }
   export function roofEdges(model: RoofModel): RoofEdge[]
   export function roofFaceSlope(face: RoofFace): number          // radians, 0 for flat
   export function roofFaceArea(face: RoofFace): number           // true (sloped) area, m²
   export function roofSurfaceArea(model: RoofModel): number      // sum over 'slope' faces
   export function crossGableRoof(footprint: Vec2[], pitch: number, ridgeAngle: number): RoofModel
   ```
   `roofEdges`: key every face edge by rounded endpoints (`edgeKey` logic, 1 mm). An edge shared
   by two `slope` faces: `ridge` if both endpoints have `|h_a - h_b| < 1e-4` and `h > 1e-3`;
   otherwise `hip` when the two faces' outward plan normals point away from each other
   (convex: `dot(n_i, n_j) <= 0` where `n` is the horizontal component of each face normal
   taken through the edge midpoint) and `valley` when they point toward each other. An edge of
   one face only: `eave` when both `h < 1e-3`, else `verge`. Edges of `gable` faces are ignored
   (they are vertical infill), so the verge is the slope face's sloped boundary edge.
   `roofFaceSlope` = `acos(|n_y|)` from the face normal; `roofFaceArea` = plan area / `cos(slope)`.
4. `crossGableRoof` (the straight-skeleton-with-gable-ends algorithm):
   1. `skel = straightSkeleton(footprint)`; if null, fall back to `gableRoof` (single ridge).
   2. For every footprint edge `e_k` whose direction is within 5° of *perpendicular* to the
      ridge axis `(cos ridgeAngle, sin ridgeAngle)`, the skeleton face `F_k` grown from `e_k` is
      an *end face* and becomes a vertical gable: remove `F_k`; the two faces adjacent to `F_k`
      (grown from `e_{k-1}` and `e_{k+1}`) have, in `F_k`'s ring, the interior skeleton vertices
      `v_1 … v_m` (time > 0) that they share with `F_k`; move each such vertex of the adjacent
      faces to its projection onto the line of `e_k` **keeping its time** (height), i.e. slide
      it along the ridge direction until it lies on `e_k`'s line. Because the two adjacent faces
      are planar roofs of equal pitch meeting at the ridge, sliding the ridge end parallel to
      the ridge keeps both planes; the gable infill is the triangle/polygon `e_k.a, e_k.b, slid
      vertices` with `kind: 'gable'`. For a rectangle this reproduces `gableRoof` exactly
      (ridge from end to end, two gables). For an L with `ridgeAngle = 0` the two edges
      perpendicular to x become gables and the wing (whose end edge is parallel to the ridge)
      stays hipped, which is the standard cross-gable look; with `ridgeAngle = π/2` the wing
      gets the gable.
   3. heights `h = time · tan(pitch)` as in `hipRoof`; `ridges` from the new `roofEdges`
      filtered to `ridge | hip | valley`; `usedBoundingRect = false`.
   4. Faces with fewer than 3 distinct vertices after sliding are dropped.
   `buildRoofModel` gets `case 'cross-gable'`. `RoofModel.ridges` for every shape is now
   produced by `roofEdges` (`ridge | hip | valley` only) so the plan overlay stops drawing verges.
5. `src/model/roofs.ts` `heightInFace`/`roofHeightAt` need no change. Export `roofEdges`,
   `roofFaceSlope`, `roofSurfaceArea` from `roofs.ts` for f10.

## Tests to add
`tests/model/roofGeometry.test.ts` (rectangle `R` = 8 × 6, pitch 30°, overhang 0; L = `R`
plus a 4 × 4 wing: `(0,0)-(8,0)-(8,6)-(4,6)-(4,10)-(0,10)`)
- "classifies a gable rectangle": `roofEdges(gable R)`: 1 ridge, 2 eaves, 4 verges, 0 hips, 0 valleys.
- "classifies a hip rectangle": 1 ridge, 4 hips, 4 eaves, 0 verges, 0 valleys; ridge length
  `8 - 6 = 2` (±1e-3).
- "classifies a hip L": hips 5, valleys 1, eaves 6, ridges ≥ 2 and every ridge horizontal
  (`|h_a - h_b| < 1e-6`); valley endpoints include the reflex corner `(4, 6)` at `h = 0`.
- "slopes and areas": every slope face of hip R has `roofFaceSlope ≈ π/6`; `roofSurfaceArea(hip R)
  ≈ 48 / cos(π/6)`; flat R → slope 0 and area 48; shed R at 30° → area `48 / cos(π/6)`.
- "cross-gable on a rectangle equals the single-ridge gable": same face count (2 slope + 2 gable),
  same ridge endpoints (±1e-3), same `roofHeightAt` at `(4, 3)`, `(1, 1)`, `(7, 5)` (±1e-6).
- "cross-gable on the L gables the x-ends and hips the wing": `ridgeAngle 0` → gable faces 2,
  both with a vertex at `x = 0` or `x = 8`; hips ≥ 2 on the wing; exactly 1 valley; the ridge
  over the main block reaches `x = 0` and `x = 8`; `roofHeightAt(model, {x: 2, y: 8})` is finite.
- "cross-gable with ridgeAngle π/2 gables the wing end `y = 10`".
- "falls back to a single ridge when the skeleton fails": a non-orthogonal concave outline
  returns `faces.length >= 1` and `usedBoundingRect === false`, no throw.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/builders tests/i18n` green,
  including the pre-existing `tests/model/roofs.test.ts` and `tests/builders/roofWinding.test.ts`
  (the roof builder consumes `faces`, which keep their shape for existing roofs).
- `npm run build` green.

## Out of scope / forbidden
- No builder or plan changes beyond what `ridges` already feeds (f10).
- Do not edit existing tests or user-facing strings (the `Cross-gable` key is new).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
