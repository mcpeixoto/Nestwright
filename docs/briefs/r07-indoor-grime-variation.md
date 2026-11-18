# r07 — Indoor grime along skirting and corners, per-item tint variation

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Rooms lose the "freshly rendered" evenness. Interior wall faces darken a little along the
skirting (≤ 8 %) and into vertical corners (≤ 6 %), driven by a per-vertex attribute laid
down by `buildWall` the way the facade `weather` attribute is; furniture built from the
procedural catalog gets a quantised ±3 % tint variation per item so two identical chairs
are not pixel-identical. Both effects are capped so the `litColour.test.ts` windows (wall
mid-height plaster ≥ 165) hold.

## Context the implementer needs
- `src/builders/walls.ts:43–58, 99, 108`: `Bucket(weathered)` pushes `drip` into `weather`
  per vertex and sets `FACADE_ATTRIBUTE`; `side(p0, p1, y0, y1, elevation, d0, d1, normal)`
  at l.58 knows the along-wall distances `d0/d1`; `buildWall` (l.197–263) makes `left`,
  `right` (indoor), `leftOut`, `rightOut` (facade) and calls
  `getMaterial(ref, bucket.weathered ? { facade: true } : undefined)` at l.255.
- `src/materials/materialCache.ts`: `MaterialOptions` (l.13), `FACADE_SUFFIX` (l.28),
  `twinOf` (l.76: sets `userData.outdoor`, `envNode = null`), `facadeVariant` (l.68),
  `isOutdoorMaterial` (l.50), `reflectRoom` import.
- `src/materials/facadeWeathering.ts`: `facadeColorNode(base)` wraps `materialColor`;
  `attachFacadeWeathering` guards with a `WeakSet`. Copy this shape.
- `src/builders/items.ts:41–76` `buildItem`: `materials[slot] = getMaterial(ref)` for
  procedural entries; scanned models skip material picks.
- `tests/builders/facadeWeathering.test.ts` (fixture `house()`, `faces()`, `weatherRows()`);
  `tests/view3d/litColour.test.ts` (plaster window at l.145–154).
- Wall length along the face is `uv().x` in metres (`facadeWeathering.ts:44`).

## Steps
1. **Tests first** — `tests/builders/indoorGrime.test.ts` (see below). Fails.
2. `src/materials/indoorGrime.ts`: `export const GRIME_ATTRIBUTE = 'grime'` (vec2:
   x = world y of the floor, y = distance in metres to the nearest wall end along the face);
   `export const GRIME = { skirtHeight: 0.35, skirtDarken: 0.08, cornerReach: 0.4, cornerDarken: 0.06, cap: 0.12, tint: new Color(0.62, 0.6, 0.57) }`.
   `export function grimeColorNode(base = materialColor)`: `g = attribute(GRIME_ATTRIBUTE,'vec2')`,
   `skirt = smoothstep(skirtHeight, 0, positionWorld.y.sub(g.x)).mul(skirtDarken)`,
   `corner = smoothstep(cornerReach, 0, g.y).mul(cornerDarken)`,
   `ragged = mx_noise_float(vec2(uv().x.mul(3), positionWorld.y.mul(2))).mul(0.3).add(0.85)`,
   `amount = clamp(skirt.add(corner).mul(ragged), 0, cap)`; return
   `vec4(mix(c.rgb, c.rgb.mul(tint), amount), c.a)`.
   `export function attachIndoorGrime(material)` with a `WeakSet` guard and
   `userData.interior = true`.
3. `src/materials/materialCache.ts`: `MaterialOptions.interior?: boolean`;
   `INTERIOR_SUFFIX = '|interior'`; `materialCacheKey` appends it (never with
   outdoor/facade); `baseKey` strips it; `export function interiorVariant(material)` like
   `facadeVariant` but the twin is made by a new `interiorTwinOf` that clones, keeps
   `userData` without `outdoor`, calls `reflectRoom(twin)`, registers the key, requests the
   scan swap, then `attachIndoorGrime(twin)`. `getMaterial(ref, { interior: true })` routes to it.
   `isOutdoorMaterial` stays false for it.
4. `src/builders/walls.ts`: `Bucket` gets `readonly grime: number[] = []` and
   `indoor = false` flag (constructor `(weathered = false, indoor = false)`); `left`/`right`
   are `new Bucket(false, true)`. In `side()` and `absorb()`, when `indoor`, push per vertex
   `[level.elevation, min(d - spanStart, spanEnd - d)]` — pass the wall-end distances:
   `side()` already receives `d0/d1`; store `wallLength = wallFrame(wall).length` on the
   bucket before the loop and push `Math.min(d, wallLength - d)` for each vertex's `d`.
   `geometry()` sets `GRIME_ATTRIBUTE` (`Float32BufferAttribute(grime, 2)`) when indoor.
   `addPart` uses `getMaterial(ref, bucket.weathered ? { facade: true } : bucket.indoor ? { interior: true } : undefined)`.
   Ends bucket stays plain.
5. `src/builders/items.ts`: `export function varyTint(tint: string | undefined, seed: string): string`
   — `hash(seed)` → step ∈ {0, 1, 2} → multiply the tint (default `#ffffff`) by
   `[0.97, 0.985, 1][step]`, return hex. In `buildItem` procedural branch:
   `materials[slot] = getMaterial({ ...ref, tint: varyTint(ref.tint, item.id + slot) })`
   only when `entry.category !== 'lighting'` (lamp shades carry nits; keep them exact).
6. Check `litColour.test.ts` still passes (it does not model the attribute; the cap
   documents the headroom: 165 × (1 − 0.12) is never reached at mid-height because
   `skirt` is 0 above 0.35 m).

## Tests to add
`tests/builders/indoorGrime.test.ts`:
- `materialCacheKey({ id: 'plaster-white' }, { interior: true }) === 'plaster-white||1|interior'`;
  `getMaterial(ref, { interior: true })` is not the indoor base and not the facade twin;
  `isOutdoorMaterial` false; `hasRoomReflection` true; has `colorNode`; `userData.interior === true`;
  calling twice returns the same object.
- `buildWall` on the `house()` fixture: every face mesh with `userData.face` in
  `left|right` whose material is the interior twin has a `grime` attribute with 2 items
  per vertex; `x` equals `level.elevation` (0.4); `y ≥ 0` and `≤ wall length / 2 + 1e-6`.
- The facade meshes (`userData.outdoor`) have `weather` and no `grime`; the `end` mesh has neither.
- `varyTint(undefined, 'a')` ∈ `{'#f7f7f7', '#fbfbfb', '#ffffff'}`; deterministic for the
  same seed; the three steps all appear across seeds `'0'..'99'`; `varyTint('#808080', s)`
  never brightens above `#808080`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/builders tests/view3d tests/materials` green,
  including `litColour.test.ts` and `facadeWeathering.test.ts` unchanged.
- Harness `living-room`, `kitchen` before/after: a faint darkening in the lower 30 cm of
  walls and into corners, nowhere darker than 12 %; `perf.report` p50 within 3 %.

## Out of scope / forbidden
- No dust on furniture tops, no wear on floors, no changes to scanned-model materials.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
