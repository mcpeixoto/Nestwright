# c09 — Scanned models wave 2: ~40 Poly Haven CC0 picks, content-v4

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium (steps 1–5: picks, `sources.json`, picks log, `thumbnail` flags, thumbnail code); **claude runs steps 6–8** (download, pack, release)
**Depends on:** c01 (`thumbnail` field), c04, c05, c06, c07, c11 (new ids to match)
**Time box:** ≤ 20 min of agent work for steps 1–5

## Goal
About 40 more catalog entries show a scanned CC0 model in 3D, including the new appliances,
bathroom, kids, hall, storage and lighting pieces. Entries that have a model show it on their
library card instead of the procedural box. The pack moves to `content-v4`.

## Context the implementer needs
- Pipeline: `scripts/content/README.md`; `content/sources.json` is `{ "entries": [...] }` with
  23 `kind: "model"` entries today (format: `{"key":"<sourceId with -> and -model","kind":"model","provider":"polyhaven","sourceId":"modern_coffee_table_01","resolution":"1k","licence":"CC0","rotateY":90,"targets":{"catalogId":"coffee-table"},"notes":"…"}`;
  optional `units`, `node`, `maxTriangles`, `dropMaterials`).
- Validation: `scripts/content/lib/ids.mjs` greps `id: '…'` in `src/catalog/entries/*.ts`; a
  `catalogId` not found fails `node scripts/content/validate.mjs`. `scripts/content/lib/licence.mjs`
  accepts only `CC0` / `CC-BY-4.0`.
- Pick log: `scripts/content/model-picks.md` — sections "Picks with a caveat" (line 12),
  "Rejected candidates" (31), "Catalog ids with no Poly Haven match" (83). Rule in the header:
  aspect (w/h, d/h, w/d against `defaultSize`) rejected when > ~35 % off; furniture ≤ 30k tris
  (`maxTriangles: 30000` caps larger ones). Facing: width along +X, front toward +Z; `rotateY`
  0/90/180/270 fixes models that do not.
- Poly Haven API: `https://api.polyhaven.com/assets?t=models` returns an object keyed by id with
  `categories`, `dimensions` ([x, y, z] in mm, z up), `tags`. Filter `categories` for
  `furniture`, `appliances`, `lighting`, `decorative`. `https://api.polyhaven.com/info/<id>`
  gives the licence (`"CC0"`). Use `curl -s` into the scratchpad; never commit the dumps.
- Already picked (skip): sofa-3, armchair, armchair-wingback, ottoman, coffee-table, side-table,
  nightstand, tv-unit, shelving-unit, clock, vase, round-table, dining-chair, bar-stool,
  dining-island-stool, pendant-lamp, chandelier, wall-sconce, bench-garden, plant-pot, monstera, cactus.
- Thumbnails: `src/catalog/thumbnails.ts:74-110` `renderOne` always calls `entry.build`.
  Models: `src/catalog/models/index.ts` exports `modelFor(catalogId)` (null until loaded),
  `subscribeModels(listener)`, `buildModel(template, size, lamp=false)`; `forgetThumb(id)` is at
  thumbnails.ts:135.
- Lock: `content/lock.json` is `{"version":3,"tarball":"content-v3.tar.zst",…}`; `npm run content:pack`
  writes the next one; `npm run content:fetch` downloads the GitHub release `content-vN` (`fetch-pack.mjs:77`).

## Steps
1. Survey (no commit): `curl -s 'https://api.polyhaven.com/assets?t=models' > <scratchpad>/ph-models.json`.
   With a `node -e` script, join each model's `dimensions` against every catalog `defaultSize`
   (`node --input-type=module -e` importing nothing from `src`: parse `defaultSize: { w: …, d: …, h: … }`
   by regex from `src/catalog/entries/*.ts`, paired with the preceding `id: '…'`). Print candidates
   with all three ratios within 35 % and tags/categories fitting the id, ordered by ratio error.
