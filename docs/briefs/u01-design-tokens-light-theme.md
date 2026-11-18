# u01 — Design tokens and the cozy light theme

**Epic:** UI shell **Release:** v0.16.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
The app opens warm and light: cream page, off-white panels, ink text, terracotta accent, sage
for active states, rounded corners, soft shadows. The old dark look survives as a "Night" theme
in Settings. Headings use one bundled display font (Fraunces). The stylesheet gets spacing,
radius, shadow and type tokens, one breakpoint instead of two near-identical ones, and no
duplicate rules.

## Context the implementer needs
- `src/ui/styles.css` L1–15: the `:root` block (`--bg`, `--panel`, `--line`, `--text`, `--muted`,
  `--sand`, `--teal`, `--paper`, `--danger`). About 257 rules use these names; keep each legacy
  name as an alias.
- Duplicates to merge: `.panel-slot` L256/L309; `.thumb` L364/L391; `.statusbar` L375/L384;
  `.shortcut-list` + `li` + `kbd` L440–448/L706–708; `.toast-stack`/`.toast` in
  `src/ui/together/together.css` L37–38 vs `styles.css` L723–744 (keep styles.css: bottom-centre).
- Breakpoints: `@media (max-width: 1360px)` L395 and `(max-width: 1359px)` L401. JS breakpoint
  `NARROW_BAR = '(max-width: 1099px)'` in `src/ui/TopBar.tsx` L17 (`useMediaQuery`).
- `var(--paper)` is used once, `styles.css` L683 (gallery thumb background): it means "plan
  paper off-white", not the page.
- Settings: `src/settings/index.ts` `Settings` L13–54, `DEFAULT_SETTINGS` L62, `normalizeSettings`
  L93 (enum pattern: `toneMapping`). UI: `src/ui/SettingsDialog.tsx` `Language` field block.
  `App.tsx` L117–125 applies `--ui-scale` from a settings subscription; copy that shape.
- Font precedent: `src/io/export/planFonts.ts` imports `.ttf` from `src/io/export/fonts/`;
  `docs/ASSETS.md` "Bundled in the source tree" table lists committed fonts.
- `electron/main.ts` L343 `backgroundColor: '#171a1f'`. New strings go in `src/i18n/en.ts` and `pt.ts`.

## Steps
1. `tests/settings/theme.test.ts` (new): `normalizeSettings({}).theme === 'cozy'`;
   `normalizeSettings({ theme: 'night' }).theme === 'night'`;
   `normalizeSettings({ theme: 'blue' } as never).theme === 'cozy'`; `DEFAULT_SETTINGS.theme === 'cozy'`.
2. `tests/ui/themeAttr.test.tsx` (new, `@vitest-environment jsdom`): import `installTheme` from
   `src/ui/theme`; call it; expect `document.documentElement.dataset.theme === 'cozy'`;
   `useSettings.getState().setSettings({ theme: 'night' })` → attribute `night`; the returned
   unsubscribe stops further updates. Reset to `cozy` in `afterEach`.
3. `tests/ui/breakpoints.test.ts` (new): read `src/ui/styles.css` with `readFileSync`; import
   `NARROW_BAR`, `COMPACT_SIDEBARS` from `src/ui/breakpoints`; assert the css contains exactly one
   `@media (max-width: 1360px)` and no `1359px`; assert `COMPACT_SIDEBARS === '(max-width: 1360px)'`
   and `NARROW_BAR === '(max-width: 1099px)'`.
4. `src/settings/index.ts`: `export type ThemeSetting = 'cozy' | 'night'`; add `theme: ThemeSetting`
   to `Settings` (doc comment: "Night is the pre-0.16 dark look."), `theme: 'cozy'` in
   `DEFAULT_SETTINGS`, and in `normalizeSettings`: `theme: source.theme === 'night' ? 'night' : 'cozy'`.
5. `src/ui/breakpoints.ts` (new): export `NARROW_BAR = '(max-width: 1099px)'` and
   `COMPACT_SIDEBARS = '(max-width: 1360px)'` with a comment that `styles.css` mirrors the same
   pixel values and `tests/ui/breakpoints.test.ts` keeps them equal. `TopBar.tsx` L17: delete the
   local constant and import `NARROW_BAR` from `./breakpoints`.
6. `src/ui/theme.ts` (new): `applyTheme(theme, root = document.documentElement)` sets
   `root.dataset.theme = theme`; `installTheme(): () => void` applies the current setting and
   subscribes to `useSettings` (only when `theme` changed). `App.tsx`: `useEffect(() => installTheme(), [])`
   next to the `--ui-scale` effect.
