# Steam checklist

The Steam bridge, the achievement list, and the macOS, Windows, and Linux build commands exist. A real app id does not. Store setup, depots, SteamPipe upload, and Steam Cloud wait on that id. Do not ship app id 480 (Spacewar).

## Partner account and calendar (owner)

- [ ] **(owner)** Create the partner account at [Steamworks](https://partner.steamgames.com/). Steam Direct is **$100 per app**, recouped after **$1,000 adjusted gross revenue**.
- [ ] **(owner)** Complete the tax interview.
- [ ] **(owner)** Complete bank and identity verification.
- [ ] **(owner)** After paying the fee, wait **21 days** per Valve's onboarding page. Some Valve pages still say 30. Check the Steamworks dashboard.
- [ ] **(owner)** Put the Coming Soon page public **at least 2 weeks** before release.
- [ ] **(owner)** Store page review takes **3–5 business days**. Submit **at least 7 business days** ahead.
- [ ] **(owner)** Build review takes **3–5 business days**. Plan **at least 7 business days**.

| When | What |
| --- | --- |
| Dec 2026 | Paperwork |
| Jan 2027 | Coming Soon page target |
| Mar 2027 | Closed playtest (Steam Playtest) |
| Early Apr 2027 | Public demo |
| 25 Apr 2027 | Next Fest registration closes |
| 3 Jun 2027 | Press preview starts (third-party source — check the Steamworks event page) |
| 14–21 Jun 2027 | Next Fest (starts 10:00 PDT) |
| 24 Jun – 8 Jul 2027 | Summer Sale |
| Jul 2027 | Launch |

## App id

- [ ] **(owner)** Create the app in Steamworks and copy the numeric app id.
- [ ] Write that integer, alone, into `steam_appid.txt` in the repo root. `scripts/build-electron.mjs` copies it into the app's Resources at build time. There is no secret in the file.
- [ ] Replace `YOUR_APP_ID` and the `YOUR_DEPOT_*` placeholders in `scripts/steam/*.vdf` with the Steamworks ids.
- [ ] Dev only: `NESTWRIGHT_STEAM=1` uses 480. `NESTWRIGHT_STEAM_APPID` overrides that number. Example: `NESTWRIGHT_STEAM=1 NESTWRIGHT_STEAM_APPID=480 npm run electron:dev`.
- [ ] When the Steam client launches the game it sets `SteamAppId`. The bridge honors it. Resolution order is file, then `SteamAppId`, then the dev flag.
- [ ] A packaged build that resolves to 480 logs a warning. Never ship 480.
- [ ] With the real id in Resources, `restartAppIfNecessary` relaunches the game through Steam when it is started outside the client.

## Builds

Unsigned unless the signing env is set. Steam does not require Authenticode on Windows.

- [ ] `npm run dist:mac` — universal arm64+x64. Unsigned unless the env below is set. Output: `release/mac-universal/Nestwright.app`.
- [ ] `npm run dist:mac:signed` — Developer ID from the login keychain, App Store Connect API key in `~/.appstoreconnect`, notarised via `@electron/notarize`.
- [ ] `npm run dist:win` — x64 `dir` plus portable, unsigned. Output: `release/win-unpacked/`.
- [ ] `npm run dist:linux` — x64 `dir` plus AppImage. Output: `release/linux-unpacked/`.
- [ ] Notarisation uses one of: `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`, or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`. Signing identity: `NESTWRIGHT_MAC_IDENTITY`.
- [ ] Entitlements in `build/entitlements.mac.plist`: allow-jit, allow-unsigned-executable-memory, disable-library-validation, allow-dyld-environment-variables (Steam overlay).
- [ ] Installed-size budget is 2 GiB. Check with `npm run size:check -- release/win-unpacked …`.
- [ ] CI: the `Package` workflow builds Windows and Linux on PRs labelled `release` and on `v*` tags, and fails over the budget. Tags keep the AppImage and portable exe as artifacts for 3 days.
- [ ] Name: see `docs/NAME-CHECK.md` before the Coming Soon page goes public.

## Depots

One depot per OS. Create them in Steamworks and paste the ids over the placeholders.

| Depot placeholder | Content root | OS | Launch |
| --- | --- | --- | --- |
| `YOUR_DEPOT_MAC` | `release/mac-universal` | macOS | `Nestwright.app` |
| `YOUR_DEPOT_WIN_X64` | `release/win-unpacked` | Windows 64-bit | `Nestwright.exe` |
| `YOUR_DEPOT_LINUX_X64` | `release/linux-unpacked` | Linux + SteamOS | `nestwright` |

- [ ] Set each depot's OS and launch option as in the table.
- [ ] Steam Deck can run the Linux depot natively or the Windows depot under Proton.
- [ ] Steam Deck compatibility review happens after release-candidate builds are uploaded.

## SteamPipe upload

Templates live in `scripts/steam/`. No passwords in the scripts or the vdf files.

- `app_build.vdf` — app id, description, content root `../../release`, build output `../../release/steam-output`, empty `SetLive`, `Preview` 0, and the three depot scripts.
- `depot_mac.vdf`, `depot_win_x64.vdf`, `depot_linux_x64.vdf` — one content root each. Linux excludes `*.pdb`.
- `upload.sh` — checks below, then `steamcmd +login "$STEAM_USERNAME" +run_app_build … +quit`.

`STEAM_USERNAME` is the partner account. steamcmd prompts for the password and Steam Guard. Do not store either.

`SetLive` stays empty, so an upload does not go live. Set the build live on a beta branch first. Move it to the default branch only after the store page and review are done.

- [ ] Install [steamcmd](https://developer.valvesoftware.com/wiki/SteamCMD).
- [ ] Fill every `YOUR_` placeholder. `upload.sh` exits if any remain, if `steam_appid.txt` is missing or is 480, or if a content directory is missing or empty (it prints the `npm run dist:*` command for each one).
- [ ] `STEAM_USERNAME=you scripts/steam/upload.sh`
- [ ] `scripts/steam/upload.sh --preview` copies the vdfs to a temp directory, sets `Preview` to `1`, and points the content paths at the same `release/` folders. steamcmd reports and does not upload.
- [ ] **(owner)** Set a good build live on a beta branch, then on default when review is done.

## Steam Cloud

Auto-Cloud cannot see the current autosave. It is in `localStorage`. File saves are Track P3: they will live in `<userData>/saves`.

Electron `userData`:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\Nestwright` |
| macOS | `~/Library/Application Support/Nestwright` |
| Linux | `~/.config/Nestwright` |

- [ ] **(owner)** Enable Auto-Cloud only after `.nest` saves exist on disk. Root `WinAppDataRoaming`, subdirectory `Nestwright/saves`, pattern `*.nest`, OS `[Cross-Platform]`.
- [ ] **(owner)** Root override (macOS): original root `WinAppDataRoaming`, OS macOS, new root `MacAppSupport`. No Add/Replace Path.
- [ ] **(owner)** Root override (Linux): original root `WinAppDataRoaming`, OS Linux, new root `LinuxHome`, Add/Replace Path `.config` (inserted before `Nestwright/saves`, Replace Path off).
- [ ] **(owner)** Set the byte quota and file quota per app in Steamworks.
- [ ] Proton runs the Windows build, so those saves sit in the Proton prefix and sync as Windows.

## Stats and rich presence

- [ ] Stats are integers set through the bridge (`setStat`). Changes are stored at most once every 5 seconds and flushed on quit.
- [ ] **(owner)** A progress achievement is an achievement bound to a stat in Steamworks.
- [ ] The bridge sets rich presence `status` (free text, 120 characters or fewer) and `steam_display` to `#Status`.
- [ ] **(owner)** Upload a rich presence localization file for english and portuguese:

```
"lang"
{
	"Language" "english"
	"Tokens"
	{
		"#Status" "%status%"
	}
}
"lang"
{
	"Language" "portuguese"
	"Tokens"
	{
		"#Status" "%status%"
	}
}
```

- [ ] Test at <https://steamcommunity.com/dev/testrichpresence>.
- [ ] On Deck, the floating gamepad keyboard opens over a focused text field.

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

- [ ] **(owner)** Create each row in Steamworks. Leave Together and Budget master hidden until their features are in the build.

## Workshop

Not built. One Workshop item is one `.nest` file (the JSON the game already saves). The title is `project.name`. The preview is a PNG from the photo export. Subscribing downloads that file into the player's Nestwright folder; Open reads it like any other project. No extra package format. Upload stays out of the game until the Workshop legal terms and the UGC age-rating answers are done.

## Store page assets

PNG unless noted. Capsules carry no text except the title.

| Asset | Size |
| --- | --- |
| Header capsule | 920×430 |
| Small capsule | 462×174 |
| Main capsule | 1232×706 |
| Vertical capsule | 748×896 |
| Page background (optional) | 1438×810 |
| Library capsule | 600×900 |
| Library header | 920×430 |
| Library hero | 3840×1240, no text; keep key content in the centred 860×380 safe area |
| Library logo | 1280 wide and/or 720 tall, transparent PNG |
| Community icon | 184×184, plus a `.ico` |

- [ ] **(owner)** Export each capsule and library asset above.
- [ ] **(owner)** Screenshots: at least 5, 1920×1080 minimum, 16:9. Mark at least four suitable for all ages. Plan 8 or more.
- [ ] **(owner)** Trailer: `.mp4`, `.mov`, or `.wmv`. H.264 + AAC preferred. Up to 1920×1080, 5,000+ kbps, 30/29.97 or 60/59.94 fps, 16:9, audio 44.1 or 48 kHz stereo. Plan 45–75 seconds, gameplay first, and it has to work muted.

## Content Survey (owner)

This fills the IARC age rating.

- [ ] **(owner)** Mature content: the game has none of violence, sexual content, drugs, or gambling.
- [ ] **(owner)** AI-generated content: answer for what actually ships (in-game assets, text, store art). Check Valve's current wording.
- [ ] **(owner)** User-generated content and online interaction: co-op is LAN-only between two players. Revise when Workshop ships.

## Age rating (owner)

The owner fills the IARC questionnaire in Steamworks. Notes from the current build, not a submitted rating:

- No violence, sexual content, strong language, drugs, or gambling.
- No chat. No user profiles beyond the Steam account. No location sharing.
- Players do not interact with strangers in the game yet. When Workshop ships, revise the user-generated-content and online-interaction answers before release.
- No in-app purchases in this build. If a later price includes them, say so in the questionnaire.

## Smoke tests

Playwright is not part of `npm test` or CI. The CI runner may not have a browser.

```sh
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` builds the app, serves `vite preview`, and runs `tests/e2e` in Chromium with SwiftShader (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`). The smoke test checks that the app loads without console errors, that drawing a 4×4 room with the wall tool shows a 16 m² label, that the 3D canvas is not a blank frame, and that the autosave in `localStorage` contains the walls. The native save dialog is not driven headless.

Any build can check itself: `Nestwright --smoke=<dir>` opens the Family template in 3D, then writes `smoke.png`, `smoke.json` (renderer backend, WebGL renderer string, GPU feature status, perf sample) and `console.log` into `<dir>` and exits 0 only if the 3D view drew frames. It uses a throwaway data folder inside `<dir>`.

- [ ] Steam Deck: `npm run dist:linux` (and `npm run dist:win`), then `scripts/deck/smoke.sh [--win]` from the Mac. It needs key login to `deck@steamdeck.local`, refuses to run unless the Deck is in desktop mode with no game running, runs the Linux build natively and the Windows build under the newest installed Proton, copies results to `deck-smoke/<timestamp>/`, and deletes everything it put on the Deck.
