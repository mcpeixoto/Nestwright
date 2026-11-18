# b02 — Wall joins and room detection

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** grok-4.7-high
**Depends on:** b01 (for the repro ids; the code does not depend on it)
**Time box:** ≤ 20 min of agent work

## Goal
A wall drawn to within 5 cm of an existing corner or wall face joins it instead of leaving a
sliver gap, a T-junction splits the touched wall, splitting a wall that holds a door keeps the
door on the half under it, and room detection no longer produces phantom rooms when two walls
overlap along the same line. Bugs `W-NEAR2`, `W-NEAR8`, `W-SPLIT-DOOR` from `docs/BUGS.md` close.

## Context the implementer needs
- `src/model/walls.ts:21` `JOIN_EPS = 0.001` is the *geometric* epsilon ("same point"). Keep it.
  `locateOnWall` (l.124), `splitWall` (l.318–355), `openingInterval` (l.265), `openingFits` (l.278).
- `src/model/ops/index.ts`: `mergePoint` (l.25, uses `JOIN_EPS` as the pull radius),
  `splitExistingAt`, `crossings`, `addWallChain` (l.119–150; already splits crossings and
  T-junctions found within `JOIN_EPS`), `moveWallEndpoint` (l.157).
- `src/model/rooms.ts`: `splitSegments` (l.64–112) marks crossings with `segmentIntersection`
  and endpoint touches within `JOIN_EPS`; `detectFaces` (l.158) walks the planar graph.
  Collinear overlapping segments are not detected by `segmentIntersection`, so both copies
  survive and the face walk sees a doubled edge.
- Existing tests to copy the style from: `tests/model/walls.test.ts` (uses `createLevel`,
  `createWall`, `createOpening` from `src/model/defaults.ts`), `tests/model/rooms.test.ts`
  (`loop()` helper), `tests/model/ops.test.ts`.

## Steps
1. `tests/model/wallJoin.test.ts` (write first, see Tests).
2. `tests/model/splitKeepsOpenings.test.ts` (write first).
3. `src/model/ops/index.ts`: add `export const MERGE_SNAP = 0.05` with the comment
   "Endpoints this close to a corner or a wall face are pulled onto it when drawing".
   `mergePoint(level, p, radius = MERGE_SNAP)`: corners first (nearest corner within
   `radius` wins), then the nearest wall face/centre-line point within `radius`
   (`locateOnWall(wall, p).distanceToWall <= radius`, and the projection strictly inside the
   wall, `distance > JOIN_EPS && distance < length - JOIN_EPS`). `addWallChain` calls it with
   the default; `moveWallEndpoint` and `splitExistingAt` keep using `JOIN_EPS` (they are not
   drawing). Only chain endpoints snap; interior crossings are still exact.
4. `src/model/ops/index.ts` `addWallChain`: after merging, when an endpoint landed on a wall
   face (not a corner), `splitExistingAt(level, point)` must split that wall there (it already
   does for exact hits; make sure the merged point, not the raw one, is passed — it is, keep it).
   Add the T-junction case where the *new* wall's interior passes within `MERGE_SNAP` of an
   existing wall's endpoint: the loop at l.136–143 uses `on.distance <= JOIN_EPS`; change that
   to `<= MERGE_SNAP` and move the existing endpoint onto the new wall (`q.x = point.x` etc.
   through `moveWallEndpoint`) before shattering.
5. `src/model/walls.ts` `splitWall`: openings decide by their *centre*: `offset > loc.distance`
   goes to `spawned` (already), else stays on `kept`. Then clamp so the opening fits its new
   wall: `half = width / 2`, `offset = min(max(offset, half), wallLength(target) - half)`.
   If `wallLength(target) < width + 2 * JOIN_EPS` the opening cannot fit: remove it from
   `level.openings` (return value unchanged). A split exactly at an opening centre
   (`|offset - loc.distance| <= JOIN_EPS`) keeps the opening on `kept`.
6. `src/model/rooms.ts` `splitSegments`: after building `out`, drop duplicates: two segments
   whose `{a, b}` match (either order) within `JOIN_EPS` keep only the first (its `wallId`).
   Also, for a pair of collinear overlapping segments (`cross(dir_i, dir_j) ≈ 0` and
   `closestPointOnSegment(sj.a, si.a, si.b).distance <= JOIN_EPS`), mark both endpoints of
   each onto the other (the existing endpoint loop already does this when the endpoint is
   within `JOIN_EPS` of the other segment; make sure it runs for both orders, which it does).
   The dedupe is what removes the doubled edge.
7. `src/model/ops/index.ts` `moveWallEndpoint`: when the moved joint lands within `JOIN_EPS`
   of another wall's interior, split that wall there (`splitWall`) so the T stays a graph node.

## Tests to add
`tests/model/wallJoin.test.ts`
- "pulls an endpoint 2 cm from a corner onto the corner": square 0..6 × 0..5; `addWallChain`
  from `(6.02, 2)` to `(9, 2)` → new wall `a` deep-equals `{x: 6, y: 2}`; `walls.length === 6`
  (right wall split at y=2 → 5 + 1 new).
- "pulls an endpoint 4.9 cm from a wall face onto the face and splits it": start `(3, 5.049)`
  to `(3, 8)` → `a.y === 5`, top wall split into two (`walls.length === 6`), `connectedWalls(level, {x:3,y:5}).length === 3`.
- "leaves a 6 cm miss alone": start `(3, 5.06)` → no split, `walls.length === 5`, `a.y === 5.06`.
- "splits the new wall at a T-junction when it passes within 5 cm of an existing end": square
  plus a stub `(2, 2)-(2, 3.03)`; draw `(0, 3)` to `(6, 3)` → stub `b` becomes `{x: 2, y: 3}`
  and the new wall is split into `(0,3)-(2,3)` and `(2,3)-(6,3)` (`walls.length === 8`).
- "detects one room, not two, when a wall is drawn twice along the same line": square plus a
  second wall `(0, 0)-(6, 0)` → `detectRooms(level).length === 1`, area ≈ 30.

`tests/model/splitKeepsOpenings.test.ts`
- door width 0.9 at offset 3 on `(0,0)-(6,0)`; split at `x = 2` → opening `wallId` is the
  spawned half, `offset ≈ 1`.
- split at `x = 4` → opening stays on `kept`, `offset === 3`.
- split at `x = 3.2` (inside the door span, centre at 3 < 3.2) → stays on `kept`, offset
  clamped to `3.2 - 0.45 = 2.75`.
- split at `x = 0.5` with a 0.9 door at offset 0.45 on `kept` → `kept` is 0.5 long, door
  cannot fit → `openings.length === 0`.
- `moveWallEndpoint` after a split keeps `openings.length` and each opening's world centre
  within 0.05 m of where it was (reuse `pointAlongWall`).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model` green, including the
  pre-existing `tests/model/walls.test.ts`, `rooms.test.ts`, `roomsSurvive.test.ts`, `ops.test.ts`.
- `npm run test:bash -- walls` (b01): `W-NEAR2`, `W-NEAR8`, `W-SPLIT-DOOR`, `W-T1` pass; remove
  their rows from `docs/BUGS.md`.

## Out of scope / forbidden
- Do not change `JOIN_EPS`. Do not touch `src/plan2d/snap.ts` (pointer snapping is separate).
- Do not edit existing tests or user-facing strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
