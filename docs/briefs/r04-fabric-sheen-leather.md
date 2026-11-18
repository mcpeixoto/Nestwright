# r04 — Fabric sheen and leather clearcoat

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Sofas, rugs and curtains stop looking like painted plastic. Fabric materials become
`MeshPhysicalMaterial` with a sheen lobe (`sheen 0.6`, `sheenRoughness 0.7`, sheen colour
= the albedo lightened toward white); the four leathers get a thin clearcoat
(`clearcoat 0.15`, `clearcoatRoughness 0.5`). Woven rattan/cane stay standard. Cache keys,
twins and the scan swap keep working unchanged.

## Context the implementer needs
- `src/materials/materialCache.ts:168–171` creates `new THREE.MeshStandardMaterial(...)`;
  `twinOf` (l.76) uses `original.clone()` (a `MeshPhysicalMaterial.clone()` stays physical);
  `applyPbrMaps` (l.119) copies the tinted `color`; `getMaterial` return type is
  `THREE.MeshStandardMaterial` (`MeshPhysicalMaterial` extends it, so callers compile).
- `src/materials/library.ts`: Fabric category ids — carpet-grey, fabric-linen,
  fabric-velvet-green, leather-brown, rattan, boucle, velvet-rust, leather-black, rug-wool,
  rug-jute, leather-tan, leather-cream, cane-webbing. Weaves have `pattern.kind === 'weave'`
  (rattan, rug-jute, cane-webbing).
- House rule (`docs/briefs/README.md`): library materials stay
  `MeshStandardMaterial`/`MeshPhysicalMaterial`. Use the classic `THREE.MeshPhysicalMaterial`
  (the WebGPU renderer converts it; `envNode`/`normalNode` slots still apply).
- `src/catalog/models/template.ts:43–74` converts glTF physical → standard for scanned
  models (transmission cost); that is unrelated and stays.
- `tests/materials/library.test.ts` builds every id through `getMaterial`.
- `src/view3d/atmosphere/weather.ts:55` `attachWeather` and
  `src/materials/facadeWeathering.ts:67` check `isMeshStandardMaterial` (true on physical).

## Steps
1. **Tests first** — `tests/view3d/materialKinds.test.ts` (see below). Fails.
2. `src/materials/library.ts`: `export type MaterialKind = 'fabric' | 'leather' | 'weave' | 'standard'`;
   `export function materialKind(def: MaterialDef): MaterialKind` — `id.startsWith('leather-')`
   → leather; `category === 'Fabric' && pattern.kind === 'weave'` → weave;
   `category === 'Fabric'` → fabric; else standard.
   `export const SHEEN = { sheen: 0.6, sheenRoughness: 0.7, lighten: 0.35 }` and
   `export const LEATHER_COAT = { clearcoat: 0.15, clearcoatRoughness: 0.5 }`.
3. `src/materials/materialCache.ts` `getMaterial`: choose the class by kind:
   ```ts
   const kind = def ? materialKind(def) : 'standard'
   const mat = kind === 'fabric' || kind === 'leather'
     ? new THREE.MeshPhysicalMaterial({ roughness, metalness })
     : new THREE.MeshStandardMaterial({ roughness, metalness })
   ```
   Add `export function sheenColorFor(color: THREE.Color): THREE.Color` =
   `color.clone().lerp(new THREE.Color(1, 1, 1), SHEEN.lighten)`. After the colour is set
   (procedural branch l.189/196): for fabric `mat.sheen = 0.6; mat.sheenRoughness = 0.7; mat.sheenColor.copy(sheenColorFor(baseColor))`
   where `baseColor` is `def.color` × tint (not the white map multiplier); for leather
   `mat.clearcoat = 0.15; mat.clearcoatRoughness = 0.5`.
4. `applyPbrMaps`: after `mat.color.copy(color)`, if `(mat as MeshPhysicalMaterial).sheen > 0`
   set `sheenColor` from `sheenColorFor(new Color(source.def.color).multiply(tint))` so the
   lobe follows the swatch, not the tint-corrected scan multiplier. `mapSignature` unchanged.
5. `twinOf`: no change needed; add a comment that `clone()` keeps the subclass, and keep
   `userData.kind = materialKind(def)` on the base material (set in `getMaterial`) so the
   weather dresser can skip clearcoat wetness later.
6. Perf sanity: `node scripts/visual/shoot.mjs --serve --views living-room,upper-bedroom --out visual-out/r04`;
   compare `p50` with the previous run; sheen is per-material, expect < 2 % change.

## Tests to add
`tests/view3d/materialKinds.test.ts`:
- `materialKind` for `fabric-linen` → `'fabric'`, `leather-tan` → `'leather'`, `rattan` → `'weave'`,
  `oak-planks` → `'standard'`; every Fabric-category def maps to fabric, leather or weave.
- `getMaterial({ id: 'fabric-linen' })` is `instanceof THREE.MeshPhysicalMaterial` with
  `sheen === 0.6`, `sheenRoughness === 0.7`, and `sheenColor` lighter than `def.color`
  (compare `getHSL().l`).
- `getMaterial({ id: 'leather-black' })` has `clearcoat === 0.15`, `clearcoatRoughness === 0.5`, `sheen === 0`.
- `getMaterial({ id: 'rattan' })` is not `MeshPhysicalMaterial`; `getMaterial({ id: 'plaster-white' })` neither.
- Cache keys unchanged: `materialCacheKey({ id: 'fabric-linen' }) === 'fabric-linen||1'`;
  `getMaterial({ id: 'fabric-linen' }, { outdoor: true })` is a `MeshPhysicalMaterial`,
  `isOutdoorMaterial` true, `sheen === 0.6`, `isCachedMaterial` true.
- `applyPbrMaps(mat, source, fakeMaps)` on `fabric-velvet-green` keeps `sheen` and updates
  `sheenColor` (not equal to white).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d tests/materials tests/builders` green.
- `npm run dev`, living room: the sofa cushion shows a soft rim brightening toward grazing
  angles; the leather armchair a faint tight highlight.
- Harness `living-room`, `upper-bedroom` before/after attached; no console errors in
  `summary.json`.

## Out of scope / forbidden
- No anisotropy, no iridescence, no transmission here. Scanned glTF models keep their
  standard conversion (`template.ts`).
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
