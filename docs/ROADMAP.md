# Roadmap to a sellable Nestwright (v0.16 → v0.23, then Steam)

Written 2026-11-18 after v0.15.0. This is the master list of everything still missing
before the game is worth putting in front of strangers, broken into briefs that a less
capable model can implement one at a time. Each brief lives in `docs/briefs/` and follows
`docs/briefs/README.md`. `docs/STEAM.md` and `~/.claude/plans/swirling-doodling-honey.md`
hold the Steam calendar; this file is about the product.

## Where we are

Works today: plan editor with exact sizes, levels, roofs, stairs, openings; 3D and walk
views on a WebGPU renderer with GTAO/SSR/TRAA, probe bounce light, metered exposure,
cascaded sun shadows; 99 library materials (88 scanned CC0 sets); 115 furniture entries
(22 with scanned models); tracing, PDF plan export, budget with quotes, variants, co-op
over LAN, 12 House Briefs, achievements, sound and ambience, photo-to-3D furniture;
PT/EN; signed Mac build, Win/Linux cross-builds, Steam bridge.

Owner verdict after v0.15.0: textures still not realistic enough, many bugs, furniture
range too small, functionality missing, UI not usable by a "normal Joe", no menu.

## Owner decisions (2026-11-18)

| Question | Decision |
|---|---|
| What ships first | UI + main menu, then bugs, catalog, features, realism |
| Catalog growth | Both: scanned CC0 models for hero pieces, parametric generators for sized pieces |
| Features for v1 | Per-item colour/material; roofs, plots, terrain; kitchen/bath/wardrobe designer |
| Bug areas seen | Wall/room editing; camera and 3D navigation; furniture placing |
| UI direction | Warm, light, cozy (cream panels, rounded, soft shadows, fewer bigger controls); dark stays as "Night" |

## Principles

1. **Player first.** Every release must be playable by someone who has never seen the
   editor: open the app → main menu → new house → draw a room → add a sofa → look at it
   in 3D, with no docs.
2. **Briefs, not vibes.** Work is cut into ≈20-minute briefs with tests first and an
   acceptance command. Claude orchestrates, reviews, gates, merges, releases. Grok (or an
   Opus subagent) implements. See `docs/briefs/README.md`.
3. **Nothing lands without a live check.** Each release: gate green → merge → tag →
   `npm run content:fetch` → `dist:mac` → install → smoke → contact sheet to the owner.
4. **Strings and existing tests are Claude's.** Grok adds; it never edits.
5. **Perf budget is a gate:** High tier ≥ 55 fps on the aerial harness view on a quiet M4,
   Medium ≥ 60 fps indoors; content pack ≤ 1 GB; installed ≤ 2 GB.

## Release train

| Release | Theme | Briefs | Player-visible result |
|---|---|---|---|
| v0.16.0 | UI 1: cozy theme, main menu, pause menu, save feedback, settings | u01–u05 | Launch into a real menu; Esc pauses; "Saved · 14:02"; Settings has tabs |
| v0.17.0 | UI 2: editor chrome, library, onboarding, plain language | u06–u14 | ≤7 top-bar controls, labelled rail, one bottom bar, cards inspector, coach marks |
| v0.18.0 | Bugs: wall joins, rooms, camera, placing, hitch | b01–b06 | Walls join, rooms survive, walk mode collides, placing snaps predictably |
| v0.19.0 | Catalog: fields, 5 new categories, +53 procedural, +40 scanned, 6 lamps, dress room | c01–c11 | ~210 items in 16 categories, "Dress room" button |
| v0.20.0 | Features 1: colour/material, kitchen/bath/wardrobe designer | f01–f08 | Swatch picker, tints, presets, cabinet runs along walls |
| v0.21.0 | Features 2: cross-gable roofs with valleys, plot editing, slopes, sculpt v2 | f09–f13 | Roofs on L/T houses with valleys, editable plot with setbacks, sloped gardens |
| v0.22.0 | Realism indoors: texture quality, anti-tiling, paints, fabrics, glass, doors | r01–r08 | Textures stop looking tiled and flat; windows reflect and transmit |
| v0.23.0 | Realism outdoors: grass, set dressing, ground scans, plants, sky | r09–r14 | Garden stops looking computer-made |
| v0.24.0+ | Steam track (controller/Deck, Windows test, store art, playtest) | see plan file | Coming Soon page, playtest, demo |

