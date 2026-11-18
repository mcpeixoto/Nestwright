# r11 — Scanned ground splat layers

**Epic:** realism **Release:** v0.23.0 **Owner model:** grok-4.7-medium (steps 1–5), claude (steps 6–9)
**Depends on:** r01 (re-pack adds the new sets)
**Time box:** ≤ 20 min of agent work per owner

## Goal
Gravel, paving, sand, soil, path, forest floor and meadow stop being 512² canvas art
beside a scanned lawn. Each splat layer samples a CC0 scan the way `lawn-fine` does,
tinted to the layer's plan colour, with a per-layer macro variation and a height-noise
ragged edge where layers meet. Gravel and paving reuse library scans that already exist;
the other five come in through a new `splatLayer` target kind in `content/sources.json`.

## Context the implementer needs
- Runtime: `src/view3d/terrain/textures.ts:214` `LAYER_KINDS`, `LAYER_TILING` (l.244),
  `LAWN_SCAN_ID` (l.248), `macroVariation()` (l.275), `LawnSlots`/`applyLawnScan` (l.282–305),
  `createSplatMaterial()` (l.313–403: uniforms `lawnTiling`, `lawnTint`, textures
  `lawnAlbedo`/`lawnNormal`, the weight loop at l.332). `tests/view3d/lawnScan.test.ts` must
  stay green (`mat.userData.lawn` slots, `applyLawnScan`, `LAWN_MACRO_AMOUNT`).
- `src/materials/pbrTextures.ts:242–309`: `loadSet(materialId)` reads `index.textures[materialId]`;
  `loadPbrMaps(id, scale)`. `albedoTint(hex, meanAlbedoSrgb)`.
- `src/model/terrain.ts:46` `LAYER_RGB` (plan tint per layer, same order as `GROUND_LAYERS`
  in `src/model/types.ts`).
- Pipeline: `scripts/content/lib/sources.mjs` `assertEntry` (targets object);
  `scripts/content/lib/validate.mjs` `targetErrors` (materialId/catalogId/species);
  `scripts/content/lib/ids.mjs` `loadIds` (regex extraction); `scripts/content/lib/contentIndex.mjs`
  `buildContentIndex` (keys textures by `targets.materialId`); `scripts/content/process.mjs:33`
  `tileFor` (falls back to the library tileSize only for `materialId`).
  Tests: `tests/content/contentIndex.test.mjs`, `tests/content/pipeline.test.mjs`.
- Library scans to reuse: `gravel-grey` (ambientcg), `patio-paving` (2.15 m).

## Steps (grok: 1–5)
1. **Tests first** — pipeline cases in `tests/content/contentIndex.test.mjs` (see below). Fails.
2. `ids.mjs`: `export function extractGroundLayers(source)` reading the
   `GROUND_LAYERS = [...]` literal in `src/model/types.ts`; `loadIds` returns `groundLayers: Set`.
   `validate.mjs targetErrors`: `targets.splatLayer` must be in `ids.groundLayers`
   (`"<key> splatLayer <x> is not a ground layer"`). `sources.mjs assertEntry`: a texture
   entry with `targets.splatLayer` must carry `tileMeters` (`"<key> splatLayer entries need tileMeters"`).
3. `contentIndex.mjs buildContentIndex`: index key = `manifest.targets.materialId ?? (manifest.targets.splatLayer ? 'splat/' + manifest.targets.splatLayer : null)`;
   `process.mjs tileFor` returns `entry.tileMeters` for splat entries (already second
   branch; confirm). `README.md` (scripts/content): one paragraph on `targets.splatLayer`.
4. `content/sources.json`: five texture entries, `resolution: '2k'`, `licence: 'CC0'`,
   `targets: { splatLayer: … }`, `tileMeters` set, `notes: 'splat layer (r11)'`.
   Candidates to verify with `curl -s https://api.polyhaven.com/info/<id>` (200 = exists)
   or `https://ambientcg.com/api/v2/full_json?id=<id>`; replace a 404 with a neighbour from
   `https://api.polyhaven.com/assets?t=textures&c=terrain`:
   sand → polyhaven `sand_01` (tileMeters 2); soil → polyhaven `brown_mud_leaves_01` (2);
   path → polyhaven `forest_ground_04` (2); forest-floor → polyhaven `forrest_ground_01` (2);
   meadow → polyhaven `aerial_grass_rock` (3). `albedoContrast 0.6` on meadow.
