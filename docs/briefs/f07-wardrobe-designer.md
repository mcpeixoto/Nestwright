# f07 — Wardrobe designer

**Epic:** Features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** f06
**Time box:** ≤ 20 min of agent work

## Goal
A run of `kind: 'wardrobe'` can be created from the Run tool (kind picker in the tool section),
reaches the ceiling when asked, offers hinged, sliding or mirror doors, and shows an interior
(shelves or hanging rail) when its doors are open in the inspector preview. In 3D a mirror
wardrobe reflects the room through the `mirror` library material.

## Context the implementer needs
- f05 model: `BuiltinRun`, `RunKind`, `RUN_MODULES.wardrobe = ['hinged-2','sliding','open-shelves','drawers']`,
  `RUN_HEIGHT.wardrobe = 2.2`, `layoutRun`, `fitModules`. f06: `src/tools/run.ts`,
  `src/builders/runs.ts` (`buildRun`), `src/ui/inspector/sections/run.tsx`, the `runs` plan layer.
- `src/model/types.ts` `Level.height` (floor-to-floor) and `slabThickness`: a floor-to-ceiling
  wardrobe is `level.height - slabThickness` tall (ceiling of this level is the next slab's
  underside; use `level.height - 0.3` when the level above does not exist — same rule as
  `buildFloors`' ceiling; read `src/builders/floors.ts` for the exact ceiling height expression and reuse it).
- Library materials: `mirror` (`src/materials/library.ts:89`), `glass` (l.63), `oak-veneer` (l.100).
- Inspector `tool` section pattern (`src/ui/inspector/sections/tool.tsx`): a section matched by
  `state.tool === 'run'` can show a kind picker; the store already has `openingSubtype` for the
  door tool — do the same with a module-level variable in `src/tools/run.ts`
  (`export function setRunKind(kind)`, `export function getRunKind()`, `useSyncExternalStore` as
  in `src/tools/brushState.ts:59`).
- Migration rules: new optional field → still needs a `migrate` step and a `PROJECT_VERSION` bump
  (f05 bumped to 2; this brief bumps to 3 — bump from whatever the file says when you start).

## Steps
1. Tests first (below).
2. `src/model/types.ts`: on `BuiltinRun` add
   ```ts
   wardrobe?: {
     fullHeight: boolean           // reach the ceiling
     doors: 'hinged' | 'sliding' | 'mirror'
     interior: 'shelves' | 'hanging' | 'mixed'
     open: boolean                 // inspector preview: doors shown open in 3D
   }
   ```
   `PROJECT_VERSION` +1; `src/io/migrate.ts` step: for every run with `kind === 'wardrobe'` and no
   `wardrobe`, set `{ fullHeight: false, doors: 'hinged', interior: 'mixed', open: false }`.
3. `src/model/builtins.ts`: `runHeight(run, level)` → wardrobe with `fullHeight` returns the
   ceiling height for the level (import the ceiling rule), otherwise `RUN_HEIGHT[kind]`.
   `defaultModules('wardrobe', length)`: `doors === 'sliding'` → one `sliding` module per
   1.8 m (min 1.2), else `hinged-2` per 1.0 m with `drawers` at the end when ≥ 0.45 m remain.
   Add `wardrobeDefaults(): BuiltinRun['wardrobe']`.
4. `src/tools/run.ts`: `getRunKind()`/`setRunKind()`; the created run uses the current kind, sets
   `front: {id: 'oak-veneer'}`, no `worktop`, `plinth: 0.08`, and `wardrobe: wardrobeDefaults()`
   when kind is wardrobe. New inspector section `src/ui/inspector/sections/runTool.tsx`
   (`id: 'run-tool'`, `order: 5`, match `state.tool === 'run'`): a `<select>` of
   `kitchen | wardrobe | vanity` labelled `'Run kind'`.
5. `src/ui/inspector/sections/run.tsx`: when `run.kind === 'wardrobe'` add: checkbox
   `'Floor to ceiling'`, select `'Doors'` (`hinged | sliding | mirror`), select `'Interior'`
   (`shelves | hanging | mixed`), checkbox `'Show open'`. Changing `doors` re-runs
   `defaultModules` only when the module list is still the default (compare types); otherwise
   keeps the modules.
6. `src/builders/runs.ts`: wardrobe branch:
   - height from `runHeight`; carcass `oak-veneer` sides 18 mm, back panel;
   - doors: `hinged` → two leaves per `hinged-2` module with a 3 mm gap and the run's handle;
     `sliding` → leaves overlapping 40 mm on two tracks (front leaf 20 mm proud), no handle,
     a 30 mm top track; `mirror` → sliding geometry with front faces in `getMaterial({id:'mirror'})`
     and a 20 mm `oak-veneer` frame;
   - `open` → hinged leaves rotated 100° outwards, sliding leaves slid to one side, and the
     interior drawn: `shelves` = 5 shelves 18 mm; `hanging` = one rail (`chrome`, Ø 25 mm) at
     `height - 0.25` plus one shelf above; `mixed` = rail in the left half, shelves in the right;
   - `open-shelves` modules are always open (no door); `drawers` = 4 fronts with handles.
   - The plan layer draws sliding wardrobes with a double front line (two tracks).
7. Strings (en + pt): `'Run kind'`/`'Tipo de bancada'`, `'Wardrobe'`/`'Roupeiro'`, `'Vanity'`/`'Móvel de casa de banho'`,
   `'Kitchen'` exists, `'Floor to ceiling'`/`'Até ao tecto'`, `'Doors'`/`'Portas'`, `'Hinged'`/`'De batente'`,
   `'Sliding'`/`'De correr'`, `'Mirror'` exists as a material name — reuse the key,
   `'Inside'`/`'Interior'` (the key is `Inside`, not `Interior`: `tests/i18n/coverage.test.ts`
   rejects a pt value equal to the en one, and that test may not be edited),
   `'Shelves'`/`'Prateleiras'`, `'Hanging rail'`/`'Varão'`,
   `'Mixed'`/`'Misto'`, `'Show open'`/`'Mostrar aberto'`, `'Hinged pair'`/`'Par de batente'`,
   `'Open shelves'`/`'Prateleiras abertas'`, `'Drawers'`/`'Gavetas'`.

## Tests to add
- `tests/model/wardrobeRun.test.ts`: `runHeight` for `fullHeight` equals the ceiling rule on a
  2.7 m level (assert against the imported ceiling helper, not a literal); `defaultModules('wardrobe', 3.6)`
  with sliding gives 2 `sliding` modules of 1.8; with hinged gives 3 `hinged-2` + 1 `drawers`
  summing to 3.6; `migrate` on a version-2 file with a bare wardrobe run adds the defaults and
  bumps the version.
- `tests/builders/wardrobe.test.ts`: `buildRun` of a 2.4 m mirror wardrobe contains at least
  one mesh whose material is the `mirror` library material (`mesh.material.userData.id === 'mirror'`
  or whatever `getMaterial` tags — read `materialCache.ts`); the group's `Box3` height is 2.2
  (±0.02) when not full height and equals the ceiling height when `fullHeight`; `open: true`
  adds meshes (count grows) and the hinged leaves' world x-extent grows beyond the carcass.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/builders tests/io tests/i18n` green.
- `npm run build` green.
- Manual, described: `k`, set kind to Wardrobe, drag 2.4 m along a bedroom wall, toggle
  `Floor to ceiling` and `Show open`, switch doors to Mirror; the 3D view updates each time.

## Out of scope / forbidden
- Vanity specifics (f08). Door animation in walk mode.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
