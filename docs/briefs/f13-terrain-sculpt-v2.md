# f13 — Terrain sculpt v2

**Epic:** Features **Release:** v0.21.0 **Owner model:** grok-4.7-medium
**Depends on:** f12 (shares `src/model/terrain.ts`; run after it)
**Time box:** ≤ 20 min of agent work

## Goal
The sculpt tool already has raise / lower / flatten / smooth, a radius and strength in the
floating brush panel, one undo step per stroke and a 2D ring (`src/tools/terrain-sculpt.ts`,
`src/tools/brushState.ts`, `src/ui/panels/OutsidePanel.tsx:109`). What is missing: the controls
in the inspector while the tool is active, keyboard sizing (`[` / `]`), Shift to invert
raise↔lower, a falloff choice, a height clamp so a held pointer cannot build a 40 m spike,
dab strength independent of frame rate, and a ring preview in the 3D view.

## Context the implementer needs
- `src/tools/terrain-sculpt.ts` (86 lines): `terrainPointer(phase, point)` throttled by
  `allowDab()` (36 ms, `brushState.ts:74`); `raise/lower` use `brush.strength * 0.65` per dab
  (l.39–40); stroke grouping via `beginStroke('Sculpt terrain')`/`endStroke()`; `drawOverlay`
  strokes a circle with `strokeCircle` from `src/tools/chain.ts`.
- `src/tools/brushState.ts`: `BrushState {sculpt, radius (1–20), strength (0.05–1), …}`,
  `setBrush`, `useBrush`, `brushRadiusFor(tool)` (l.65, used by the 3D layer for the ring?
  grep its callers in `src/view3d/layers/outside.ts`).
- `src/model/terrain.ts`: `brushFalloff(distance, radius)` (l.165, cosine), `forEachBrush`
  (l.176), `raise` (l.203), `lower` (l.210), `flatten` (l.215), `smooth` (l.225).
  Tests: `tests/model/terrain.test.ts:52–95` (`terrain brushes`).
- 3D pointer path: `src/view3d/layers/outside.ts:134` routes `terrainPointer` for the 3D view;
  the file owns the outside scene layer, so the 3D ring goes there (a `THREE.Line` ring of 48
  points on the terrain, re-sampled with `sampleHeight` each `update`).
- Inspector tool-section pattern: `src/ui/inspector/sections/tool.tsx`. Shortcuts:
  `registerShortcut` (`src/ui/shortcuts.ts`); the tool's own `onKeyDown(ctx)` sees `ctx.key`
  (`src/tools/wall.ts:79`). Strings `'Radius'`, `'Strength'`, `'Brush'` exist in `en.ts`.

## Steps
1. Tests first: `tests/model/sculptBrush.test.ts`.
2. `src/model/terrain.ts`:
   - `export type Falloff = 'smooth' | 'linear' | 'sharp'`; `brushFalloff(distance, radius, falloff = 'smooth')`:
     `smooth` = current cosine; `linear` = `1 - t`; `sharp` = `(1 - t)²`.
   - `export const HEIGHT_LIMIT = 12` (metres above/below 0); `raise` clamps each written sample to
     `[-HEIGHT_LIMIT, HEIGHT_LIMIT]`.
   - `raise`, `lower`, `flatten`, `smooth` take an optional trailing `falloff: Falloff = 'smooth'`
     and pass it to `forEachBrush` → `brushFalloff`.
   - `export function dabStrength(strength: number, dtMs: number, baseMs = 36): number` =
     `strength * 0.65 * clamp(dtMs / baseMs, 0.25, 3)` so a slow frame makes a bigger dab and a
     fast one a smaller dab (metres per 36 ms stays constant).
3. `src/tools/brushState.ts`: `falloff: Falloff` (default `'smooth'`) and `invert: boolean`
   (default false, transient: not persisted) in `BrushState`; `setBrush` validates `falloff`.
   Keep `allowDab()`'s boolean signature; add `export function lastDabGap(): number` that
   returns the ms between the two most recent accepted dabs (36 on the first dab of a stroke).