Two releases may overlap when their briefs touch different files (e.g. catalog data
briefs during the UI 2 release). Never two writers on the same file.

### Acceptance per release

Every release: `npm run typecheck && npm run lint && npm test && npm run build` green in CI,
e2e (`npx playwright test`) green locally on `webgpu` and `webgl`, contact sheet from
`scripts/visual/shoot.mjs` reviewed, perf budget met, installed app smoke-checked.

Release-specific:
- **v0.16.0:** first-run script (menu → blank house → room → sofa → 3D) completes with no
  console errors; axe AA contrast passes on menu and editor; both themes screenshot.
- **v0.17.0:** top bar ≤ 7 controls at 1280×720; every control has a tooltip from
  `Tooltip.tsx`; `tests/e2e/layout.spec.ts` screenshots at 3 viewports × 2 languages.
- **v0.18.0:** `docs/BUGS.md` has zero open rows in the three owner areas; the bash specs
  pass; single wall drag < 16 ms on a 20-wall level (`window.perf.report`).
- **v0.19.0:** `listEntries().length ≥ 200`; every entry builds at 3 sizes; every entry has
  en+pt; ≥ 60 entries use scanned models; content-v4 fetched by the release build
  (`smoke` log says "content pack: … texture sets" and "… furniture models").
- **v0.20.0:** a kitchen run of 6 modules along a 3.6 m wall builds, renders, costs; swatch
  picker changes any slot; tint survives save/load.
- **v0.21.0:** cross-gable roof on an L-shaped house renders with valleys and gutters; a 12 % slope plot shows
  a cut platform; sculpt stroke is one undo step.
- **v0.22.0:** contact sheet critique has no "tiled" or "flat" notes on indoor views;
  `litColour.test.ts` still passes; High ≥ 55 fps aerial.
- **v0.23.0:** outdoor views critique has no "computer-made" notes; grass, flowers and
  props visible in `garden-wide`, `terrace-pool`.

## Epics and briefs

Index tables below are generated from the brief files; the brief is the source of truth.

### U — UI shell (v0.16.0, v0.17.0)

