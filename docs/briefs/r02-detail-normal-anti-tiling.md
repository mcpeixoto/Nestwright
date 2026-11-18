# r02 — Detail normal and hex anti-tiling for scans

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude
**Depends on:** none (merge before r03, which also edits `applyPbrMaps`)
**Time box:** ≤ 20 min of agent work

## Goal
Large uniform surfaces (plaster, render, concrete, microcement, large porcelain) stop
showing the scan's 1.5–3 m tile as a visible grid, and every scanned surface gains a fine
0.08 m detail relief that fades out past 6 m. A shared 512² procedural detail normal is
blended into the scan normal; materials flagged `antiTile: true` sample their albedo,
normal and roughness through a hex-grid stochastic tiling node (three rotated offsets,
hex-weight blend). Perf on the aerial view must stay ≥ 55 fps at High.

## Context the implementer needs
- `src/materials/pbrTextures.ts:62–67` `packedNormalNode(normal, scale)` builds the
  two-channel (`NormalGAPacking`) normal node; `loadSet` (l.242) and `withRepeat` (l.274)
  create `PbrMaps.normalNode`. `tileRepeat` (l.222) is the repeat per metre.
- `src/materials/materialCache.ts:119–143` `applyPbrMaps` sets `map`, `normalNode`,
  `roughnessMap`, `metalnessMap`, `aoMap`; `mapSignature` (l.108) decides `needsUpdate`.
  Facade twins get `colorNode` from `facadeColorNode(base)` in
  `src/materials/facadeWeathering.ts:40–62`; `attachFacadeWeathering` wraps whatever
  `colorNode` exists at clone time, so a later `colorNode` swap must re-wrap it.
- `src/materials/library.ts:27–38` `MaterialDef`. UVs are metres (`src/builders/uv.ts`).
- TSL imports in use elsewhere: `mx_noise_float`, `positionWorld`, `positionView`,
  `texture`, `uv`, `normalMap`, `materialColor`, `materialRoughness`, `smoothstep`,
  `mix`, `vec2/3/4`, `Fn`, `floor`, `fract`, `dot`, `abs`, `cos`, `sin`.
- Perf: `window.__nestwright.perf.report(90, { settle: 30 })` (`src/main.tsx:30`);
  harness `node scripts/visual/shoot.mjs --serve --views aerial-cutaway,living-room --out visual-out/r02`.

## Steps
1. **Tests first** — `tests/view3d/antiTile.test.ts` against a new pure module
   `src/materials/hexTile.ts` (see Tests to add). Run `npm test -- tests/view3d/antiTile`; fails.
2. `src/materials/hexTile.ts` (pure, no three): the hex-grid tiling maths used by the node
   and the test. `export const HEX_SCALE = 1` (hex cells per texture tile, one tile per
   cell). `export function hexCells(u: number, v: number): { ids: [[number, number], [number, number], [number, number]]; weights: [number, number, number] }`
   using the triangle-grid construction (skew `(u, v)` by `[[1, 0], [-0.5, 0.8660254]]`,
   floor, barycentric fractions → three cell ids and weights that sum to 1).
   `export function cellHash(ix: number, iy: number): number` (0–1, deterministic);
   `export function cellRotation(ix, iy)` = `cellHash * 2π`; `cellOffset(ix, iy)` = two
   hashes. `export function blendWeights(w: [n, n, n], sharpness = 4)` =
   `w_i^sharpness / Σ` so one sample dominates and blurring stays small.
3. `src/materials/detailNormal.ts`: `export const DETAIL_TILE_M = 0.08`,
   `DETAIL_STRENGTH = 0.35`, `DETAIL_FADE_M: [2, 6]`. `export function detailNormalTexture(): THREE.DataTexture`
   — once: 512² RGBA from 3-octave value noise height `h`, normal by central differences
   with slope 0.6, packed `(n.x, n.y, n.z) * 0.5 + 0.5` in RGB; `RepeatWrapping`,
   `LinearMipmapLinearFilter`, `generateMipmaps = true`, `NoColorSpace`.
   `export function detailTangentNode(uvNode)` returns the unpacked tangent-space vec3
   scaled by `DETAIL_STRENGTH * smoothstep(6, 2, positionView.z.negate())`.
