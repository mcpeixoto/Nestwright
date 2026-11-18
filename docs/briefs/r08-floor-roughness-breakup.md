# r08 — Roughness breakup on glossy floors (SSR reacts)

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude
**Depends on:** r05 (`src/materials/smudge.ts`), r02 merged (shared `applyPbrMaps` edits)
**Time box:** ≤ 20 min of agent work

## Goal
Polished floors stop reflecting like a mirror sheet. Every library material with
`roughness < 0.3` that is not a metal or glass (marble, calacatta, nero marble, quartz
worktop, granite, polished concrete, white and blue subway tile, white zellige) blends the
shared smudge/scuff map into its roughness at 25 % in world space, so screen-space
reflections (which read the G-buffer roughness) break up into wiped and scuffed patches
instead of one even gloss.

## Context the implementer needs
- `src/materials/smudge.ts` from r05: `smudgeTexture()`, `smudgeRoughnessNode(lo, hi, uvNode)`.
- `src/materials/materialCache.ts`: `getMaterial` sets `roughness`/`roughnessMap`
  (procedural: l.186 and the `roughMean` divide at l.223; scan: `applyPbrMaps` l.132–137
  with `pbrScalars`). After r02 `applyPbrMaps` may already set `roughnessNode` for
  `antiTile` ids (none of those is glossy; polished-concrete is both — handle the
  combination: breakup wraps whatever roughness node exists).
- `src/view3d/post/effects.ts:120–159`: SSR reads `gbuffer.metalRough.g` as roughness and
  fades with `smoothstep(SSR_ROUGH_START, SSR_ROUGH_END, rough)`; the MRT pass writes the
  material's final roughness, so a `roughnessNode` reaches SSR with no further change.
- `src/materials/library.ts` roughness per id (marble 0.22, marble-calacatta 0.15,
  marble-nero 0.15, quartz-worktop 0.15, granite-worktop 0.25, polished-concrete 0.28,
  tile-subway-white 0.2, tile-subway-blue 0.2, zellige-white 0.25; metal-brass 0.28 and
  chrome 0.08 are metals; glass/mirror are `NO_SCAN`).
- TSL: `materialRoughness` is roughness × roughnessMap; `positionWorld`, `mix`, `texture`.
- Harness: `node scripts/visual/shoot.mjs --serve --views living-room,kitchen,bathroom --out visual-out/r08`.

## Steps
1. **Tests first** — `tests/materials/floorBreakup.test.ts` (see below). Fails.
2. `src/materials/floorBreakup.ts`:
   `export const BREAKUP = { maxRoughness: 0.3, blend: 0.25, lo: 0.15, hi: 0.55, tileMeters: 1.7 }`.
   `export function needsBreakup(def: MaterialDef): boolean` =
   `def.roughness < 0.3 && def.metalness < 0.5 && !NO_SCAN_IDS.has(def.id)` where
   `NO_SCAN_IDS = new Set(['glass', 'frosted-glass', 'mirror'])` (export `NO_SCAN` from
   materialCache instead of duplicating if the import is cycle-free; otherwise the local set).
   `export function breakupRoughnessNode(base: THREE.Node<'float'>): THREE.Node<'float'>` =
   `mix(base, smudgeRoughnessNode(BREAKUP.lo, BREAKUP.hi, positionWorld.xz.div(BREAKUP.tileMeters)), BREAKUP.blend)`.
   World XZ is used on purpose: floors are horizontal, and the pattern never lines up with
   the scan's tile; on a vertical subway wall it reads as wipe streaks.
   `export function applyBreakup(mat: THREE.MeshStandardMaterial & { roughnessNode?: ... })`:
   `mat.roughnessNode = breakupRoughnessNode(mat.roughnessNode ?? materialRoughness)`;
   `mat.userData.breakup = true`.
3. `src/materials/materialCache.ts`: in `getMaterial`, after the special cases and before
   `cache.set`, `if (def && needsBreakup(def)) applyBreakup(mat)`. In `applyPbrMaps`,
   after the roughness map is assigned, re-apply when `source.def` needs it (the node must
   wrap the scan's roughness; `materialRoughness` reads the new `roughnessMap`, so simply
   call `applyBreakup` again only if `mat.userData.breakup` and the node was replaced by
   r02's antiTile path; otherwise the existing node already wraps `materialRoughness`).
   Add `roughnessNode` to `mapSignature` if r02 has not already.
4. Outdoor and interior twins: `twinOf`/`interiorTwinOf` clone the node slots with `clone()`
   (three copies `roughnessNode` on node-aware materials); verify in the test that the
   outdoor twin of `marble` carries `userData.breakup`.
5. Harness `living-room`, `kitchen`, `bathroom` before/after; paste SSR-visible difference
   (the kitchen worktop and bathroom tile reflections show patchy sharpness).

## Tests to add
`tests/materials/floorBreakup.test.ts`:
- `needsBreakup` true for `marble`, `quartz-worktop`, `tile-subway-white`, `polished-concrete`;
  false for `metal-brass`, `chrome`, `oak-planks`, `glass`, `mirror`, `tile-terrazzo` (0.32).
- `MATERIALS.filter(needsBreakup).map(m => m.id)` equals exactly
  `['marble', 'polished-concrete', 'zellige-white', 'tile-subway-white', 'tile-subway-blue', 'quartz-worktop', 'marble-calacatta', 'marble-nero', 'granite-worktop']`
  in library order (adjust the order to the file; the set is the assertion).
- `getMaterial({ id: 'marble' })` has `roughnessNode` truthy and `userData.breakup === true`;
  `getMaterial({ id: 'oak-planks' })` has no `roughnessNode`.
- `getMaterial({ id: 'marble' }, { outdoor: true }).userData.breakup === true`.
- `applyPbrMaps(marbleMat, source, fakeMaps)` keeps `roughnessNode` truthy.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/materials tests/view3d tests/builders` green.
- Harness shots attached; `summary.json` has no errors; `kitchen.json` p50 within 2 % of before.
- Visual: in `kitchen.png` the worktop reflection of the window is sharp in places and
  soft in others; in `bathroom.png` the tiles no longer read as one mirror.

## Out of scope / forbidden
- No wetness, no footprints, no per-room control.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