2. Pick exactly one model for each of up to 40 ids, prioritising in this order: the 47 new ids
   from c04–c07 and c11, then `bed-double`, `bed-single`, `desk`, `office-chair`, `dining-table`, `tv`,
   `fridge-tall`, `washing-machine`, `freestanding-tub`, `washbasin`, `toilet`, `floor-lamp`,
   `table-lamp`, `books`, `candles`, `cushion`, `mirror-round`, `fiddle-leaf`, `olive-tree-pot`.
   Reject ornate/period pieces (the log's existing rejections show the taste). Record the real
   licence from `/info/<id>` — must be `CC0`.
3. `content/sources.json` — append one model entry per pick after the last existing model entry,
   `resolution: "1k"`, `notes` with the style caveat, `rotateY` when the long side is not along X,
   `maxTriangles: 30000` when the source is larger (the API `files` list is not needed: set it when
   `dimensions`-based guess is a dense asset such as plants). Keys: `<sourceId with _→->-model`.
4. `scripts/content/model-picks.md` — add a section `## Wave 2 (R5)` before "Rejected
   candidates" with a table `| catalog id | Poly Haven id | ratios w/h d/h w/d | caveat |`, move
   matched ids out of "Catalog ids with no Poly Haven match", and append new rejections with reasons.
5. Code:
   - For every id picked in step 2 **and** every id already in sources.json, add `thumbnail: 'model',`
     to its entry in `src/catalog/entries/*.ts` (45 ± entries).
   - `src/catalog/thumbnails.ts` `renderOne` (line 74): after `const entry = getEntry(id)`, do
     `const template = entry?.thumbnail === 'model' ? modelFor(id) : null`; when `template` is
     non-null, `built = buildModel(template, entry.defaultSize, !!entry.light)` instead of
     `entry.build(...)`. Import `buildModel`, `modelFor`, `subscribeModels` from `'./models'`.
     At module scope add `subscribeModels(() => { for (const id of [...thumbs.keys()]) if (getEntry(id)?.thumbnail === 'model' && modelFor(id)) { forgetThumb(id); requestThumb(id) } })`
     so cards rendered before the pack loaded are redrawn once.
   - `tests/catalog/thumbnailModel.test.ts` (new): with `vi.mock('../../src/catalog/models', …)`
     returning a `modelFor` that yields a stub template for `'coffee-table'` and a `buildModel`
     spy, call the internal render path through `requestThumb('coffee-table', true)` as
     `tests/ui/lazyThumbs.test.ts` does and assert `buildModel` was called once and `entry.build`
     was not (spy on `getEntry('coffee-table')!.build`). Then assert `getEntry('sofa-3')!.thumbnail === 'model'`
     and `getEntry('kitchen-run')!.thumbnail` is undefined.
6. (claude) `npm run content:build` — fetch, process, validate, docs. Fix any validation error by
   editing the offending sources entry. Review the contact sheet `public/content/` thumbnails if
   `scripts/visual` offers one; otherwise open 6 random models in the app.
7. (claude) `npm run content:pack` → `content/lock.json` says `content-v4.tar.zst`; create the GitHub
   pre-release `content-v4` with the tarball attached, then `npm run content:fetch` from a clean
   `public/content` proves the download path. `docs/ASSETS.md` content-pack table is regenerated
   by `docs.mjs`; check the row count grew by the number of picks.
8. (claude) Commit `content/sources.json`, `content/lock.json`, `docs/ASSETS.md`,
   `scripts/content/model-picks.md`, the code, the tests. No binaries.

## Tests to add
- `tests/catalog/thumbnailModel.test.ts` — step 5.
- `tests/content/pipeline.test.mjs` already validates `sources.json` shape; it must stay green.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/content tests/ui` green.
- `node -e "const s=require('./content/sources.json');console.log(s.entries.filter(e=>e.kind==='model').length)"` prints ≥ 60.
- `node scripts/content/validate.mjs` exits 0 (claude, after build).
- In the app with the pack, the Appliances tab shows photographic cards for picked entries and
  procedural ones for the rest; `console.log` says `content pack: N texture sets`.

## Out of scope / forbidden
- No CC-BY, NC, ND or SA. No binaries in git. No Sketchfab.
- Do not change `modelFit.ts` tolerances or the pipeline scripts.
- Do not edit existing tests or user-facing strings. Grok does not run `content:build`/`pack`.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
