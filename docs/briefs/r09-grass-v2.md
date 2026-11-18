# r09 — Grass v2: three clump kinds, wear noise, clover sprinkle, mowed stripes

**Epic:** realism **Release:** v0.23.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
The lawn stops being one clump repeated. Three clump geometries (`short`, `tufted`,
`seeded`) are instanced side by side; a world-space macro wear noise scales height
(0.75–1.15) and shifts colour (worn patches yellower); 5 % of clumps carry a small
dandelion-yellow or clover-white head; an optional mowed-stripes albedo modulation (model
field `terrain.stripes`, OutsidePanel checkbox) runs in world x on both the blades and the
lawn splat so they match. Per-tier perf is measured and stays ≥ 55 fps on the aerial view
at High.

## Context the implementer needs
- `src/view3d/terrain/grass.ts`: `clumpGeometry()` (l.30, 10 blades, 30 triangles),
  `grassMaterial(radius)` (l.78: `GRASS_A` xyz+scale, `GRASS_B` yaw/meadow/spread,
  `GRASS_T` blade t), `GrassField` (`allocate` l.137, `rebuild` l.193, `stats` l.250).
- `tests/view3d/foliage.test.ts:332` asserts `clumpGeometry().getIndex()!.count / 3 === 30`:
  the no-argument call must keep today's geometry.
- `src/view3d/terrain/textures.ts:275–280` `macroVariation()` (lawn/meadow brightness) and
  `LAWN_MACRO_AMOUNT`; `tests/view3d/lawnScan.test.ts` reads `LAWN_MACRO_AMOUNT`.
- `src/view3d/render/quality.ts:51–71` grass tiers (`radius`, `cell`); Low has none.
- `src/view3d/layers/outside.ts:160–163, 229` wires `GrassField`; `grass.sync(project, mode, tier)`.
- `src/model/types.ts` `Terrain` interface (find with `grep -n "interface Terrain" src/model/types.ts`);
  `src/io/migrate.ts` optional-field convention. `src/ui/panels/OutsidePanel.tsx:195–230`
  (plot controls, "Flatten under house" button) for the checkbox; `useStore.getState().apply`.
- Strings: `src/i18n/en.ts` + `pt.ts`.
- Perf: `node scripts/visual/shoot.mjs --serve --views aerial-cutaway,garden-wide --quality <tier> --out visual-out/r09-<tier>` for medium, high, ultra.

## Steps
1. **Tests first** — `tests/view3d/grassClumps.test.ts` (see below). Fails.
2. `grass.ts`: `export type ClumpKind = 'short' | 'tufted' | 'seeded'`;
   `export const CLUMP_KINDS: ClumpKind[]`; `export const SPRINKLE_SHARE = 0.05`;
   `clumpGeometry(kind: ClumpKind = 'tufted')`: `tufted` = today's 10 blades;
   `short` = 8 blades, `h` 0.45–0.7, `w` × 1.2, lean × 0.6; `seeded` = 9 blades plus one
   stalk (`h` 1.15, width 0.03) ending in a head: 3 extra vertices (a 0.025 m triangle at the
   tip, `GRASS_T = 2`). Export `HEAD_T = 2`.
   `export function clumpKindFor(h: number, meadow: number): ClumpKind` — `h` 0–1 hash:
   `h < SPRINKLE_SHARE` → `seeded`; `h < 0.55 + meadow * 0.2` → `tufted`; else `short`.
