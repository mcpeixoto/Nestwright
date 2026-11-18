# r14 — Acceptance sheet (before/after SSIM), art bible, perf script

**Epic:** realism **Release:** v0.23.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Every realism brief can be judged the same way. `scripts/visual/shoot.mjs --ref <dir>`
accepts a previous shoot output and renders a before/after contact sheet with a per-view
SSIM score; `docs/ART.md` is the starter art bible (palettes, EV and Kelvin per time of
day, a "what reads fake" checklist); `npm run visual:perf` shoots the aerial view at High
and prints the `perf.report` numbers with a pass/fail against 55 fps.

## Context the implementer needs
- `scripts/visual/shoot.mjs`: `listRefs(dir, outDir)` (l.87) lists `ss_*.jpg` reference
  photos; `shootView` (l.239) writes `<name>.png` and `<name>.json` (`{ view, report }`);
  `main` (l.254) writes `contact.html` via `contactHtml({ shots, refs })` and `summary.json`.
  Screenshots are 1440×900 at `deviceScaleFactor 2` (2880×1800 PNG).
- `scripts/visual/spec.mjs`: `parseArgs` (l.158–201, `--ref` → `opts.ref`), `shotCard`
  (l.216), `contactHtml(input)` (l.241, `input.refs`), `escapeHtml`, `fmt`.
  `scripts/visual/spec.d.mts` declares the exports for TypeScript tests.
- `tests/visual/views.test.ts` imports `contactHtml`, `parseArgs`, `validateViews`; it
  asserts the 12 views and must not change.
- `package.json` scripts: `"visual": "node scripts/visual/shoot.mjs --serve --out visual-out"`.
  `sharp` is a dev dependency (PNG decode). New dev dependency allowed: `ssim.js`
  (`npm i -D ssim.js`; API `ssim(imageA, imageB)` with `{ data: Uint8ClampedArray, width, height }` RGBA).
- `PerfReport` fields (`src/view3d/perfMonitor.ts:6–33`): `fpsAvg`, `p50`, `p95`, `max`,
  `hitches`, `drawCalls`, `triangles`, `gpuMemMB`, `backend`, `width`, `height`, `extra`.
- `docs/perf/phase1-webgpu-high.json` is a past shoot `summary.json` (same shape).
- Owner palette tokens (for ART.md): paper `#F6F1E7`, panel `#FFFDF8`, ink `#2B2620`,
  terracotta `#C8643B`, sage `#6F8F72`; sky targets in
  `src/view3d/atmosphere/skyParams.ts:13–19`; `src/model/sunLook.ts` (`SUN_PEAK_INTENSITY 4.5`,
  exposures) for EV per time of day; lamp Kelvin defaults in `src/catalog/entries/lighting.ts`.

## Steps
1. **Tests first** — `tests/visual/compare.test.ts` (below). Fails.
2. `npm i -D ssim.js` (exact version pinned by npm; commit `package.json` + lock changes in
   the worktree, do not commit to git).
3. `scripts/visual/compare.mjs` (new):
   `export function isShootOutput(dir)` → `existsSync(join(dir, 'summary.json'))`;
   `export function toGrey({ data, width, height, channels })` → `Uint8ClampedArray` RGBA
   grey (SSIM wants RGBA);
   `export function ssimScore(a, b)` → `ssim(a, b).mssim` (0–1) for two `{ data, width, height }`;
   `export async function loadPng(path, maxWidth = 720)` → `sharp(path).resize({ width: maxWidth }).ensureAlpha().raw()`
   → `{ data: Uint8ClampedArray, width, height }` (downscale so SSIM takes < 1 s per view);
   `export async function compareShots(beforeDir, afterDir, names)` →
   `[{ name, ssim, before: 'rel/path.png', after: 'name.png', fpsBefore, fpsAfter }]`
   reading each `<name>.json` for `report.fpsAvg` (null when missing).
   `export function verdict(score)` → `'same'` (≥ 0.98), `'changed'` (≥ 0.85), `'different'`.
4. `spec.mjs`: `contactHtml(input)` accepts `input.pairs` (array from `compareShots`) and
   renders a `<h2>Before / after</h2>` grid of `<figure class="pair">` with both images side
   by side, the view name, `SSIM 0.912 (changed)`, and `fps 61.2 → 58.4`. Keep `refs` as is.
   `shotCard` unchanged. Add `pairs` to `spec.d.mts`.
