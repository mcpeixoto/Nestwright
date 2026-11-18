# r01 — Albedo quality pipeline (UASTC albedo, 2k fabrics, content-v4)

**Epic:** realism **Release:** v0.22.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Scanned surfaces stop looking blocky up close. Today albedo and ORM are ETC1S
(`--qlevel 192`), a visible quality ceiling on plasters, marbles and fabrics; the 24
fabric/leather/metal sets are only 1k. After this brief the pipeline encodes albedo and
ORM as UASTC, the 24 sets are asked for at 2k, the pack size is measured against a
1 GB budget with an ORM-only ETC1S fallback, and the re-pack (`content-v4`) is
documented so Claude can run it on the Mac. No runtime code changes: the KTX2 loader
transcodes UASTC like any other KTX2.

## Context the implementer needs
- `scripts/content/lib/ktx.mjs:11–25`: `TOKTX_ARGS` and `KTX_CREATE_ARGS` by role
  (`albedo`, `orm`, `normal`, `normalRgb`). `encodeCommand(encoder, role, input, output)`
  throws on an unknown role.
- `scripts/content/lib/textures.mjs:118–164` `processTexture(meta, destDir, options)`:
  the `jobs` list at l.144 names the role per map. `options.encode` is a test stub.
- `scripts/content/process.mjs:19–26` HELP text and `processOne(entry, { webp, library })`
  at l.75; `run()` at l.128 parses `--only`, `--webp`, `--stats` through `parseArgs` in
  `scripts/content/lib/cli.mjs`.
- `scripts/content/pack.mjs`: `--dry-run` only logs the next archive name (l.70–73).
- `scripts/content/lib/lock.mjs`: `nextArchive`, `releaseTag`, `fetchPackPlan`.
- `content/sources.json`: 88 texture entries; the 24 with `"resolution": "1k"` are
  carpet-grey-tex, fabric-linen-tex, fabric-velvet-green-tex, leather-brown-tex,
  metal-black-tex, metal-brass-tex, cork-tex, rattan-tex, boucle-tex, velvet-rust-tex,
  leather-black-tex, copper-tex, walnut-veneer-tex, rug-wool-tex, rug-jute-tex,
  leather-tan-tex, leather-cream-tex, cane-webbing-tex, brass-brushed-tex, steel-black-tex,
  steel-brushed-tex, aluminium-brushed-tex, corten-steel-tex, zinc-roof-tex.
- `scripts/content/README.md` documents the toktx flags (section "Commands" and the
  bullet list below it). `tests/content/pipeline.test.mjs` imports `TOKTX_ARGS`,
  `encodeCommand`, `resolveEncoder`, `parseArgs`.

## Steps
1. **Tests first** — `tests/content/pipeline.test.mjs`, new `describe('texture codecs')`
   (see Tests to add). Run `npm test -- tests/content`; the new cases fail.
2. `scripts/content/lib/ktx.mjs`: change `TOKTX_ARGS.albedo` to
   `['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'srgb']`
   and `TOKTX_ARGS.orm` to the same with `linear`. Add role `ormEtc1s`:
   `['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '255', '--genmipmap', '--assign_oetf', 'linear']`.
   Mirror in `KTX_CREATE_ARGS` (`--encode uastc --uastc-quality 2 --zstd 18`; `ormEtc1s`
   = `basis-lz --clevel 4 --qlevel 255`). Update the header comment (l.6–10).
3. `scripts/content/lib/textures.mjs` `processTexture`: the ORM job uses
   `options.ormRole ?? 'orm'` (l.146). Export `ORM_ROLES = ['orm', 'ormEtc1s']`.
