# r03 — Paint finishes (matte / eggshell / satin) with plaster breakup

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude (steps 2–3 are data a grok run may do first)
**Depends on:** r02 merged first (both edit `applyPbrMaps`)
**Time box:** ≤ 20 min of agent work

## Goal
Painted walls read as paint, not flat colour: every `paint-*` material (and the plasters,
which are painted plaster) has a finish — `matte`, `eggshell` or `satin` — with roughness
0.85 / 0.6 / 0.35, and borrows the white-plaster scan's normal and roughness variation at
20 % strength so light rakes across it. The paint brush in the inspector gets a **Finish**
select. A finish stored on a `MaterialRef` overrides the library default.

## Context the implementer needs
- `src/materials/library.ts:43–45, 73–74`: the five paints (`paint-sage`, `paint-terracotta`,
  `paint-navy`, `paint-ochre`, `paint-charcoal`), flat colour, roughness 0.5–0.55, no
  scan (`NO_SCAN` only lists glass/mirror; paints simply have no `content/sources.json`
  entry). Plasters: `plaster-white`, `plaster-warm`, `plaster-pink`, `render-stucco`,
  `lime-plaster` (all scanned).
- `src/materials/materialCache.ts`: `materialCacheKey` (l.30), `getMaterial` (l.157),
  `requestPbr` (l.145), `applyPbrMaps` (l.119), `PbrSource` (l.92).
- `src/materials/pbrTextures.ts`: `loadPbrMaps(materialId, scale)`, `packedNormalNode`,
  `PbrMaps.info.meanOrm` (`[ao, roughness, metalness]`).
- `src/model/types.ts:18–25` `MaterialRef`. `src/io/migrate.ts` comment block says optional
  fields load unchanged (Budget.overrides, Project.brief): follow that convention.
- Paint inspector: `src/ui/inspector/sections/paint.tsx` (`MaterialPicker value={brush} onChange={setPaintBrush}`),
  brush state in `src/tools/paint.ts` (`paintBrush`, `setPaintBrush`).
- Strings: `src/i18n/en.ts` + `src/i18n/pt.ts` (European Portuguese);
  `tests/i18n/coverage.test.ts` fails on a missing key. `T` component and `useTranslate`.
- `tests/builders/facadeWeathering.test.ts:43` asserts `materialCacheKey({ id: 'brick-red' }, { facade: true }) === 'brick-red||1|facade|outdoor'`: the key must not change when no finish is set.

## Steps
1. **Tests first** — `tests/materials/paintFinish.test.ts` (see below). Fails.
2. `src/materials/library.ts`: `export type PaintFinish = 'matte' | 'eggshell' | 'satin'`;
   `export const PAINT_FINISH_ROUGHNESS: Record<PaintFinish, number> = { matte: 0.85, eggshell: 0.6, satin: 0.35 }`;
   `export const PAINT_FINISHES: PaintFinish[] = ['matte', 'eggshell', 'satin']`;
   `MaterialDef.finish?: PaintFinish`. Defaults: paint-sage eggshell, paint-terracotta
   eggshell, paint-navy satin, paint-ochre eggshell, paint-charcoal satin; plaster-white,
   plaster-warm, plaster-pink matte; render-stucco, lime-plaster matte.
   `export function paintable(def: MaterialDef): boolean` = `def.category === 'Paint' || def.category === 'Plaster'`.
   `export function finishOf(def, ref?: { finish?: PaintFinish }): PaintFinish | null` =
   `paintable(def) ? ref?.finish ?? def.finish ?? 'matte' : null`.
   `export function paintRoughness(def, ref?)` = `PAINT_FINISH_ROUGHNESS[finishOf]` or `def.roughness`.
3. `src/model/types.ts` `MaterialRef`: `/** Paint finish; absent means the library default. */ finish?: 'matte' | 'eggshell' | 'satin'`.
   `src/io/migrate.ts`: add one line to the doc comment: "Optional MaterialRef.finish:
   absent means the library default finish." No `PROJECT_VERSION` bump (optional field,
   repo convention).