| id | title | release | owner model | depends on | scope |
|---|---|---|---|---|---|
| u01 | Design tokens and the cozy light theme | v0.16.0 | grok-4.7-medium | none | Cozy palette + spacing/radius/shadow/type tokens, `data-theme="cozy|night"` from a `theme` setting, merged duplicate CSS and breakpoints, shared `breakpoints.ts`, bundled Fraunces (OFL) for headings |
| u02 | Start screen becomes a main menu | v0.16.0 | grok-4.7-medium | u01 | `MainMenu.tsx`: Continue, New house → Blank / From template / From brief, Open…, Settings, Credits, Quit; recents; "Continue" keeps its name for e2e |
| u03 | Pause menu on Escape | v0.16.0 | grok-4.7-medium | u02 | Escape order selection → Select tool → `PauseMenu` (Resume, Save, Save as…, Open…, New house, Settings, Help, Main menu, Quit); shortcuts blocked while paused |
| u04 | Save feedback: one toast host, saved state in the top bar | v0.16.0 | grok-4.7-medium | u01 | `src/ui/toast/` host with actions, `savedAt`, "Saved · 14:02" / "Autosaved" / "Opened name" toasts, "Unsaved changes" / "Saved ✓" in the top bar |
| u05 | Settings grouped into tabs, reset, one units setter | v0.16.0 | grok-4.7-medium | u01 | Tabs General/Graphics/Controls/Sound/Advanced, slider readouts, `resetSettings()`, `settings/units.ts setUnits` shared by Settings and the status bar, help text |
| u06 | Top bar: seven controls, three menus, one tooltip system | v0.17.0 | claude | u04, u05 | Plan/3D/Walk + Plan + 3D toggle + Undo/Redo, `Plan ▾` / `Share ▾` / `☰` via `DropMenu.tsx`, zero `title=` in src/ui; rewrites topBar.test.tsx, edits planPdf.spec.ts |
| u07 | Tool rail: labels on, plain groups, click-to-open, closable panels | v0.17.0 | grok-4.7-medium | u06 | `railLabels` default true, groups Select/Build/Doors & windows/Furniture/Paint/Garden/Measure, no hover flyouts, `libraryOpen` removed, PanelSlot close × |
| u08 | One bottom bar | v0.17.0 | grok-4.7-medium | u05, u06 | `BottomBar.tsx` replaces LevelBar + StatusBar: floor chips + `+` menu, Show ▾, Roof, Snap ▾, m/ft, areas, `☀ HH:MM` chip opening Daylight; unit-aware elevation |
| u09 | Inspector cards and unit-aware fields | v0.17.0 | claude | u06 | Collapsible `InspectorCard` per registry title, `AngleField`/`PercentField`, 37 of 41 `NumberField` sites converted, "Rooms" summary card on empty selection |
| u10 | Library: icon tabs, global search, favourites, recents, scanned thumbnails | v0.17.0 | grok-4.7-medium | u06, u07 | Icon tabs, `searchEntries` across categories, `Add your own ▾`, card-size toggle, Favourites/Recently used in `nestwright:library`, thumbnails from `modelFor` templates |
| u11 | Onboarding v2: anchored coach marks | v0.17.0 | grok-4.7-medium | u02, u06, u07 | `CoachMark.tsx` pinned to `data-tour` anchors with Next/Back/Skip and dots; tour armed only by blank new house or replay |
| u12 | Plain-language renames (en + pt) | v0.17.0 | claude | u05–u09, u11 | Rename table (Joints→Walls, Slab→Floor slab, Plot→Garden boundary, Sculpt→Shape ground, Calibrate trace→Set scale, Variants→Options A/B, Wishes→Wish list, Together→Play together, Render scale→Resolution, Advanced labels); lists every test edited |
| u13 | Layout e2e matrix: three viewports, two languages, contrast check | v0.17.0 | grok-4.7-medium | u08, u09 | Playwright projects 1280/1440/2560, `tests/e2e/layout.spec.ts` en+pt screenshots, `@axe-core/playwright` contrast on menu and chrome, `npm run test:layout` |
| u14 | Electron menu: localized labels, Help menu, Fullscreen setting | v0.17.0 | grok-4.7-medium | u03, u05, u11 | Pure `electron/menuLabels.ts`, Help menu Tutorial/Shortcuts/Credits/Achievements, `fullscreen` setting mirrored with the window, pause-menu Quit through the dirty guard |

### B — Bugs (v0.18.0)

| id | title | release | owner model | depends on | scope |
|---|---|---|---|---|---|
| b01 | Bug-bash harness | v0.18.0 | grok-4.7-medium | none | `tests/e2e/bash/*.spec.ts` + `harness.ts` driving walls/camera/placing via real clicks and `window.__nestwright`; soft checks append rows to `docs/BUGS.md`; ignored by CI, run with `npm run test:bash` |
| b02 | Wall joins and room detection | v0.18.0 | grok-4.7-high | b01 | `MERGE_SNAP = 0.05` endpoint pull in `addWallChain`, T-junction split within 5 cm, `splitWall` keeps openings, collinear duplicate segments deduped in `rooms.ts`; two new model tests |
| b03 | Wall-edit hitch: per-wall diffing | v0.18.0 | claude | none | Pure `wallDiff.ts` (changed wall + joint neighbours + openings), `Map<wallId, Object3D[]>` in `SceneController.reconcile`, per-entity maps in `layers/structure.ts`, `structuralRebuildMs` perf extra; < 16 ms per drag |
| b04 | Camera: walk capsule and orbit clamping | v0.18.0 | grok-4.7-high | none | Walk capsule r 0.3 / h 1.7, `headroom.ts` (slabs, stair undersides, wall cabinets), `orbitClamp.ts` (target inside level bounds, eased level change) |
| b05 | Placement snapping | v0.18.0 | grok-4.7-medium | c01 (optional) | Snap hysteresis enter 0.12 / leave 0.2, red ghost on overlap and refuse, drop onto table tops, one undo step per placement |
| b06 | Debt cleanup | v0.18.0 | grok-4.7-medium | b01 | `newProject` confirm only when dirty, dirty-checked AO uniforms, pink-noise rain bed, `PHASE1-PORT` markers resolved, `docs/BUGS.md` Fixed section |

### C — Catalog (v0.19.0)