4. `scripts/content/process.mjs`: new flag `--orm-etc1s` (HELP line: "ORM as ETC1S
   qlevel 255 when the UASTC pack is over the 1 GB budget"). Pass
   `{ albedoContrast, ormRole: args.ormEtc1s ? 'ormEtc1s' : 'orm' }` at l.82.
   `parseArgs` turns `--orm-etc1s` into `args.ormEtc1s`; check how `--dry-run` becomes
   `args.dryRun` in `cli.mjs` and follow it.
5. New `scripts/content/lib/packSize.mjs`:
   `export const PACK_BUDGET_BYTES = 1_000_000_000`;
   `export async function dirBytes(dir)` (recursive sum of file sizes);
   `export function roleTotals(files)` → `{ albedo, normal, orm, models, other }` bytes
   from `[{ path, bytes }]` by suffix (`/albedo.ktx2`, `/normal.ktx2`, `/orm.ktx2`,
   `.glb`); `export function overBudget(bytes, budget = PACK_BUDGET_BYTES)`;
   `export function formatBytes(n)` → `"1.23 GB"` / `"456 MB"`.
6. `scripts/content/pack.mjs`: in `--dry-run` also read every `content/manifest/*.json`,
   print `roleTotals` and `dirBytes(paths.output)` with `formatBytes`, and the line
   `budget 1.00 GB: OK` or `budget 1.00 GB: OVER by 120 MB`. Without `--dry-run`, refuse
   (throw) when over budget unless `--allow-oversize` is given.
7. `content/sources.json`: set `"resolution": "2k"` on the 24 entries listed above. Both
   providers publish 2k for every texture in this list (Poly Haven textures ship 1k–8k;
   ambientCG ships 1K–8K JPG). If your sandbox has network, confirm each with
   `curl -s https://api.polyhaven.com/files/<sourceId> | node -e '...'` /
   `https://ambientcg.com/api/v2/full_json?id=<sourceId>&include=downloadData` and revert
   any set without a 2k download. Otherwise write in your summary that the re-pack
   verifies it (`fetch.mjs` throws `has no Diffuse/albedo at 2k`).
8. `scripts/content/README.md`: update the three toktx bullets; add a section
   "Re-pack: content-v4 (run by Claude on the Mac)" with this exact sequence:
   ```bash
   node scripts/content/fetch.mjs            # re-downloads the 24 promoted sets at 2k
   node scripts/content/process.mjs          # UASTC albedo + ORM for all 88 sets
   node scripts/content/validate.mjs && node scripts/content/docs.mjs
   node scripts/content/pack.mjs --dry-run   # prints role totals and the budget line
   # if OVER: node scripts/content/process.mjs --orm-etc1s && node scripts/content/pack.mjs --dry-run
   npm run content:pack                      # writes content-v4.tar.zst and content/lock.json
   gh release upload "$(node -e 'import("./scripts/content/lib/lock.mjs").then(m=>console.log(m.releaseTag("content-v4.tar.zst")))')" content-v4.tar.zst
   ```
   State that `release.sh` needs `npm run content:fetch` afterwards and that a dry run
   must show `budget 1.00 GB: OK` before the tarball is cut.

## Tests to add
`tests/content/pipeline.test.mjs`, `describe('texture codecs')`:
- `TOKTX_ARGS.albedo` contains `'uastc'`, `'--uastc_quality', '2'`, `'--zcmp', '18'`,
  `'--assign_oetf', 'srgb'` and not `'etc1s'`; `TOKTX_ARGS.orm` likewise with `'linear'`.
- `TOKTX_ARGS.ormEtc1s` contains `'etc1s'` and `'--qlevel', '255'`.
- `encodeCommand({ bin: 'ktx', kind: 'ktx' }, 'ormEtc1s', 'in.png', 'out.ktx2').args`
  contains `'basis-lz'` and `'255'`; role `'bogus'` throws `/unknown texture role/`.
- `roleTotals([{ path: 'textures/a/albedo.ktx2', bytes: 10 }, { path: 'textures/a/orm.ktx2', bytes: 5 }, { path: 'models/b/b.glb', bytes: 7 }])`
  equals `{ albedo: 10, normal: 0, orm: 5, models: 7, other: 0 }`.
- `overBudget(1_000_000_001)` true, `overBudget(1_000_000_000)` false;
  `formatBytes(1_234_000_000)` is `'1.23 GB'`.
- `parseArgs(['--orm-etc1s'])` sets the flag true (same style as the `--stats` case at
  l.110 of `tests/content/contentIndex.test.mjs`).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/content` green.
- `node scripts/content/pack.mjs --dry-run` with no `public/content` prints the existing
  "does not exist; run process first" error (unchanged behaviour).
- `node -e 'import("./scripts/content/lib/ktx.mjs").then(m=>console.log(m.TOKTX_ARGS.albedo.join(" ")))'`
  prints `--t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --assign_oetf srgb`.
- `node -e 'const d=JSON.parse(require("fs").readFileSync("content/sources.json","utf8"));console.log(d.entries.filter(e=>e.kind==="texture"&&e.resolution==="1k").length)'`
  prints `0`.

## Out of scope / forbidden
- Do not run `fetch.mjs`, `process.mjs` or `pack.mjs` for real (no KTX-Software, no
  network pack). Claude runs the re-pack.
- Do not edit existing tests or user-facing strings. Do not change `INDEX_VERSION`,
  `src/materials/*`, or `content/lock.json`.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
