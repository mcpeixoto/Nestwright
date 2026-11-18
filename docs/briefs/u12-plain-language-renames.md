# u12 — Plain-language renames (en + pt)

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** claude
**Depends on:** u05, u06, u07, u08, u09, u11
**Time box:** ≤ 20 min of agent work

## Goal
Every control a first-time player meets uses everyday words. Jargon labels are renamed at
their source (tool `label`, panel `title`, group label, menu item, settings field) and in both
language files; keys that nothing uses any more are removed; the tests that asserted the old
words are updated and listed in the PR body as intentional edits.

## Context the implementer needs
- i18n: the key is the English string (`src/i18n/index.ts`); `pt.ts` is typed over
  `MessageKey`, so a removed key must leave both files; `tests/i18n/keys.test.ts` and
  `tests/i18n/coverage.test.ts` (unused keys are not an error, missing ones are; pt equal to en
  must be listed in `SAME_IN_PT`).
- u06 already did `Split` → `Plan + 3D`, `2D` → `Plan`, `Export JSON` → `Backup file (JSON)` and
  removed `Home`/`More`. u07 named the groups `Doors & windows`/`Garden` while leaving the
  `Openings`/`Outside` keys in place. u05 added help text under the Advanced fields.
- Sources of the remaining labels (verify each line before editing):
  | old | where | new en | new pt |
  |---|---|---|---|
  | `Joints` | `src/ui/BottomBar.tsx` Snap menu; `en.ts` L66, `pt.ts` L68 | `Walls` (key exists, reuse) | `Paredes` (existing) |
  | `Slab` | `src/tools/slab.ts` L44 label; `inspector/sections/structure.tsx` L452 title; `level.tsx` field label | `Floor slab` | `Laje de piso` |
  | `Plot` | `src/tools/plot-boundary.ts` L83 | `Garden boundary` | `Limite do jardim` |
  | `Sculpt` | `src/tools/terrain-sculpt.ts` L55 | `Shape ground` | `Moldar terreno` |
  | `Calibrate trace` | `src/tools/traceCalibrate.ts` L71 label (keep the `apply` label L51 — undo history text, not UI) | `Set scale` | `Definir escala` |
  | `Variants` | `panels/VariantsPanel.tsx` L160 | `Options A/B` | `Opções A/B` |
  | `Wishes` | `panels/WishesPanel.tsx` L354 | `Wish list` | `Lista de desejos` |
  | `Together` | `together/TogetherDialog.tsx` L17, L44, L198; `achievements/evaluate.ts` L214 (achievement name — leave) | `Play together` | `Jogar a dois` |
  | `Render scale` | `SettingsDialog.tsx` | `Resolution` (key exists) | `Resolução` (existing) |
  | `Renderer (applies on restart)` | `SettingsDialog.tsx` | `Graphics engine (restart needed)` | `Motor gráfico (requer reinício)` |
  | `Tone mapping` | `SettingsDialog.tsx` | `Colour look` | `Aspeto da cor` |
  | `Exposure compensation` | `SettingsDialog.tsx` (label + `aria-label`) | `Brightness` | `Brilho` |
  | `Clear selection` | `builtinShortcuts.ts` description (u03 made Escape pause) | `Clear selection, or pause` | `Limpar seleção, ou pausar` |
  | `Outside` panel title | `panels/OutsidePanel.tsx` L260 | `Garden` (key from u07) | `Jardim` |
  | `Library` panel title | `panels/library.tsx` L7 | `Furniture` (key from u07) | `Mobiliário` |
- Tests asserting old strings (grep before editing: `grep -rn "Joints\|Slab\|'Plot'\|Sculpt\|Calibrate\|Variants\|Wishes\|'Together'\|Render scale\|Tone mapping\|Exposure compensation\|Openings\|Biblioteca\|Clear selection" tests`):
  - `tests/ui/topBar.test.tsx` (u06 version): menu item names `Wishes`, `Variants`, `Together`.
  - `tests/ui/railFlyoutTooltip.test.tsx` L105 `Openings` → `Doors & windows`; hover-based
    `enterGroup` cases → click (left over from u07).
  - `tests/e2e/portuguese.spec.ts` L48 `Biblioteca` → `Mobiliário`.
  - `tests/settings/exposureComp.test.ts`, `tests/settings/renderer.test.ts`: check for label
    strings; edit only if they assert UI text.
  - `tests/i18n/coverage.test.ts` `SAME_IN_PT`: nothing new expected; run and see.

## Steps
1. For each table row: change the source label, rename the key in `en.ts` and `pt.ts` (or reuse the
   existing key where noted), then `grep -rn "'<old>'" src tests` until the old key has no reader;
   delete it from both language files.
2. `SettingsDialog.tsx`: the four Advanced labels, including `aria-label`s on the range inputs.
3. `builtinShortcuts.ts`: shortcut description.
4. Update the tests listed above; add nothing else to them.
5. `docs/DESIGN.md`: a short "Vocabulary" list mapping the old internal names to the new labels
   so later briefs use the new words.
6. Check pt for Brazilian forms with the coverage test (it fails on `tela`, `arquivo`, …).

## Tests to add
- `tests/i18n/vocabulary.test.ts` (new): asserts that none of the removed keys (`Joints`, `Slab`,
  `Plot`, `Sculpt`, `Calibrate trace`, `Variants`, `Wishes`, `Together`, `Render scale`,
  `Tone mapping`, `Exposure compensation`, `Renderer (applies on restart)`) exists in `en`, and
  that `Floor slab`, `Garden boundary`, `Shape ground`, `Set scale`, `Options A/B`, `Wish list`,
  `Play together`, `Colour look`, `Brightness`, `Graphics engine (restart needed)` do.

## Acceptance
- `npm run typecheck && npm run lint && npm test` green (full suite: renames touch many areas).
- `npm run test:e2e -- tests/e2e/portuguese.spec.ts tests/e2e/smoke.spec.ts tests/e2e/trace.spec.ts` green.
- `grep -rn "Joints\|'Slab'\|'Sculpt'\|Calibrate trace'\|'Variants'\|'Wishes'\|Tone mapping" src/i18n` prints nothing.
- `npm run dev` in pt-PT: rail, menus, settings and snap menu show the new words.

## Out of scope / forbidden
- Do not rename tool or panel `id`s, store fields or `apply` labels (undo history, achievements).
- Do not change behaviour; this brief is words only.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
