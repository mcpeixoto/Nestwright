# c02 — Catalog names keyed by id (`catalog.<id>`)

**Epic:** catalog **Release:** v0.19.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Every catalog entry's display name is looked up by `catalog.<id>`, not by its English name.
Renaming an English name (or two entries sharing a name) no longer changes or breaks a
translation. The player sees no difference.

## Context the implementer needs
- `src/i18n/catalog.ts:5-26` — `NAME_KEYS` covers only the 20 `basic.ts` ids. `catalogNameKey`
  (line 65) falls back to the English `name` as the key when `en` has it.
- `src/i18n/en.ts:377-396` — the 20 existing `'catalog.<id>'` keys. Lines ≈767-860 hold the
  English-name keys for the other 95 entries (`'Round table': 'Round table'` at 781, `'Washing
  machine'` at 807, `'Ceiling light'` at 818). `pt.ts` mirrors them at +1 line.
- `tests/i18n/coverage.test.ts:128-148` — fails when `catalogNameKey` returns undefined for any
  entry; line 172-177 fails when a pt value equals the en value (except `SAME_IN_PT`).
- `tests/i18n/keys.test.ts` — en and pt must have identical key sets.
- Entry ids per file: run `grep -o "id: '[a-z0-9-]*'" src/catalog/entries/*.ts` (115 ids;
  `garden.ts` also matches two material refs `'concrete'`, `'glass'` — those are not entries).
- Other UI that reuses an English catalog name as a key: check with
  `grep -rn "'<Name>'" src/ --include=*.ts --include=*.tsx` for each name before deleting it.
  Known: slot labels such as `'Top'`, `'Legs'`, `'Shade'` (en.ts:924-941) are NOT catalog names;
  leave them.

## Steps
1. `tests/i18n/catalogKeys.test.ts` (new). Import `'../../src/catalog'`, `listEntries`,
   `catalogNameKey`, `en`, `pt`. Assert for every entry: `catalogNameKey(entry.id, entry.name) === \`catalog.${entry.id}\``;
   `en['catalog.<id>'] === entry.name`; `pt['catalog.<id>'] !== entry.name`. Assert that no key
   of `en` equals an entry `name` unless the same string is also used elsewhere in `src/`
   (read the files as `tests/i18n/coverage.test.ts` does with `usedKeys()` — copy the three
   regexes, do not import the test).
2. `src/i18n/catalog.ts` — delete `NAME_KEYS`. `catalogNameKey` becomes:
   ```ts
   export function catalogNameKey(id: string, name: string): string | undefined {
     const key = `catalog.${id}`
     return known(key) ? key : known(name) ? name : undefined
   }
   ```
   Keep the `name` fallback so imported models and packs still show their own name.
3. Generate the key list: `node -e` script (do not commit it) that reads every
   `src/catalog/entries/*.ts`, pairs `id: '…'` with the following `name: '…'`, and prints
   `'catalog.<id>': '<name>',` lines. For pt, reuse the existing Portuguese value of the
   English-name key (`pt['<name>']`).
4. `src/i18n/en.ts` — after line 396 (`'catalog.washbasin'`), insert the 95 new
   `'catalog.<id>': '<English name>'` lines in file order of the entries. Then delete each
   English-name key (`'Round table': 'Round table'`, …) **only if** step 1's grep finds no other
   use in `src/`. Record each kept key with its reason in the summary.
5. `src/i18n/pt.ts` — same insertions with the Portuguese values; delete the same keys as en.
6. `tests/i18n/coverage.test.ts` — no code change expected. If the "translates every value into
   Portuguese" check fails for a new key, the pt value is wrong: fix pt, not the test.
7. `src/i18n/catalog.ts` — the doc comment on `catalogNameKey` (lines 61-64) now reads:
   "Dictionary key for a catalog entry's name: `catalog.<id>` when the dictionary has it,
   otherwise the English name itself (imported models, packs). Undefined when neither exists."

## Tests to add
- `tests/i18n/catalogKeys.test.ts` — step 1.
- Changed existing tests: none expected. If `tests/i18n/coverage.test.ts` must change, list the
  exact line and reason in the PR body (owner model is claude for this reason).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/i18n tests/catalog tests/ui` green.
- `grep -c "'catalog\." src/i18n/en.ts` prints `115`; same for `pt.ts`.
- `grep -n "NAME_KEYS" src/i18n/catalog.ts` prints nothing.
- In the app, the library tab "Living" still shows "Three-seat sofa" in en and "Sofá de três
  lugares" in pt-PT (`catalogName('pt-PT', 'sofa-3', 'Three-seat sofa')` in a quick vitest run).

## Out of scope / forbidden
- Do not change any English or Portuguese wording; this brief moves keys, it does not reword.
- Do not touch `CATEGORY_KEYS`, slot keys or param keys.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