5. `shoot.mjs main`: after shooting, if `opts.ref && isShootOutput(opts.ref)` then
   `pairs = await compareShots(opts.ref, opts.out, selected.map(v => v.name))`, write
   `compare.json`, pass `pairs` to `contactHtml` and print one line per view
   (`name  ssim  verdict  fps before→after`); otherwise the old `listRefs` path.
   `help()` text: `--ref <dir>  reference photos (ss_*.jpg) or a previous --out folder (before/after SSIM)`.
6. `scripts/visual/perf.mjs` (new): spawn `node scripts/visual/shoot.mjs --serve --views aerial-cutaway --quality high --out <out>`
   (`out = process.argv[2] ?? 'visual-out/perf'`), then read `<out>/aerial-cutaway.json` and
   print a table of `fpsAvg p50 p95 max hitches drawCalls triangles gpuMemMB backend size`
   via `export function perfRow(report)`; `export const PERF_MIN_FPS = Number(process.env.PERF_MIN_FPS ?? 55)`;
   exit 1 with `FAIL aerial-cutaway fpsAvg 51.3 < 55` when under, else `PASS`. Guard the
   spawn behind `if (import.meta.url === pathToFileURL(process.argv[1]).href)` so tests can
   import `perfRow` without launching Chromium.
7. `package.json`: `"visual:perf": "node scripts/visual/perf.mjs"`.
8. `docs/ART.md` starter (≈ 120 lines): sections **Palette** (the owner tokens, the sky
   display targets, lawn `LAWN_ALBEDO (76,112,48)`, roof terracotta albedo `#b85a3c` →
   lit ≈ (165, 85, 60)); **Light by time of day** table: 06:00, 09:00, 12:00, 15:30,
   18:30, 20:50, 22:30 with sun altitude from `sunDirection(172, t, 41.15, 0)`, EV
   (`sunLook(alt).exposure`, state how to read it), sky Kelvin estimate, lamp Kelvin
   (2700 K warm, 4000 K task); **What reads fake** checklist (even gloss, tiled scans,
   black shadows, saturated grass, blue windows, hard sun disc, no grime at floor,
   identical furniture, cards without wind, horizon with no haze); **Acceptance**: the
   harness commands, SSIM verdict meanings, the 55 fps aerial budget and the 1 GB pack budget.
   Values must come from the cited source files, not memory; quote the file for each.

## Tests to add
`tests/visual/compare.test.ts`:
- `ssimScore(img, img) === 1` for a 64×64 RGBA gradient; `ssimScore(img, inverted) < 0.2`;
  `ssimScore(img, slightlyNoisy)` between 0.5 and 0.999.
- `verdict(0.99) === 'same'`, `verdict(0.9) === 'changed'`, `verdict(0.5) === 'different'`.
- `isShootOutput(tmpDirWithSummary)` true, without the file false.
- `contactHtml({ shots: [], pairs: [{ name: 'a', ssim: 0.912, before: 'b/a.png', after: 'a.png', fpsBefore: 61.2, fpsAfter: 58.4 }] })`
  contains `Before / after`, `SSIM 0.912`, `changed`, `61.2 → 58.4`, and both `src` paths escaped.
- `perfRow({ fpsAvg: 61.23, p50: 14.1, p95: 20.5, max: 33, hitches: 2, drawCalls: 1200, triangles: 3_400_000, gpuMemMB: 812.4, backend: 'webgpu', width: 2208, height: 1550 })`
  starts with `fps 61.2` and contains `draws 1200` and `webgpu 2208×1550`.
- `parseArgs(['--ref', 'x'])` still sets `opts.ref === 'x'` (existing behaviour, new test file).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/visual` green; `tests/visual/views.test.ts` unchanged.
- `node scripts/visual/shoot.mjs --help` prints the new `--ref` line.
- With two past shoot folders A and B: `node scripts/visual/shoot.mjs --url http://127.0.0.1:5173 --views living-room --ref A --out B`
  (Claude runs it with a dev server) writes `B/compare.json` and a contact sheet with a pair.
- `npm run visual:perf` (Claude runs it) prints the table and `PASS`/`FAIL`.
- `docs/ART.md` exists with the four sections and cites a source file for every number.

## Out of scope / forbidden
- No pixel-diff images, no CI wiring, no changes to `views.json`.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not start Chromium from tests. Do not commit, push or merge. Only `ssim.js` is new.