7. `src/ui/styles.css` `:root`: rename the old plan-paper token to `--plan-paper: #f4f0e6` and
   update L683 to use it. Then define the cozy palette: `--paper: #F6F1E7; --panel: #FFFDF8;
   --ink: #2B2620; --muted: #7A7065; --line: #E6DDCF; --accent: #C8643B; --sage: #6F8F72;
   --danger: #C8473B; color-scheme: light;` plus aliases `--bg: var(--paper); --text: var(--ink);
   --sand: var(--accent); --teal: var(--sage);`. Spacing `--s1: 4px; --s2: 8px; --s3: 12px;
   --s4: 16px; --s5: 20px; --s6: 24px; --s7: 28px; --s8: 32px;` radii `--r-sm: 6px; --r-md: 12px;
   --r-lg: 20px;` shadows `--sh-1: 0 1px 2px rgba(43,38,32,.06), 0 2px 8px rgba(43,38,32,.06);
   --sh-2: 0 8px 24px rgba(43,38,32,.14);` type `--fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px;
   --fs-lg: 18px; --fs-xl: 24px;`. Base `font-size: calc(var(--fs-sm) * var(--ui-scale, 1))`.
8. Same file, right after `:root`: `html[data-theme='night'] { color-scheme: dark; --paper: #171a1f;
   --panel: rgba(24, 28, 34, 0.82); --ink: #e7e1d6; --muted: #a39c90; --line: rgba(255,255,255,.08);
   --accent: #e8b86d; --sage: #3fb8af; --danger: #d4655a; --sh-1: 0 1px 2px rgba(0,0,0,.3);
   --sh-2: 0 10px 30px rgba(0,0,0,.35); }`. Then replace hard-coded dark colours in rules that
   would look wrong on cream: `button:hover` → `background: color-mix(in srgb, var(--ink) 6%, transparent)`;
   `button.on` → `background: color-mix(in srgb, var(--sage) 18%, transparent); border-color: var(--sage); color: var(--ink)`;
   `input, select` background → `var(--panel)`; `.stage` background (L231 `#12151a`) → `var(--paper)`;
   `.toast` background → `var(--panel)`, `border-left-color: var(--accent)`, `box-shadow: var(--sh-2)`;
   `.thumb img` background (`#1c2228`) → `var(--line)`. Panels/top bar/rail (`L78` rule) get
   `border-radius: var(--r-md)` only where they are floating (`.floating-panel`, `.modal`, `.toast`,
   `.menu-pop`, `.glass`); fixed bars stay square. Buttons: `border-radius: var(--r-sm)`.
9. Same file: merge each duplicate pair listed in Context into one rule (union of declarations,
   later value wins); collapse the two breakpoints into one `@media (max-width: 1360px)` block;
   delete `.toast-stack` and `.toast` from `together.css`.
10. Font: run `npm view @fontsource-variable/fraunces version`, then
    `npm pack @fontsource-variable/fraunces@<version> --pack-destination /tmp/fraunces` and copy
    `package/files/fraunces-latin-wght-normal.woff2` to `src/ui/fonts/Fraunces-latin-wght.woff2`
    (OFL-1.1). Add `@font-face { font-family: 'Fraunces'; src: url('./fonts/Fraunces-latin-wght.woff2') format('woff2'); font-weight: 300 900; font-display: swap; }`
    at the top of `styles.css` and `h1, h2, h3, .wordmark { font-family: 'Fraunces', Georgia, serif; font-weight: 600; }`.
    Append a row to the "Bundled in the source tree" table in `docs/ASSETS.md`: asset, source
    (`npm @fontsource-variable/fraunces@<version>`), author "Undercase Type", licence OFL-1.1, date,
    `shasum -a 256` of the file, path. If `npm pack` has no network, skip this step and say so in
    the summary.
11. `src/ui/SettingsDialog.tsx`: after Language add a `Theme` select, options `Cozy` / `Night`,
    bound to `settings.theme`. Keys: `Theme` → `Tema`, `Cozy` → `Acolhedor`, `Night` → `Noite`.
12. `electron/main.ts` L343: `backgroundColor: '#F6F1E7'`. `docs/DESIGN.md` "Visual identity":
    describe the cozy palette; Night is the alternate theme.

## Tests to add
- `tests/settings/theme.test.ts` — default and normalisation of `theme`.
- `tests/ui/themeAttr.test.tsx` — `installTheme` drives `<html data-theme>` from the store.
- `tests/ui/breakpoints.test.ts` — one CSS breakpoint, JS constants match.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/settings tests/ui tests/i18n` green.
- `grep -c '@media (max-width: 13' src/ui/styles.css` prints `1`; `grep -n 'toast' src/ui/together/together.css` prints nothing.
- `npm run build` succeeds and `ls dist/assets | grep -i fraunces` lists the font (when step 10 ran).
- `npm run dev`, open the app: cream page, dark text, terracotta accent; Settings → Theme → Night restores the dark look without reload.

## Out of scope / forbidden
- Do not edit existing tests or user-facing strings beyond the new keys listed.
- Do not restyle individual screens (that is u02–u10); only tokens, aliases and the rules named above.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new npm dependencies; the font file is copied in, not installed as a package.