4. `src/materials/materialCache.ts`: `materialCacheKey` appends `|${ref.finish}` only when
   `ref?.finish` is set and the def is paintable:
   `${id}|${tint}|${scale}${finish ? '|' + finish : ''}${suffix}`. `baseKey` is suffix-based
   and keeps working. In `getMaterial`, after the special cases: `mat.roughness = paintRoughness(def, ref)`
   for paintable defs. Add `finish` to `PbrSource`.
5. Paint breakup. In `getMaterial`, for `def.category === 'Paint'` (no scan of its own),
   call `requestPbr(mat, { def, scale, tint, roughness, metalness, finish, breakupFrom: 'plaster-white' })`.
   `requestPbr` loads `loadPbrMaps(source.breakupFrom ?? source.def.id, scale)`. In
   `applyPbrMaps`, when `source.breakupFrom` is set, call `applyPaintBreakup` instead:
   keep `mat.map` (procedural) and `mat.color`; `normalNode = packedNormalNode(maps.normal, 0.2 * (maps.info.normalScale ?? 1), { detail: true })`;
   `roughnessNode = float(target).mul(mix(1, texture(orm).g.div(meanOrm[1] || 0.5), 0.2))`
   where `target = paintRoughness(def, ref)`; `mat.roughnessMap = null`; set
   `userData.scanned = 'plaster-white'`. Export `PAINT_BREAKUP = 0.2`.
6. `src/ui/inspector/sections/paint.tsx`: when `getMaterialDef(brush.id)` is paintable,
   render `<label className="field"><T k="Finish" /><select value={finishOf(def, brush)} onChange=…>`
   with options `Matte`, `Eggshell`, `Satin`, writing `setPaintBrush({ ...brush, finish })`.
7. Strings in `en.ts` and `pt.ts`: `Finish: 'Finish'` / `'Acabamento'`, `Matte` / `'Mate'`,
   `Eggshell` / `'Casca de ovo'`, `Satin` / `'Acetinado'`.

## Tests to add
`tests/materials/paintFinish.test.ts`:
- `paintRoughness(getMaterialDef('paint-navy')!)` is `0.35`; with `{ finish: 'matte' }` is `0.85`;
  `paintRoughness(getMaterialDef('oak-planks')!, { finish: 'satin' })` is `oak-planks.roughness` (ignored).
- `finishOf(getMaterialDef('plaster-white')!)` is `'matte'`; `finishOf(getMaterialDef('marble')!)` is `null`.
- `materialCacheKey({ id: 'paint-sage', finish: 'satin' })` is `'paint-sage||1|satin'`;
  `materialCacheKey({ id: 'paint-sage' })` is `'paint-sage||1'`;
  `materialCacheKey({ id: 'oak-planks', finish: 'satin' })` is `'oak-planks||1'`.
- `getMaterial({ id: 'paint-sage', finish: 'satin' })` and `getMaterial({ id: 'paint-sage' })`
  are different objects with roughness 0.35 and 0.6.
- `applyPbrMaps` with a `PbrSource` whose `breakupFrom = 'plaster-white'` and fake maps
  (`info.meanOrm = [1, 0.5, 0]`, `normal` a `THREE.Texture`) leaves `mat.map` as it was,
  sets `normalNode` and `roughnessNode`, and `roughnessMap` null.
- Every paint and plaster def has `finish` in `PAINT_FINISHES`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/materials tests/builders tests/i18n tests/view3d/litColour` green
  (`litColour.test.ts` uses `plaster-white.color` only; the roughness change does not touch it).
- `npm run dev`: paint tool → pick "Sage paint" → Finish select shows Eggshell; switch to
  Satin, paint a wall: it shows a soft highlight and faint plaster relief near a window.
- Harness `living-room` before/after shots attached in the summary.

## Out of scope / forbidden
- No new paint colours, no per-wall finish UI beyond the brush (the brush writes `finish`
  into the `MaterialRef` it paints).
- Do not edit existing tests. Only the four listed strings are new.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
