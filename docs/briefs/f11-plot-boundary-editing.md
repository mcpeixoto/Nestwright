# f11 — Plot boundary editing

**Epic:** Features **Release:** v0.21.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
With the Plot tool the player can drag a corner (already works), double-click an edge to add a
corner, double-click a corner to remove it, read the plot area live while dragging, and see a
dashed setback line (3 m by default, adjustable) inside the boundary on the plan.

## Context the implementer needs
- `src/tools/plot-boundary.ts` (121 lines): `hitVertex` (l.14, 0.6 m radius), `boundaryPointer`
  (l.46: `down` starts a drag on a hit corner or adds a chain point; `move` applies
  `'Move plot corner'` per event; `up` clears), the `registerTool` block (l.81) shows the area in
  the status message only on `activate` (l.92–93). `src/tools/chain.ts` `createChain`.
- `ToolContext` (`src/tools/types.ts:12`) has no double-click flag: detect it in the tool with a
  timestamp + distance (`src/tools/wallChain.ts:5–8` uses `SAME_POINT = 0.04`, `DOUBLE_CLICK_DIST = 0.15`
  and a time window — copy the constants).
- Plan terrain layer: `src/plan2d/layers/outside.ts:75–130` (`id: 'terrain'`, draws contours and the
  boundary polygon; corners at l.122). Area readout while the tool is active: l.218–220 in the
  `outside` layer. `polygonArea` (`src/model/geometry.ts:53`), `offsetPolygon`
  (`src/model/polygon.ts`; `outerOutline` in `src/model/roofs.ts:55` calls
  `offsetPolygon(boundary, -thickness / 2)` to grow, so a **positive** distance shrinks),
  `closestPointOnSegment` (`geometry.ts:155`), `formatArea` (`src/model/units.ts`).
- Settings: `src/settings/index.ts` interface at l.14–48 and `DEFAULT_SETTINGS` at l.63;
  persisted to `localStorage`. `useSettings((s) => s.field)`.
- Inspector tool sections: `src/ui/inspector/sections/tool.tsx` (`id: 'tool'`, `order: 0`, matched by
  `state.tool`). `NumberField` in `src/ui/inspector/fields.tsx:18`. Strokes with undo grouping:
  `beginStroke`/`endStroke` (`src/store/index.ts:98–99`, used by `src/tools/terrain-sculpt.ts:22,32`).

## Steps
1. Tests first: `tests/model/plotEdit.test.ts`.
2. New `src/model/plotEdit.ts` (pure):
   ```ts
   export const MIN_PLOT_CORNERS = 3
   export function nearestEdge(boundary: readonly Vec2[], point: Vec2, tolerance: number): { index: number; point: Vec2 } | null
   export function insertCorner(boundary: readonly Vec2[], edgeIndex: number, point: Vec2): Vec2[]   // after edgeIndex
   export function removeCorner(boundary: readonly Vec2[], index: number): Vec2[]                   // no-op below MIN_PLOT_CORNERS
   export function setbackRing(boundary: readonly Vec2[], setback: number): Vec2[]                   // offsetPolygon(boundary, setback); [] when it collapses
   export function plotArea(boundary: readonly Vec2[]): number                                        // |polygonArea|
   export function cornerDragSnap(point: Vec2, boundary: readonly Vec2[], index: number, tolerance = 0.1): Vec2
   ```
   `cornerDragSnap` snaps the dragged corner to the x or y of either neighbour when within
   `tolerance` (keeps plots rectangular), unless Alt (caller passes `tolerance 0`).
3. `src/tools/plot-boundary.ts`:
   - `boundaryPointer('down')`: when not drawing, record `{time, point}`; a second `down` within
     `400 ms` and `DOUBLE_CLICK_DIST` of the first is a double-click: on a corner →
     `apply('Remove plot corner', d => d.terrain.boundary = removeCorner(...))` (refuse with the
     status message `'A plot needs at least 3 corners'` when at the minimum); on an edge
     (`nearestEdge(..., screenTol(zoom, 10))`) → `apply('Add plot corner', …)` and start
     dragging the new corner.
   - Drag: `beginStroke('Move plot corner')` on `down`, `endStroke()` on `up`, so one drag is one
     undo step; positions through `cornerDragSnap` (tolerance 0 when `ctx.alt`).
   - While dragging, `setMessage(fill(lang, 'Plot {area}', { area: formatArea(plotArea(...)) }))`
     on every move (the key exists at `en.ts:965`).
   - `onPointerDown` must pass `ctx.alt` and the zoom to `boundaryPointer` (extend its signature
     with an options object; `src/view3d/layers/outside.ts:140` calls it too — pass `{}` there).
4. `src/settings/index.ts`: `plotSetback: number` in the interface, `3` in `DEFAULT_SETTINGS`.
5. `src/plan2d/layers/outside.ts` `terrain` layer: after the boundary polygon, when
   `ctx.toolId === 'plot-boundary' || ctx.selection.length === 0` and `boundary.length >= 3`,
   stroke `setbackRing(boundary, useSettings.getState().plotSetback)` dashed `[8, 6]`, 1 px,
   colour `#6F8F72` (sage) at 0.8 alpha; label `tr('Setback {m}', {m: formatLength(setback)})`
   near the first vertex (new string `'Setback {m}'`/`'Afastamento {m}'`).
6. New inspector section `src/ui/inspector/sections/plotTool.tsx` (`id: 'plot-tool'`, `order: 5`,
   match `state.tool === 'plot-boundary'`): area readout (`'Plot {area}'`), corner count,
   `NumberField` `'Setback'` (0–20 m, step 0.5) bound to `useSettings.getState().set({plotSetback})`
   (read how other settings are written in `src/settings/index.ts`), and a hint line
   `'Double-click an edge to add a corner, a corner to remove it'` (new string). Register it in
   `src/ui/inspector/sections/index.ts`. Strings en + pt: `'Setback'`/`'Afastamento'`,
   `'Corners {n}'`/`'Cantos {n}'`, `'A plot needs at least 3 corners'`/`'Um lote precisa de pelo menos 3 cantos'`,
   `'Double-click an edge to add a corner, a corner to remove it'`/`'Duplo clique numa aresta adiciona um canto; num canto, remove-o'`.

## Tests to add
`tests/model/plotEdit.test.ts` (square `(-10,-10)…(10,10)`)
- `nearestEdge` at `(0, -9.8)` with tolerance 0.5 → index 0, point `(0, -10)`; at `(0, 0)` → null.
- `insertCorner(sq, 0, {x: 0, y: -10})` → 5 corners, index 1 is the new point, area unchanged (400).
- `removeCorner` on a 4-corner square → 3 corners; on a triangle → the same array (length 3).
- `setbackRing(sq, 3)` → 4 corners all with `|x| ≈ 7` and `|y| ≈ 7`; `setbackRing(sq, 11)` → `[]`.
- `plotArea(sq)` → 400; reversed winding → 400.
- `cornerDragSnap({x: 10.06, y: 3}, sq, 2)` → `x === 10`; with tolerance 0 → unchanged.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/settings tests/i18n` green,
  including the pre-existing `tests/settings/*` (a new settings field must keep
  `DEFAULT_SETTINGS` complete).
- `npm run build` green.
- Manual, described: press `l`, double-click the plot's top edge, drag the new corner (area in
  the status bar updates), double-click it to remove it, Undo once per action; the sage dashed
  setback line follows the boundary.

## Out of scope / forbidden
- No 3D rendering of the setback. No change to the `plot-boundary` chain drawing of a new plot.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