| id | title | release | owner model | depends on | scope |
|---|---|---|---|---|---|
| c01 | Catalog entry fields: surface, roomTags, presets, thumbnail | v0.19.0 | grok-4.7-medium | none | Four optional `CatalogEntry` fields, `pendant-lamp` gets `mount: 'ceiling'`, pure `src/model/surfaces.ts` so drops on a `surface` item land on its top; 20 entries get `surface` |
| c02 | Catalog names keyed by id (`catalog.<id>`) | v0.19.0 | claude | none | Every entry resolves `catalog.<id>` in en/pt (95 new keys), English-name keys deleted unless used elsewhere |
| c03 | New library categories: appliances, kids, laundry, hall, storage | v0.19.0 | grok-4.7-medium | none | `CATEGORIES` += 5, moves fridges/hood/microwave/coffee machine → appliances and washer/dryer → laundry, `category.*` strings, SVG tab icons |
| c08 | Parametric families: cabinet, shelf unit, bed, sofa | v0.19.0 | grok-4.7-medium | none (run before c04–c07) | `src/catalog/families/*` generators with typed options, bounds tests at 3 sizes; existing entries untouched |
| c04 | Appliances: 12 procedural entries | v0.19.0 | grok-4.7-medium | c02, c03, c08 | `entries/appliances.ts`: dishwasher, single oven, hob, range cooker, island hood, sink units, fridge-freezer, under-counter fridge, wine fridge, washer-dryer, chest freezer; sizes, prices, slots, recipes, en/pt |
| c05 | Bathroom: 10 procedural entries | v0.19.0 | grok-4.7-medium | c02, c08 | bidet, mirror cabinet, towel rail, shelf, vanity unit (width enum), corner shower, shower screen, corner bath, roll holder, laundry basket |
| c06 | Kids, laundry and hall: 16 procedural entries | v0.19.0 | grok-4.7-medium | c02, c03, c08 | New `kids.ts`, `laundry.ts`, `hall.ts` (6 + 4 + 6) with wall mounts and family reuse |
| c07 | Storage and office: 9 procedural entries | v0.19.0 | grok-4.7-medium | c02, c03, c08 | `storage.ts` (modular wardrobe, open bookcase, garage shelving, bike rack, tall cupboard) + office printer, tall bookshelf, monitor-arm desk, pedestal drawers |
| c11 | Lighting: 6 procedural lamps | v0.19.0 | grok-4.7-medium | c02 | desk lamp, tripod floor lamp, picture light, linear pendant, under-cabinet light, ceiling fan light with lumens/kelvin |
| c09 | Scanned models wave 2: ~40 Poly Haven CC0 picks, content-v4 | v0.19.0 | grok (picks, sources, thumbnails) / claude (pack, release) | c01, c04–c07, c11 | API survey by aspect ratio, model entries appended to `content/sources.json`, wave-2 picks log, library cards render the model when loaded, `content-v4` pack and `docs/ASSETS.md` regen |
| c10 | Dress room: one-click props on surfaces and in corners | v0.19.0 | grok-4.7-medium | c01, c05, c06 | Pure `src/model/dress.ts` with deterministic rules and the 1-per-1.5 m² cap, stable ids, `Item.prop` excluded from budget until edited, "Dress room" button, `roomTags` on ~25 entries |

### F — Features (v0.20.0, v0.21.0)

