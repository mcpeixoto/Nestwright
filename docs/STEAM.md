# Steam readiness

Nestwright ships as an Electron app. Steam is optional: if the client or `steamworks.js` is missing, the game runs without it. The placeholder app id **480** (Spacewar, Valve's public test app) is used only in development when `NESTWRIGHT_STEAM=1` and neither `NESTWRIGHT_STEAM_APPID` nor a `steam_appid.txt` is set. Replace it with the real app id before any upload. Do not ship 480.

```sh
NESTWRIGHT_STEAM=1 NESTWRIGHT_STEAM_APPID=480 npm run electron:dev
```

A packaged build reads `steam_appid.txt` (one integer) from, in order: next to the executable, `Contents/Resources` (where electron-builder `extraResources` places it), then the working directory. The file is copied into the app only when it exists at build time. There is no secret in the repo.

## Partner account and app id

1. Sign up at [Steamworks](https://partner.steamgames.com/). Steam charges a one-time app fee (currently 100 USD) when the app is created. That fee is recouped after the product reaches 1,000 USD in adjusted proceeds.
2. Complete the paperwork Steam asks for (tax, bank, company). The owner does this.
3. Create the app. Copy the numeric **App ID**.
4. Write that id into `steam_appid.txt` in the repo root before `npm run dist:mac`, and into the `YOUR_APP_ID` placeholder in `scripts/steam/app_build.vdf`.
5. In Steamworks, set the app name to Nestwright and the launch executable to the packaged binary (`Nestwright.app` on macOS, `Nestwright.exe` on Windows).

## Depots

Create three depots and paste their ids over the placeholders:

| Depot placeholder | Contents | Built by |
| --- | --- | --- |
| `YOUR_DEPOT_MAC_ARM64` | `release/mac-arm64/` | `npm run dist:mac` today |
| `YOUR_DEPOT_MAC_X64` | `release/mac/` | a later `electron-builder --mac --x64` |
| `YOUR_DEPOT_WIN_X64` | `release/win-unpacked/` | `electron-builder --win --x64` (nsis config is already in `electron-builder.yml`) |

Only the macOS arm64 dmg and zip are built in this wave. The Windows nsis x64 target is configured and not built here.

## steamcmd upload

Install [steamcmd](https://developer.valvesoftware.com/wiki/SteamCMD). The template is `scripts/steam/`:

- `app_build.vdf` — app id and the three depot scripts
- `depot_mac_arm64.vdf`, `depot_mac_x64.vdf`, `depot_win_x64.vdf` — file mappings, no credentials
- `upload.sh` — `steamcmd +login "$STEAM_USERNAME" +run_app_build … +quit`

`STEAM_USERNAME` is the partner account. steamcmd prompts for the password and the Steam Guard code. Do not write either into the script or the vdf files.

```sh
STEAM_USERNAME=you scripts/steam/upload.sh
```

Set the build live on a branch (beta or default) in Steamworks after it finishes. Do not set it live on the public branch until the store page and review are done.

## Store page assets

A person draws these. Sizes are the Steamworks graphical-asset requirements. Export PNG except where noted.

| Asset | Size (px) | Status |
| --- | --- | --- |
| Header capsule | 460 × 215 | TODO |
| Small capsule | 231 × 87 | TODO |
| Main capsule | 616 × 353 | TODO |
| Vertical capsule | 374 × 448 | TODO |
| Library capsule | 600 × 900 | TODO |
| Library header | 920 × 430 | TODO |
| Library hero | 3840 × 1240 | TODO |
| Library logo (transparent PNG) | 1280 × 720 | TODO |
| Page background (optional) | 1438 × 810 | TODO |
| Community / client icon | 184 × 184, plus a `.ico` for Windows | TODO |
| Screenshots | 1920 × 1080, at least five | TODO |

Short description, long description, and the trailer are also the owner's to write. Pricing is left to the owner; this doc does not set a price.

## Achievements

Create one Steamworks achievement per row. The API name is the id. The in-game panel and the Steam unlock call use that same id. An achievement whose feature is not in the build is hidden (co-op is hidden until a `src/together` or `src/coop` module exists; budget is hidden until the project budget has a `target`, `limit`, or `cap` field).

| API name | Name | Description |
| --- | --- | --- |
| `first-wall` | First wall | Place a wall on the plan. |
| `first-room` | First room | Close a loop of walls. |
| `ten-rooms` | Ten rooms | Lay out ten rooms. |
| `two-storeys` | Two storeys | Add a second floor. |
| `roof-over-head` | Roof over head | Cover the house with a roof. |
| `green-thumb` | Green thumb | Plant one hundred plants. |
| `pool-day` | Pool day | Add a swimming pool. |
| `night-owl` | Night owl | Walk through the house at night. |
| `cat-mode` | Cat mode | Drop down to the floor in walk mode. |
| `together` | Together | Join a shared editing session. |
| `dream-house` | Dream house | Roof a home of at least 150 m², with a garden and fifty things in it. |
| `interior-designer` | Interior designer | Paint twenty surfaces. |
| `photographer` | Photographer | Export a photo. |
| `budget-master` | Budget master | Set a budget target and stay under it. |

Co-op should call `noteCoopSession()` from `src/achievements/signals.ts`, or dispatch a `nestwright:coop-session` event on `window`, when a session starts. Until that module is in the tree, Together stays hidden.

Progress is stored in `localStorage` under `nestwright:achievements`, not in the `.nest` file.

## Workshop

Not built. The plan: one Workshop item is one `.nest` file (the same JSON the game already saves). Title comes from `project.name`. The preview image is a PNG from the photo export. Subscribing downloads that single file into the user's Nestwright folder; Open reads it like any other project. No extra package format. Upload stays out of the game until the Workshop legal terms and the UGC age-rating answers are done.

## macOS notarisation

The current `electron-builder.yml` sets `hardenedRuntime: false` and `identity: null` so a local arm64 build does not need a certificate. That build is not notarised and Gatekeeper will warn. `scripts/install-mac.sh` copies `release/mac-arm64/Nestwright.app` to `~/Applications` and runs `xattr -dr com.apple.quarantine` on it. That is a developer convenience, not a ship path.

To notarise:

1. Enroll in the Apple Developer Program. Create a **Developer ID Application** certificate for the owner.
2. In `electron-builder.yml`, set `mac.identity` to that certificate's name and `mac.hardenedRuntime` to `true`. Add entitlements Electron needs (`com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, and `com.apple.security.cs.disable-library-validation` if the Steam overlay must load).
3. Export an app-specific password for the Apple ID. Provide `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` to electron-builder so it notarises during `npm run dist:mac`.
4. Or submit by hand after the dmg exists:

```sh
xcrun notarytool submit release/Nestwright-0.1.0-arm64.dmg \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
xcrun stapler staple release/Nestwright-0.1.0-arm64.dmg
```

5. Confirm with `spctl -a -vv -t install release/Nestwright-0.1.0-arm64.dmg`.

## Age rating

The owner fills the IARC questionnaire in Steamworks. Notes from the current build, not a submitted rating:

- No violence, sexual content, strong language, drugs, or gambling.
- No chat, no user profiles beyond the Steam account, no location sharing.
- Players do not interact with strangers inside the game yet. When Workshop ships, the questionnaire's user-generated-content and online-interaction answers have to be revised before release.
- No in-app purchases in this build. If pricing later includes them, say so in the questionnaire.

## Smoke tests

Playwright is not part of `npm test` or CI. The CI runner may not have a browser.

```sh
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` builds the app, serves `vite preview`, and runs `tests/e2e` in Chromium with SwiftShader (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`). The smoke test checks that the app loads without console errors, that drawing a 4×4 room with the wall tool shows a 16 m² label, that the 3D canvas is not a blank frame, and that the autosave in `localStorage` contains the walls. The native save dialog is not driven headless.