3. `grassMaterial`: wear = `mx_noise_float(a.xz.mul(0.09)).mul(0.5).add(0.5)` (0–1);
   height `tall = a.w.mul(mix(1, 1.8, b.y)).mul(mix(0.75, 1.15, wear))`; colour: mix the
   tip toward `dry` by `wear.mul(0.35)` in addition to `b.y`. Head: where `t > 1.5`
   (`step(1.5, t)`) colour = `mix(dandelion, clover, step(0.5, hashNode))` with
   `dandelion = srgb(232, 194, 58)`, `clover = srgb(239, 231, 216)`, `hashNode = fract(sin(a.x*12.9898 + a.z*78.233)*43758.5)`;
   no emissive. Stripes: `uniform stripes` (0/1) and
   `stripeMul = mix(1, mix(0.94, 1.06, step(0, sin(a.x.mul(Math.PI / 0.9)))), stripes)`
   multiplied into `rgb`. Export `setGrassStripes(on: boolean)` writing the uniform.
4. `GrassField`: `meshes: Record<ClumpKind, { mesh, a, b, capacity }>` built by `allocate`
   per kind (`mesh.name = 'grass-' + kind`); `rebuild` assigns `kind = clumpKindFor(hash2(cx, cz, 37), meadow)`
   and writes into that kind's buffers; `stats()` sums all three; `dispose` all;
   `outside.ts` adds the three meshes (expose `readonly meshes: THREE.InstancedMesh[]`).
   `update()` keeps one rebuild for all kinds.
5. `textures.ts`: `export const lawnStripes = uniform(0)`; `macroVariation()` multiplies by
   `mix(1, mix(0.94, 1.06, step(0, sin(positionWorld.x.mul(Math.PI / 0.9)))), lawnStripes)`.
   `export function setLawnStripes(on)` sets both uniforms (import `setGrassStripes`).
6. `src/model/types.ts` `Terrain`: `/** Mowed stripes on the lawn. Absent means off. */ stripes?: boolean`.
   `migrate.ts` comment line. `outside.ts applyProject`: `setLawnStripes(terrain.stripes === true)`.
7. `OutsidePanel.tsx` plot section: `<label className="check"><input type="checkbox" checked={terrain.stripes === true} onChange=…/><T k="Mowed stripes" /></label>`
   through `apply('Mowed stripes', draft => { draft.terrain.stripes = checked })`.
   Strings: `'Mowed stripes'` / `'Riscas de corte'`.
8. Perf per tier: run the three harness commands; paste `fpsAvg`, `triangles` and
   `perf.report().extra` for each; `aerial-cutaway` High must stay ≥ 55 fps. If not, lower
   `seeded` to 7 blades and say so.

## Tests to add
`tests/view3d/grassClumps.test.ts`:
- `clumpGeometry()` has 30 triangles (unchanged); `clumpGeometry('short')` has 24;
  `clumpGeometry('seeded')` has `9 * 3 + 3 + 1` triangles (27 blade + 3 stalk + 1 head);
  every kind's max `y` ≤ 1.2 and min `y` ≥ 0.
- `seeded` has ≥ 3 vertices with `GRASS_T === 2`; the others have none above 1.
- `clumpKindFor`: over `h = i / 10000`, `meadow 0` gives seeded share within 0.045–0.055,
  tufted 0.50 ± 0.01; `meadow 1` gives more tufted than `meadow 0`.
- `new GrassField().meshes` has 3 meshes named `grass-short|tufted|seeded`; `stats()` is
  `{ clumps: 0, triangles: 0 }` before sync; `dispose()` does not throw.
- `setLawnStripes(true)` sets `lawnStripes.value === 1` and the grass uniform likewise
  (export `grassStripes` for the test).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d tests/model tests/i18n` green
  (`foliage.test.ts` and `lawnScan.test.ts` untouched).
- Harness `garden-wide`, `aerial-cutaway` at medium/high/ultra, before/after, with the fps
  table in the summary; High aerial ≥ 55 fps.
- `npm run dev`: Outside panel → Mowed stripes → the lawn and its blades show alternating
  0.9 m bands; a few yellow and white heads are visible within 10 m.

## Out of scope / forbidden
- No grass on Low; no shadow casting for blades; no new grass textures.
- Do not edit existing tests. Only `Mowed stripes` is a new string.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
