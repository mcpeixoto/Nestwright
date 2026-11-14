// npm run dist:mac | dist:win | dist:linux  →  electron-builder with signing decided by the env.
//
// mac signing:   NESTWRIGHT_MAC_IDENTITY="Developer ID Application: Name (TEAMID)"
// notarisation:  APPLE_API_KEY (path to .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER,
//                or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID,
//                or APPLE_KEYCHAIN_PROFILE (+ optional APPLE_KEYCHAIN), all read by @electron/notarize.
// scripts/packaging/dist-mac-signed.sh fills these from the login keychain and ~/.appstoreconnect.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { distPlan } from './packaging/dist-plan.mjs'
import console from 'node:console'
import process from 'node:process'

const target = process.argv[2]
const extra = process.argv.slice(3)
const plan = distPlan(target, process.env)
for (const note of plan.notes) console.log(`[dist:${target}] ${note}`)
const env = { ...process.env }
// Unsigned mac builds must not pick a random identity out of the keychain.
if (target === 'mac' && !plan.signed) env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
// Run the CLI through this node so it works outside `npm run` (no node_modules/.bin on PATH).
const cli = createRequire(import.meta.url).resolve('electron-builder/cli.js')
const result = spawnSync(process.execPath, [cli, ...plan.args, ...extra], { stdio: 'inherit', env })
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