5. `src/view3d/terrain/textures.ts`: `export const SPLAT_SCAN_IDS: Record<typeof LAYER_KINDS[number], string> = { lawn: 'lawn-fine', meadow: 'splat/meadow', gravel: 'gravel-grey', paving: 'patio-paving', sand: 'splat/sand', soil: 'splat/soil', path: 'splat/path', 'forest-floor': 'splat/forest-floor' }`
   and `export const SPLAT_MACRO: number[] = [0.16, 0.16, 0.06, 0.06, 0.12, 0.12, 0.06, 0.12]`
   (data only; the shader work is claude's).

## Steps (claude: 6–9)
6. **Tests first** — `tests/view3d/splatScans.test.ts` (below). Fails.
7. `createSplatMaterial()`: generalise `LawnSlots` to `LayerSlots` per layer
   (`albedo: TextureNode`, `normal: TextureNode`, `tiling: uniform`, `tint: uniform(Color 1,1,1)`,
   `macro: uniform(SPLAT_MACRO[i])`); keep `mat.userData.lawn` pointing at slot 0 so
   `applyLawnScan` and its test keep working; add `mat.userData.layers: LayerSlots[]`.
   Sample `texture(slot.albedo, positionWorld.xz.mul(slot.tiling)).rgb.mul(slot.tint)`;
   macro per layer `mx…` as today but amount `slot.macro` (lawn/meadow keep
   `LAWN_MACRO_AMOUNT`). Normal: sum of per-layer scan normals weighted by share, strength
   0.6 (lawn) / 0.8 (others), as l.355–359 does for the lawn.
8. Edge blending: per layer `h_i = mx_noise_float(positionWorld.xz.mul(0.8).add(i * 7.3))`;
   `w_i' = clamp(w_i.mul(h_i.sub(0.5).mul(0.6).add(1)), 0, 1)`; renormalise by the sum.
   Export `EDGE_NOISE = 0.6`.
9. `export function applyLayerScan(mat, kind, maps): boolean` (tint toward `LAYER_RGB[i]`
   through `albedoTint`, `tiling = 1 / tileMeters`, normal if present); on creation
   `for kind of LAYER_KINDS: loadPbrMaps(SPLAT_SCAN_IDS[kind]).then(m => m && applyLayerScan(mat, kind, m))`
   (`applyLawnScan` delegates to `applyLayerScan(mat, 'lawn', maps)`).
   Harness `garden-wide`, `terrace-pool`, `aerial-cutaway` before/after; aerial ≥ 55 fps.

## Tests to add
- `tests/content/contentIndex.test.mjs`: a manifest with `targets: { splatLayer: 'sand' }`
  lands at `textures['splat/sand']`; `assertEntry` rejects a splatLayer entry without
  `tileMeters`; `validateState` rejects `splatLayer: 'lava'` with `/not a ground layer/`;
  `loadIds(repoRoot).groundLayers` has 8 entries including `'forest-floor'`.
- `tests/view3d/splatScans.test.ts`: `createSplatMaterial().userData.layers` has 8 slots
  with `tiling.value ≈ 0.07 * LAYER_TILING[i]`; `applyLayerScan(mat, 'gravel', fakeMaps([150,145,135], 1.5))`
  true, slot tiling `1/1.5`, tint luminance pulls the mean to `LAYER_RGB[2]` within 3 %;
  `applyLayerScan(mat, 'sand', fakeMaps([20, 20, 200]))` false (hue too far);
  `SPLAT_SCAN_IDS.gravel === 'gravel-grey'`; `EDGE_NOISE === 0.6`.
- `tests/view3d/lawnScan.test.ts` unchanged and green.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/content tests/view3d` green;
  `node scripts/content/validate.mjs` clean.
- Harness shots attached; `garden-wide.png` gravel path and paving show scan detail with
  a ragged boundary into the lawn; no console errors.

## Out of scope / forbidden
- No new ground layers, no splat painting changes, no plan-view colour changes.
- Do not edit existing tests or user-facing strings. Grok does not touch `textures.ts`
  beyond the two exported constants.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not run the content pipeline. Do not commit, push or merge. No new dependencies.