4. `src/materials/pbrTextures.ts`: `packedNormalNode(normal, scale, options?: { detail?: boolean; sampler?: (tex) => node })`.
   When `detail`, compose in tangent space: `n1 = vec3(tex.g*2-1, tex.a*2-1, 1) * (scale, scale, 1)`,
   `n2 = detailTangentNode(uv().div(DETAIL_TILE_M))`, UDN blend
   `nb = normalize(vec3(n1.xy + n2.xy, n1.z))`, then `normalMap(nb.mul(0.5).add(0.5))`
   with the default unpack mode. `loadSet`/`withRepeat` pass `detail: true` for every set.
5. `src/materials/library.ts`: `antiTile?: boolean` on `MaterialDef`; set `true` on
   plaster-white, plaster-warm, plaster-pink, render-stucco, lime-plaster, concrete,
   polished-concrete, microcement, microcement-dark, porcelain-large-grey,
   porcelain-large-sand (11 ids).
6. `src/materials/hexTileNode.ts` (TSL): `export function hexTiled(tex: THREE.Texture, uvNode): THREE.Node<'vec4'>`
   — `Fn` mirroring `hexCells`: per cell a rotation and offset from `cellHash`, three
   samples `texture(tex, rotate(uv - centre) + centre + offset)`, blended with
   `blendWeights`. Keep `texture()` nodes so mips work (UV derivatives are continuous
   inside a cell; accept the seam).
7. `src/materials/materialCache.ts` `applyPbrMaps`: when `source.def.antiTile && maps.albedo`:
   `mat.map = null`; `colorNode = vec4(hexTiled(albedo, uvRepeat).rgb.mul(materialColor.rgb), 1)`
   where `uvRepeat = uv().mul(repeat)` from `tileRepeat`; `normalNode = packedNormalNode(normal, scale, { detail: true, sampler: (t) => hexTiled(t, uvRepeat) })`;
   `roughnessNode = materialRoughness.mul(hexTiled(orm, uvRepeat).g)` with
   `mat.roughnessMap = null`; keep `aoMap`/`metalnessMap` plain (metalness is 0 on these
   ids, AO tiling is invisible). If `mat.userData.facade`, re-wrap:
   `mat.colorNode = facadeColorNode(mat.colorNode)`. Add `colorNode`/`roughnessNode` to
   `mapSignature`.
8. Perf: run the harness on `aerial-cutaway` and `living-room` before and after; paste
   `fpsAvg`, `p50`, `p95` in the summary. Budget: p50 regression ≤ 5 %, aerial High ≥ 55 fps.
   If over, drop the third hex sample (two-sample blend) and say so.

## Tests to add
`tests/view3d/antiTile.test.ts` (pure, imports `src/materials/hexTile.ts` only):
- `hexCells(u, v).weights` sum to 1 ± 1e-6 and each lies in [0, 1] for 1000 random points.
- Continuity: for `(u, v)` and `(u + 1e-4, v)` the blended weights per shared cell id
  differ by < 1e-2.
- `cellHash` is deterministic and in [0, 1); `cellRotation` in [0, 2π).
- `blendWeights([0.6, 0.3, 0.1])` keeps order and sums to 1; `blendWeights([1, 0, 0])` is `[1, 0, 0]`.
- `library`: every `antiTile` id has a `category` in `{Plaster, Masonry, Tile}` and
  `metalness === 0` (`MATERIALS.filter(m => m.antiTile)`).

Also `tests/materials/pbrTextures.test.ts` gains one case: `packedNormalNode(tex, 0.5, { detail: true })`
returns a node (not null) and `packedNormalNode(null)` stays null.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d tests/materials tests/builders` green
  (`facadeWeathering.test.ts` and `lawnScan.test.ts` untouched and passing).
- Harness: `node scripts/visual/shoot.mjs --serve --views aerial-cutaway,living-room,front-facade --out visual-out/r02`
  with no `pageerror`/`console error` lines in `summary.json`; `aerial-cutaway.json`
  `report.fpsAvg ≥ 55`.
- Visual: in `living-room.png` the plaster wall shows no repeating 1.5 m pattern; a
  2× zoom of a wall within 2 m shows fine relief.

## Out of scope / forbidden
- No `onBeforeCompile`; node materials only. No height/parallax.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
