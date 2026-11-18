# r12 — Scanned flower and plant models for the plant brush

**Epic:** realism **Release:** v0.23.0 **Owner model:** grok-4.7-medium (re-run on grok-4.7-high if the first run fails)
**Depends on:** r01 (content-v4 pack carries the models)
**Time box:** ≤ 20 min of agent work

## Goal
Flowers stop being coloured balls on cones. The species `flowers-mixed`, `lavender`,
`sunflowers`, `tall-grass`, `reeds` and three new ones (`fern`, `hydrangea`, `rose-bush`)
draw Poly Haven CC0 plant models as instances within 40 m; beyond that the existing
low-poly geometry is the far proxy (the ez-tree impostor bake is shaped around
bark+leaves assets and is not reused here — a true baked card for model species is a
later brief). The pipeline indexes species models (several variants per species) and the
species table records the real-world height each variant is fitted to.

## Context the implementer needs
- Fallback geometry: `src/view3d/terrain/plants.ts:209–271` `buildSpecies(species)`
  (flowers at l.238–252). `PlantField` (l.300–449): per `chunkKey` batches of
  `InstancedMesh` sharing one vertex-coloured `MeshStandardNodeMaterial` with the sway
  `positionNode`; `sync(terrain)` at l.347; `update(elapsed, camera, renderer)` at l.430.
  Foliage species go to `TreeField` through `foliageSpec` — leave that path alone.
- Species list: `src/model/terrain.ts:21–42` `PLANT_SPECIES`, `speciesProfile(species)` at l.61;
  `src/ui/panels/OutsidePanel.tsx:15–33` `SPECIES_ICON`; labels come from `labelOf(id)`
  (`'Rose Bush'` etc.) — add those strings to `en.ts`/`pt.ts`.
- Content: `content/sources.json` already has `flower-gazania-model`
  (`node: 'flower_gazania_h_LOD0'`, `targets: { species: 'flowers-mixed' }`).
  `scripts/content/lib/contentIndex.mjs:36–56` `modelEntries` skips species models
  ("Scatter-species models are not listed yet"). `scripts/content/lib/ids.mjs extractSpecies`
  reads `species === '...'` literals — `PLANT_SPECIES` entries are found through
  `buildSpecies`'s comparisons, so each new species needs one `species === 'x'` branch there.
  Poly Haven listings: `https://api.polyhaven.com/assets?t=models&c=plants`, `…&c=flowers`;
  `https://api.polyhaven.com/files/<slug>` to see node names is not available — the
  pipeline error lists scene roots when `node` is wrong (README "node").
- Runtime loader: `src/catalog/models/registry.ts` (private `loadTemplate(catalogId, info)`,
  `models` from `index.models`); `src/materials/pbrTextures.ts:38–44` `ContentIndex`;
  `src/catalog/models/build.ts:116 buildModel(template, size, lamp)`.
- Tests: `tests/content/contentIndex.test.mjs`, `tests/view3d/plantSway.test.ts`,
  `tests/model/gardenLayout.test.ts` (`BED_SPECIES` uses flowers-mixed/lavender/bush-flowering — unchanged).

## Steps
1. **Tests first** — `tests/content/contentIndex.test.mjs` and `tests/view3d/speciesModels.test.ts` (below). Fails.
2. `contentIndex.mjs`: `speciesEntries(sorted)` → `{ [species]: ContentModel[] }` (same
   fields as `modelEntries`, one array item per manifest, sorted by key); add `species` to
   the returned index. `pbrTextures.ts ContentIndex.species?: Record<string, ContentModel[]>`.
3. `src/model/terrain.ts`: add `'fern'`, `'hydrangea'`, `'rose-bush'` to `PLANT_SPECIES`;
   `speciesProfile` returns `{ spacing: 0.5, density: 0.8 }` for fern, `{ 0.7, 0.6 }`
   hydrangea, `{ 0.6, 0.6 }` rose-bush. `plants.ts buildSpecies`: branches
   `species === 'fern'` (6 cones leaning out, 0x3f6f3a), `'hydrangea'` (ball 0.5 m with 6
   pink 0xc98bb0 heads), `'rose-bush'` (ball 0.6 m with 8 red 0xb8343a heads).
   `OutsidePanel.tsx SPECIES_ICON`: three simple paths. Strings: `Fern`/`Feto`,
   `Hydrangea`/`Hortênsia`, `Rose Bush`/`Roseira` (labelOf capitalises each word).