| id | title | release | owner model | depends on | scope |
|---|---|---|---|---|---|
| f01 | Material swatch picker: grid, search, recent | v0.20.0 | grok-4.7-medium | none | `SwatchPicker.tsx` inside `MaterialPicker` (API unchanged): 48 px pattern swatches, category groups, search, "Recent" in localStorage |
| f02 | Colour tint: hue and lightness for paint, fabric and leather | v0.20.0 | grok-4.7-medium | f01 | Pure `src/model/tint.ts` mirroring the `albedoTint` clamps, hue + brightness sliders and "Reset colour" only for tintable categories |
| f03 | Colourway presets, favourites, "Apply to all" | v0.20.0 | grok-4.7-medium | c01, f01 | `presets` on 8 entries, chips on library cards and in the inspector, favourites in localStorage, `applyMaterialsToAll` |
| f04 | Copy style / Paste style (eyedropper) | v0.20.0 | grok-4.7-medium | none | Pure `src/model/style.ts`, alt+C / alt+V, buttons in item/wall/multi sections, one undo step |
| f05 | Built-in run model | v0.20.0 | grok-4.7-high | none | `Level.runs?: BuiltinRun[]` (kitchen/wardrobe/vanity, wall, start/end, side, modules, worktop, plinth), `src/model/builtins.ts` with a 15 cm grid and `layoutRun`, `PROJECT_VERSION 2` + migration, runs carried through `splitWall`/`deleteEntities` |
| f06 | Kitchen designer UI | v0.20.0 | grok-4.7-medium | f05, c08, b03 | `src/tools/run.ts` (drag along a wall, shortcut K), plan layer `runs`, inspector `sections/run.tsx` (module list, type, worktop, handle, plinth), `src/builders/runs.ts` on the cabinet family, runs selectable |
| f07 | Wardrobe designer | v0.20.0 | grok-4.7-medium | f06 | `BuiltinRun.wardrobe` (full height, hinged/sliding/mirror doors, interior layout), run-kind picker, wardrobe branch of the builder with an open-door interior preview |
| f08 | Bathroom helper | v0.20.0 | grok-4.7-medium | f06, f07 | Vanity run branch (basins, taps, 0.85 m worktop) and pure `suggestBathroom` (toilet 0.4 m side / 0.6 m front, 0.9 m shower in the far corner, vanity on the longest door-free wall, door swings respected); "Arrange bathroom" button |
| f09 | Roof types model: cross-gable and edge classification | v0.21.0 | claude | none | `Roof.shape` already has flat/shed/gable/hip/mansard/dome; adds `cross-gable` (straight skeleton, L/T footprints, valleys), `roofEdges()` ridge/hip/valley/eave/verge, slope and surface area; no migration |
| f10 | Roof builder: valleys, gable infill, plan overlay | v0.21.0 | claude | f09 | Recessed valley flashing, gable infill in the exterior wall material, plan overlay (solid ridges, dashed hips/valleys, eaves), `Cross-gable` in the inspector plus a roof-area readout |
| f11 | Plot boundary editing | v0.21.0 | grok-4.7-medium | none | Pure `plotEdit.ts` (nearest edge, insert/remove corner, setback ring, corner snap), double-click add/remove, one undo per drag, live area, `plotSetback` setting (3 m) drawn dashed in the plan |
| f12 | Sloped plots | v0.21.0 | grok-4.7-high | f11 | `slope.ts` presets (flat / gentle 5 % / hill 12 % with direction), `platformUnderHouse` cut/fill, plinth extended below the lowest ground under each wall, Outside-panel slope controls |
| f13 | Terrain sculpt v2 | v0.21.0 | grok-4.7-medium | f12 | Falloff modes, `HEIGHT_LIMIT 12`, frame-rate-independent dab strength, `[`/`]` and Shift-invert, 3D ring hugging the terrain, `sculpt-tool` inspector section |

### R — Realism (v0.22.0, v0.23.0)