4. `src/tools/terrain-sculpt.ts`:
   - compute `const amount = dabStrength(brush.strength, lastDabGap())`; mode = `brush.sculpt`
     flipped between `raise`/`lower` when `brush.invert` (Shift held: track `shiftKey` through
     `ctx.shift` on `down`/`move`; the 3D path passes `false`);
   - pass `brush.falloff` to every brush call;
   - `onKeyDown`: `[` → `setBrush({ radius: brush.radius - 0.5 })`, `]` → `+ 0.5`,
     `-`/`=` → strength ∓ 0.05; mark `ctx.handled = true`;
   - `drawOverlay`: inner ring at `radius * 0.5` for `sharp`, `0.7` for `smooth`, none for
     `linear` (shows where the falloff drops to ~50 %), plus the mode glyph (`+`, `−`, `=`, `~`)
     at the cursor.
5. `src/view3d/layers/outside.ts`: `sculptRing` — a `THREE.LineLoop` (48 segments, material
   `LineBasicMaterial({ color: 0xc8643b, depthTest: false })`, `renderOrder 10`) shown while
   `state.tool === 'terrain-sculpt'` and the pointer is over the terrain; each `update` place the
   48 points at the pointer's plan position + radius, `y = sampleHeight(terrain, x, z) + 0.03`.
   Hide it otherwise. Keep it out of the material cache (a `Line`, not a `Mesh`).
6. New `src/ui/inspector/sections/sculptTool.tsx` (`id: 'sculpt-tool'`, `order: 5`, match
   `state.tool === 'terrain-sculpt'`): mode select (`Raise | Lower | Flatten | Smooth`, labels
   exist? check `labelOf('raise')` keys in `en.ts`; add missing), `NumberField` radius 1–20 step
   0.5, strength 0.05–1 step 0.05, falloff select, and the hint `'[ ] resize · Shift inverts'`.
   Register in `src/ui/inspector/sections/index.ts`. Strings en + pt (the pt value must differ
   from the en one, so `Linear` cannot be a key): `'Falloff'`/`'Suavização'`,
   `'Smooth falloff'`/`'Suave'`, `'Straight'`/`'Recto'` (the linear falloff), `'Sharp'`/`'Acentuado'`,
   `'[ ] resize · Shift inverts'`/`'[ ] redimensiona · Shift inverte'`, `'Raise'`/`'Elevar'`,
   `'Lower'`/`'Baixar'`, `'Flatten'`/`'Aplanar'`, `'Smooth'`/`'Alisar'` (skip any that exist).

## Tests to add
`tests/model/sculptBrush.test.ts`
- "falloff shapes": `brushFalloff(0, 2, f) === 1` for all three; at `distance 1` → smooth `0.5`,
  linear `0.5`, sharp `0.25` (±1e-9); at `2` → 0; `sharp < smooth` at `distance 1.5`.
- "raise never exceeds the height limit": 400 raises of strength 1 at the same point →
  `max(heights) === HEIGHT_LIMIT`; 400 lowers → `min === -HEIGHT_LIMIT`.
- "dabStrength is proportional to the gap and clamped": `dabStrength(1, 36) ≈ 0.65`,
  `dabStrength(1, 72) ≈ 1.3`, `dabStrength(1, 1000) ≈ 1.95`, `dabStrength(1, 0) ≈ 0.1625`.
- "sharp falloff moves less volume than smooth, which moves less than linear": sum of height
  deltas after one raise, per falloff (disc means: sharp 1/6, cosine ≈ 0.297, linear 1/3) →
  assert `sharp < smooth < linear`.
- "flatten and smooth accept a falloff without changing their converged result": repeated
  flatten with `'sharp'` converges to the target at the centre (±1e-3) as with `'smooth'`.
- `tests/tools/brushState.test.ts`: `setBrush({ falloff: 'bogus' as Falloff })` keeps `'smooth'`;
  `setBrush({ radius: 0 })` clamps to 1; `invert` round-trips.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/tools tests/i18n` green,
  including the pre-existing `tests/model/terrain.test.ts` brushes block (default falloff and the
  default `0.65` factor keep its numbers).
- `npm run build` green.
- Manual, described: press `h`, hold the pointer still with the mouse down for 5 s → the hill
  stops at 12 m; `]` three times grows the ring; Shift turns raise into lower; in 3D the orange
  ring hugs the ground.

## Out of scope / forbidden
- No new brush modes beyond the four; no terrain resolution change; no texture painting changes.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
