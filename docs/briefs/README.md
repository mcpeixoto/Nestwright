# Briefs

One file per unit of work. A brief is written so that a less capable model can
finish it in about 20 minutes without asking questions. The orchestrating session
(Claude) writes briefs, reviews the result, runs the gates, commits, opens the PR
and merges. The implementing model (Grok via the Cursor `agent` CLI, or an Opus
subagent as fallback) only edits files inside its worktree.

`docs/ROADMAP.md` lists every brief in order and says which release it ships in.

## File name

`NN-slug.md`, numbered in execution order inside its epic:
`u01-design-tokens.md`, `c03-kitchen-appliances.md`, …

Prefix = epic: `u` UI shell, `b` bugs, `c` catalog, `f` features, `r` realism.

## Required sections

```markdown
# <id> — <title>

**Epic:** … **Release:** vX.Y.0 **Owner model:** grok-4.7-medium | grok-4.7-high | claude
**Depends on:** <brief ids or "none">
**Time box:** ≤ 20 min of agent work

## Goal
One paragraph: what exists after this brief that did not before, from the player's
point of view.

## Context the implementer needs
Exact files, functions and types to read first (path:line), the registry or pattern
to copy, and the conventions that apply (see docs/ARCHITECTURE.md).

## Steps
Numbered. Each step names the file it edits and what the code must do. Pseudocode
or a snippet where the shape matters. Tests come first (write the failing test,
then the code).

## Tests to add
Exact test file paths and the behaviours each test asserts.

## Acceptance
Commands and their expected output. Always includes:
- `npm run typecheck && npm run lint && npm test -- <relevant dirs>` green
- any visual or e2e check that applies

## Out of scope / forbidden
- Do not edit existing tests or user-facing strings unless the brief lists them.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not start a dev server. Do not commit, push or merge.
- No new dependencies unless the brief names them.
```

## House rules every brief inherits

- Model code in `src/model/` stays pure (no three, React or DOM).
- Every edit to the project goes through `useStore.getState().apply(label, recipe)`.
- New fields on `src/model/types.ts` need a migration in `src/io/migrate.ts` and a
  `PROJECT_VERSION` bump.
- New user-facing strings go in `src/i18n/en.ts` **and** `src/i18n/pt.ts`
  (European Portuguese; `tests/i18n/coverage.test.ts` fails otherwise).
- Library materials stay `MeshStandardMaterial`/`MeshPhysicalMaterial`. No
  `onBeforeCompile`, no old post-processing addons (eslint enforces this).
- Keep light counts fixed (material cache keys depend on them).
- Catalog entries keep the literal `id: '...'` format (the content pipeline greps it)
  and must build to exactly `ctx.size` at any size (`tests/catalog/catalog.test.ts`).
- No binaries in git: scanned assets go through `content/sources.json` and the
  content pack.