| id | title | release | owner model | depends on | scope |
|---|---|---|---|---|---|
| r01 | Albedo quality pipeline (UASTC, 2k fabrics, content-v4) | v0.22.0 | grok-4.7-medium | none | `ktx.mjs` albedo+ORM → UASTC with an ETC1S fallback for ORM, 1 GB budget check in `pack.mjs --dry-run`, 24 sets promoted to 2k, re-pack sequence |
| r02 | Detail normal and hex anti-tiling for scans | v0.22.0 | claude | none | Shared 512² detail normal at 0.08 m blended into the normal node; `antiTile` flag on 11 plaster/concrete/porcelain ids with a hex-grid TSL sampler; pure `hexTile.ts` + test; aerial ≥ 55 fps |
| r03 | Paint finishes (matte/eggshell/satin) | v0.22.0 | claude | r02 | `PaintFinish` library field + `MaterialRef.finish`, roughness 0.85/0.6/0.35, plaster scan breakup at 20 % on paints, Finish select in `paint.tsx`, en/pt |
| r04 | Fabric sheen and leather clearcoat | v0.22.0 | claude | none | Fabrics → `MeshPhysicalMaterial` sheen 0.6/0.7, leathers clearcoat 0.15/0.5, cache keys and twins unchanged |
| r05 | Window glass v2 | v0.22.0 | claude | none | Two 4 mm physical panes (room probe inside, sky outside), transmission 0.92 / ior 1.52, 2 % tint, shared smudge roughness, no glass shadows, tier fallback |
| r06 | Door leaf materials and raised panels | v0.22.0 | grok-4.7-medium | r03 | `Opening.leaf` painted / wood, separate panel sheet with rotated UVs, 12 mm raise, 3 mm bevel, Leaf select in `opening.tsx` |
| r07 | Indoor grime and per-item tint variation | v0.22.0 | claude | none | `grime` attribute from `buildWall` for interior faces (≤ 8 % skirt, ≤ 6 % corner), `varyTint` 3 % per procedural item; litColour windows untouched |
| r08 | Roughness breakup on glossy floors | v0.22.0 | claude | r02, r05 | 9 glossy ids get a world-XZ smudge blended 25 % into roughness; survives scan swap and twins; SSR reacts |
| r09 | Grass v2 | v0.23.0 | claude | none | Three clump kinds, macro wear height/colour, 5 % dandelion/clover heads, optional mowed stripes; per-tier perf table |
| r10 | Outdoor set dressing and "Dress garden" | v0.23.0 | grok-4.7-medium | r01 (soft) | 8 outdoor entries, ≥ 20 Poly Haven candidates in sources, pure `dressGarden(project, seed)` (patio set, bin by garage, planters by door), button |
| r11 | Scanned ground splat layers | v0.23.0 | grok (data) / claude (shader) | r01 | New `targets.splatLayer` content kind, 5 new CC0 sets, per-layer slots with macro and height-noise edge blend in the splat material |
| r12 | Scanned flower and plant models | v0.23.0 | grok-4.7-medium | r01 | `species` models in the index, 8 model species (fern, hydrangea, rose bush new) instanced within 40 m with a far proxy |
| r13 | Sky refit for AgX | v0.23.0 | claude | none | Pure `skyShape.ts` (haze band, sun glow), refit noon/sunset targets, warm cloud bases at dusk; existing sky tests unchanged |
| r14 | Acceptance sheet, art bible, perf script | v0.23.0 | grok-4.7-medium | none | `--ref` before/after SSIM in the contact sheet, `npm run visual:perf` PASS/FAIL at 55 fps, `docs/ART.md` starter |

## How a brief is run

```bash
# in the task's worktree (one per brief)
git -C "$REPO" worktree add -b <type>/<slug> "$REPO/.claude/worktrees/<slug>" origin/main
cd "$REPO/.claude/worktrees/<slug>" && npm ci --silent
agent -p --sandbox enabled --model grok-4.7-medium --output-format text --trust \
  --workspace "$PWD" "$(cat docs/briefs/<id>-<slug>.md)" > "$LOG" 2>&1; rc=$?
```

- `grok-4.7-high` for briefs marked so; `Owner model: claude` briefs run as an Opus 5.5
  subagent at medium effort.
- A run failed if `rc ≠ 0`, the log has `RetriableError` / `ECONNRESET` /
  `Authentication required`, or nothing changes for 12 minutes. One failure → fallback,
  no retry.
- Review order: the test diff, then the code. Trust the gate output, not the summary.
- Then: conventional commit, PR with the brief id in the title, gate
  (`scripts/ship/gate.sh`), merge, delete worktree.
- At most 3 Grok jobs at once; briefs in the same release that touch the same files run
  one after another in `Depends on:` order.

## Still owner-only (unchanged from the Steam plan)

Steamworks account + fee + tax interview, name/trademark check (`docs/NAME-CHECK.md`),
soundtrack picks, UI mockup sign-off (now: approve the v0.16.0 screenshots), capsule art
approval, Content Survey, contact email for `docs/PRIVACY.md`.

## Risks

- **Realism ceiling without a shader artist:** r02/r05/r09 are the hard ones; measure
  before/after on the harness, keep the perf gate, cut stochastic tiling to large flat
  surfaces only if it costs > 1.5 ms.
- **Catalog volume vs quality:** 53 procedural items in one release can look samey. c08
  families enforce consistent proportions; the review per PR includes a thumbnail sheet.
- **Content pack size:** UASTC albedo may blow the 1 GB budget; r01 has the fallback.
- **E2E fragility:** every spec clicks "Continue" on the start screen; u02 keeps that name.
- **Grok on geometry:** b02/f09 are marked `grok-4.7-high` with pure-model tests first;
  if the first run fails they move to Claude.