4. `src/view3d/terrain/speciesModels.ts` (new):
   `export const MODEL_SPECIES: Record<string, { height: number; nearM: number }>` =
   lavender 0.6, sunflowers 1.6, 'flowers-mixed' 0.35, 'tall-grass' 0.7, reeds 1.3,
   fern 0.5, hydrangea 0.9, 'rose-bush' 1.0; `nearM: 40` for all.
   `export function isModelSpecies(id)`. `export function speciesTemplates(species): ModelTemplate[] | null`
   using a new export in `registry.ts`: `loadSpeciesTemplates(species)` that reads
   `index.species[species]` and runs the private `loadTemplate` per variant (key
   `species:<id>:<n>`), caching like `templates`; returns `null` until loaded and bumps
   `speciesVersion` (exported counter) when done.
   `export function speciesGeometry(template: ModelTemplate, height: number): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }`:
   merge the template's LOD0 parts into one geometry (`BufferGeometryUtils.mergeGeometries`
   from `three/addons/utils/BufferGeometryUtils.js`, groups kept) scaled so its bounds
   height equals `height`; material = the first part's material clone with `alphaTest 0.5`,
   `side: DoubleSide`.
5. `PlantField`: a batch key `${species}:${variant}:${chunk}`; for model species with
   templates loaded, pick `variant = hash(plant.id) % templates.length`, use
   `speciesGeometry` and a per-variant `MeshStandardNodeMaterial` built from the model
   material plus the same sway `positionNode` (factor the node construction into
   `swayPositionNode(time)`); otherwise the low-poly batch as today. In `update()`, when
   `speciesVersion` changed, `sync(this.terrain)`. Far proxy: chunks whose centre is
   beyond `nearM` from the camera use the low-poly batch (decide per chunk in `update`
   with hysteresis 4 m; rebuild only the chunks that crossed).
6. `content/sources.json`: ≥ 2 variants for each of the 8 species from the `plants`/`flowers`
   listings (`kind: 'model'`, `resolution: '1k'`, `maxTriangles: 8000`, `targets: { species }`,
   `node` when the file lays variants side by side). Log picks in `scripts/content/model-picks.md`
   ("Plant species (r12)"). Without network, list candidates as unverified.

## Tests to add
- `tests/content/contentIndex.test.mjs`: two manifests with `targets.species: 'lavender'`
  produce `index.species.lavender` with 2 entries (keys sorted) and `index.models` unchanged.
- `tests/view3d/speciesModels.test.ts`: `isModelSpecies('lavender')` true, `'oak'` false;
  `MODEL_SPECIES` keys ⊂ `PLANT_SPECIES`; `speciesGeometry(fakeTemplate, 0.6)` bounds height
  0.6 ± 1e-3 and min y ≈ 0 (fake template: one `BoxGeometry(0.2, 2, 0.2)` part);
  `new PlantField().sync(terrainWith(['fern', 'hydrangea', 'rose-bush']))` creates one
  low-poly batch per species (`group.children.length === 3`) and does not throw.
- `tests/model/terrain` (existing) still passes with 20 species; `tests/catalog/catalog.test.ts` unaffected.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/content tests/view3d tests/model tests/i18n` green;
  `node scripts/content/validate.mjs` reports no unknown species.
- `npm run dev` with the current pack: the three new species paint as low-poly plants; with
  content-v4 (Claude verifies) lavender and sunflowers within 40 m are scanned models and
  switch to low-poly beyond.

## Out of scope / forbidden
- No baked impostors for model species (noted above), no wind on model species beyond the
  shared sway, no shadows change.
- Do not edit existing tests or existing strings; the three species labels are new.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not run the content pipeline. Do not commit, push or merge. No new dependencies.
