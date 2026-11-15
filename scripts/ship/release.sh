#!/bin/zsh
# usage: scripts/ship/release.sh <bump-pr> <version> <notes>
# Gate the version-bump PR, build the universal mac app from its merge commit (content pack
# included), and only then tag, publish the GitHub pre-release, install, and smoke-check.
# Logs and the smoke screenshot go to $NESTWRIGHT_OUT (default: a temp dir).
set -u
pr=$1; ver=$2; notes=$3
here=$(cd "$(dirname "$0")" && pwd)
repo=${NESTWRIGHT_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
# Work from the primary checkout even when called from a worktree.
repo=$(git -C "$repo" worktree list --porcelain | awk 'NR==1{print $2}')
out=${NESTWRIGHT_OUT:-$(mktemp -d -t nestwright-release)}
export GH_REPO=${GH_REPO:-mcpeixoto/Nestwright}
zsh "$here/gate.sh" $pr || exit 1
[[ $(gh pr view $pr --json state --jq .state) == MERGED ]] || { print "bump PR not merged"; exit 1; }
sha=$(gh pr view $pr --json mergeCommit --jq .mergeCommit.oid)
wt=$repo/.claude/worktrees/build-$ver
cd "$repo" || exit 1
git fetch -q origin
git worktree add -q --detach "$wt" $sha || exit 1
cd "$wt" || exit 1
[[ $(node -p "require('./package.json').version") == $ver ]] || { print "version mismatch"; exit 1; }
npm ci --silent || exit 1
npm run content:fetch 2>&1 | tail -3
# Build before tagging: a failed build must not leave an orphan tag behind.
npm run dist:mac > "$out/dist-$ver.log" 2>&1 || { grep -vE '^\s+at ' "$out/dist-$ver.log" | tail -8; print "BUILD FAILED, not tagged"; exit 1; }
ktx=$(find release -path '*Contents/Resources/content*' -name '*.ktx2' | wc -l | tr -d ' ')
print "packaged content: $ktx ktx2"
(( ktx > 0 )) || { print "NO CONTENT PACKAGED, not tagged"; exit 1; }
git tag -a v$ver -m "v$ver" && git push -q origin v$ver || exit 1
assets=(release/*${ver}*.dmg(N) release/*${ver}*.zip(N))
print "assets: $assets"
gh release create v$ver $assets --prerelease --title "Nestwright $ver" --notes "$notes" || exit 1
bash scripts/install-mac.sh 2>&1 | tail -2
gh release view v$ver --json assets --jq '.assets[].name'
defaults read ~/Applications/Nestwright.app/Contents/Info.plist CFBundleShortVersionString
sd=$out/smoke-$ver; rm -rf "$sd"; mkdir -p "$sd"
timeout 150 ~/Applications/Nestwright.app/Contents/MacOS/Nestwright --smoke="$sd" 2>&1 | grep smoke
grep -i "content pack" "$sd/console.log"
ls -la "$sd/smoke.png"
cd "$repo" && git worktree remove --force "$wt"
print "release $ver done (logs in $out)"
