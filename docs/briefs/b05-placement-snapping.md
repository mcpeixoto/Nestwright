# b05 — Placement snapping

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** grok-4.7-medium
**Depends on:** c01 (optional: the `surface` field; this brief works without it)
**Time box:** ≤ 20 min of agent work

## Goal
Dragging furniture near a wall snaps at 12 cm and lets go only at 20 cm, so the item no longer
flickers on and off the wall at the threshold. A snapped item faces away from its wall. A lamp
dropped on a table lands on the table top. The placement ghost turns red when the item would
overlap a wall or another item. Every placement is exactly one undo step. Bugs `P-DRAG-WALL`,
`P-LAMP-TABLE`, `P-SOFA-WALL` from `docs/BUGS.md` close.

## Context the implementer needs
- `src/model/furnitureSnap.ts`: `WALL_SNAP_DISTANCE = 0.15` (l.4), `WALL_SNAP_ANGLE` (l.6),
  `snapItemPose(level, pose, opts)` (l.93) → `SnapResult { position, rotation, guides, wallId, neighbourId }`.
- `src/tools/select.ts:229–268`: the item drag calls `snapItemPose` every move with
  `{ snap: !ctx.alt, ignore: ids, rotate: single }`, then `resolveItemPose`; the `Drag` union is
  at the top of the file (`drag = { kind: 'items', ids, origins, start }` at l.147).
- `src/tools/placeItem.ts`: `wallPose` (l.35, rotation `Math.atan2(-nx, ny)` already faces away
  from the wall), `elevationFor` (l.27), `poseAt` (l.52), `onPointerDown` applies `'Place item'`
  (l.94), `drawOverlay` fills the ghost with `rgba(63,184,175,0.35)` (l.127).
- `src/model/clearance.ts`: `itemFootprint` (l.25), `convexPenetration` (l.67), `wallPieces`
  (l.127), `solidItem` (l.109), `verticalOverlap` (l.102), `OVERLAP_EPS` (l.6).
- `src/store/index.ts:156` `apply(label, recipe)`: entries with the same label within
  `COALESCE_MS` merge into one undo step, so two quick placements undo together.
- Catalog: `getEntry(id)` (`src/catalog/registry.ts`), `CatalogEntry.tags`, `defaultSize`;
  c01 adds `surface?: number` (height of the usable top). Front is +Z; plan rotation is
  counter-clockwise.

## Steps
1. Tests first: `tests/model/snapHysteresis.test.ts`.
2. New `src/model/snapHysteresis.ts` (pure):
   ```ts
   export const SNAP_ENTER = 0.12
   export const SNAP_LEAVE = 0.2
   export interface SnapMemory { wallId: string | null }
   export function snapWithHysteresis(level, pose: SnapPose, opts: SnapOptions, memory: SnapMemory): SnapResult
   ```
   Logic: run `snapItemPose` with `opts.wallDistance = SNAP_ENTER` (add that optional field to
   `SnapOptions` in `furnitureSnap.ts`; default stays `WALL_SNAP_DISTANCE`). If the result did not
   snap to a wall (`wallId === null`) but `memory.wallId` is set, run again with
   `wallDistance = SNAP_LEAVE` restricted to that wall (add `opts.onlyWall?: string`); if that
   snaps, keep it. Update `memory.wallId` from the final result. `memory` is mutated in place.
3. `src/model/furnitureSnap.ts`: implement `wallDistance` and `onlyWall` in `snapItemPose`
   (filter `straightWalls(level)` by id when `onlyWall` is set; compare the back-edge distance
   against `opts.wallDistance ?? WALL_SNAP_DISTANCE`). Default behaviour unchanged.
4. `src/tools/select.ts`: the `items` drag gets `snap: SnapMemory` (`{ wallId: null }` at drag
   start); replace the `snapItemPose(...)` call with `snapWithHysteresis(level, pose, opts, drag.snap)`.
