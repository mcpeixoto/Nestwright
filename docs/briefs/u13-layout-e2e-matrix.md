# u13 — Layout e2e matrix: three viewports, two languages, contrast check

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u08, u09
**Time box:** ≤ 20 min of agent work

## Goal
A Playwright spec screenshots the main menu and the editor at 1280×720 (the Electron
minimum and Steam Deck class), 1440×900 and 2560×1600, in English and Portuguese, into
`test-results/layout/`, asserts that no bar overflows the window, and runs an axe-core
colour-contrast check (WCAG AA) on the menu and the editor chrome.

## Context the implementer needs
- `playwright.config.ts`: `testDir: 'tests/e2e'`, one `viewport` 1440×900 in `use`, projects
  `webgpu` and `webgl`, `webServer` builds then runs `vite preview` on 4173.
- `tests/e2e/smoke.spec.ts` L15–27: seeds `localStorage[AUTOSAVE_KEY]` with
  `serialize(createProject('E2E', 'house'))` through `page.addInitScript`, then clicks `Continue`
  inside the dialog named `Nestwright`. `tests/e2e/portuguese.spec.ts` L36–37 switches language
  with `window.__nestwright.useSettings.getState().setSettings({ language: 'pt-PT' })`.
- Electron minimum size: `electron/main.ts` L344–345 and `electron/windowState.ts` `MIN_WIDTH`/`MIN_HEIGHT`
  (1280/720) — unchanged, just confirm.
- Chrome classes after u06–u09: `.topbar`, `.rail`, `.inspector`, `.bottombar`, `.start-panel`.
- New dev dependency allowed: `@axe-core/playwright` (^4.10). The 3D canvas has no accessible
  name and WebGPU canvases confuse axe; restrict the check to `color-contrast`.

## Steps
1. `package.json`: add `"@axe-core/playwright": "^4.10.2"` to `devDependencies` and the script
   `"test:layout": "playwright test --project layout-1280 --project layout-1440 --project layout-2560"`.
   Run `npm install` (updates `package-lock.json`).
2. `playwright.config.ts`: add
   ```ts
   const layout = (w: number, h: number) => ({
     name: `layout-${w}`,
     testMatch: /layout\.spec\.ts/,
     use: { viewport: { width: w, height: h } },
   })
   ```
   and projects `layout(1280, 720)`, `layout(1440, 900)`, `layout(2560, 1600)`; give `webgpu` and
   `webgl` `testIgnore: /layout\.spec\.ts/` so the layout spec runs only in its own projects.
3. `tests/e2e/layout.spec.ts` (new). Helpers: `seed(page)` copies the smoke autosave seeding;
   `shotName(page, screen, lang)` → `test-results/layout/${screen}-${lang}-${w}x${h}.png` from
   `page.viewportSize()`; `expectFits(page, selector)` evaluates
   `getBoundingClientRect()` of the element and asserts `right <= innerWidth + 1` and
   `bottom <= innerHeight + 1` and `width > 0`; `noPageOverflow(page)` asserts
   `document.documentElement.scrollWidth <= window.innerWidth`.
   For each `lang` in `['en', 'pt-PT']` one `test(\`layout ${lang}\`)`:
   - `seed`, `goto('/')`, `waitForFunction(() => Boolean(window.__nestwright))`, set language when pt.
   - menu: wait for the `Nestwright` dialog; `expectFits(page, '.start-panel')`; screenshot
     `shotName(page, 'menu', lang)` with `fullPage: false`; axe:
     `const menu = await new AxeBuilder({ page }).withRules(['color-contrast']).include('.start-panel').analyze(); expect(menu.violations).toEqual([])`.
   - click `Continue` (English name; in pt the button reads `Continuar` — use `getByRole('button', { name: /^(Continue|Continuar)$/ })`).
   - editor: wait for `canvas.plan-canvas`; `expectFits` for `.topbar`, `.rail`, `.inspector`,
     `.bottombar`; `noPageOverflow`; screenshot `shotName(page, 'editor', lang)`; axe with
     `.include('.topbar').include('.rail').include('.inspector').include('.bottombar')` and the
     same `color-contrast` rule; expect no violations. Collect `pageerror`/console errors as the
     smoke spec does and expect `[]`.
4. `.gitignore`: confirm `test-results/` is already ignored (add it if not).
5. `docs/ARCHITECTURE.md` "Tests" paragraph: one sentence naming `npm run test:layout` and the
   three viewports.

## Tests to add
- `tests/e2e/layout.spec.ts` — two tests (en, pt) × three projects = six runs, twelve screenshots.

## Acceptance
- `npm run typecheck && npm run lint` green (the spec is type-checked by `tsconfig.json`; confirm
  `tests/e2e` is included, otherwise add the file pattern the other specs use).
- `npm run test:layout` → 6 passed; `ls test-results/layout | wc -l` prints `12`.
- `npm run test:e2e -- tests/e2e/smoke.spec.ts` still runs only in `webgpu` and `webgl`
  (the report lists no `layout-*` row for it).
- Open `test-results/layout/editor-pt-PT-1280x720.png`: no clipped bar, no horizontal scrollbar.

## Out of scope / forbidden
- Do not fix layout bugs the spec finds; list them in the summary with the screenshot path.
- Do not edit existing specs or user-facing strings.
- Do not change `electron/` (min size stays 1280×720).
- Do not start a dev server by hand; Playwright's `webServer` does it. Do not commit, push or merge.
- Only the one dependency named above.
