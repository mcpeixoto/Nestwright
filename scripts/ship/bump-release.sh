#!/bin/zsh
# usage: scripts/ship/bump-release.sh <version> <notes> [<pr>...]
# Gate the given feature PRs (stop if any did not merge), open a version-bump PR from the new
# main (label `release`, so the Windows/Linux package job runs), then hand it to release.sh.
set -u
ver=$1; notes=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
repo=${NESTWRIGHT_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
repo=$(git -C "$repo" worktree list --porcelain | awk 'NR==1{print $2}')
export GH_REPO=${GH_REPO:-mcpeixoto/Nestwright}
(( $# > 0 )) && zsh "$here/gate.sh" "$@"
for n in "$@"; do
  st=$(gh pr view $n --json state --jq .state); print "#$n $st"
  [[ $st == MERGED ]] || { print "#$n not merged: no release"; exit 1; }
done
wt=$repo/.claude/worktrees/bump-$ver
cd "$repo" || exit 1
git fetch -q origin
git worktree add -q -b chore/v$ver "$wt" origin/main || exit 1
cd "$wt" || exit 1
npm version $ver --no-git-tag-version >/dev/null || exit 1
git commit -qam "chore(release): v$ver" || exit 1
git push -q -u origin chore/v$ver || exit 1
url=$(gh pr create --label release --title "chore(release): v$ver" --body "Version bump for $ver. $notes")
print "bump PR: $url"
pr=${url##*/}
cd "$repo" && git worktree remove --force "$wt" && git branch -D chore/v$ver >/dev/null
zsh "$here/release.sh" $pr $ver "$notes"
# Only a merged bump PR may lose its branch: deleting the head of an open PR closes it.
[[ $(gh pr view $pr --json state --jq .state) == MERGED ]] && git push -q origin --delete chore/v$ver 2>/dev/null