5. New `src/model/placementCheck.ts` (pure):
   `export function ghostOverlaps(level, pose: {position, rotation, size, elevation, catalogId}, ignore: readonly string[] = []): boolean`
   → true when `convexPenetration(itemFootprint(pose), piece.polygon) > OVERLAP_EPS` for any
   `wallPieces(level)` piece that reaches the pose's elevation (`wallReaches`), or for any other
   `solidItem` with `verticalOverlap`. Flat items (`isFlatItem`) never overlap.
   `export function dropElevation(level, point, entry: {defaultSize, mount?, mountHeight?, tags}, levelHeight): number`
   → if `entry.mount === 'ceiling'` → `levelHeight - h`; `'wall'` → `mountHeight ?? 1.45`;
   else find items whose footprint contains `point`, whose entry has a `surface` (c01) or whose
   `tags` include `'table'`, `'desk'`, `'counter'` or `'nightstand'`, and whose top
   (`elevation + size.h`) ≤ 1.2 m; return the highest top (`entry.surface` when defined, else
   `size.h`) + that item's `elevation`; else 0. Only entries whose own `defaultSize.h ≤ 0.9`
   and `w ≤ 0.8` are placed on surfaces (a wardrobe is never put on a table).
6. `src/tools/placeItem.ts`: `elevationFor` → `dropElevation(level, point, entry, level.height)`
   (pass the pointer point). `ghost` gains `bad: boolean` = `ghostOverlaps(level, {...pose,
   size: entry.defaultSize, elevation, catalogId})`; `drawOverlay` uses fill
   `rgba(200, 71, 59, 0.35)` and stroke `#C8473B` when `bad`. `onPointerDown` refuses to place
   when `bad` (set the status message key `'Not enough room here'`, new string in
   `src/i18n/en.ts` and `pt.ts`: `'Não há espaço aqui'`).
7. `src/store/index.ts`: `apply(label, recipe, opts?: { coalesce?: boolean })`; when
   `opts.coalesce === false` never merge with the previous entry. `placeItem.ts` passes
   `{ coalesce: false }`. Update the `StoreState.apply` type accordingly (optional third arg
   keeps every existing caller compiling).

## Tests to add
`tests/model/snapHysteresis.test.ts`
- "snaps at 11 cm and not at 13 cm from a wall face": sofa `{w: 2, d: 0.9}` rotation 0, back
  edge 0.11 from the inner face of wall `(0,0)-(6,0)` (thickness 0.2) → result `wallId` set and
  `position.y ≈ 0.1 + 0.45`; at 0.13 → `wallId === null`.
- "stays snapped until 20 cm once snapped": memory `{wallId}` after the 0.11 snap; pose at
  0.18 → still snapped; at 0.21 → `wallId === null` and memory cleared.
- "a snapped sofa faces away from the wall": rotation `0.1` rad near the bottom wall → result
  rotation `0` (front +y, into the room); near the top wall `(0,5)-(6,5)` → `π`.
- "ghostOverlaps is true inside a wall and false in free floor, and ignores rugs":
  pose centred at `(3, 0)` → true; `(3, 2.5)` → false; a `rug` catalogId at `(3, 0)` → false.
- "dropElevation lands a table lamp on a coffee table top": level with `coffee-table`
  `{w:1.2,d:0.6,h:0.45}` at `(3, 2.5)`; `dropElevation(level, {x:3,y:2.5}, tableLampEntry, 2.7)`
  → `0.45`; with the same point and a `wardrobe` entry → `0`.
- "`apply` with `coalesce: false` makes two undo steps": two `apply('Place item', …, {coalesce:false})`
  calls in a row → `past.length` grows by 2 (use `useStore` directly; `tests/model/history.test.ts`
  shows how).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/i18n` green, including the
  pre-existing `tests/model/furnitureSnap.test.ts`, `itemCollision.test.ts`, `history.test.ts`.
- `npm run test:bash -- placing` (b01): `P-SOFA-WALL`, `P-DRAG-WALL`, `P-LAMP-TABLE`,
  `P-COPY-PASTE` pass; remove their rows from `docs/BUGS.md`.

## Out of scope / forbidden
- Do not change `WALL_SNAP_DISTANCE` itself or item-to-item snapping distances.
- Do not edit existing tests or existing user-facing strings (the two new keys are allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
