#!/bin/zsh
# usage: scripts/ship/gate.sh <pr> [<pr>...]
# Merge gate: squash-merge each PR only once no check is pending and every check passed
# (pass or skipping). A red or conflicting PR is reported and dropped, never merged.
# Never uses `gh pr merge --auto` (merges at once with no required checks) or `--watch`
# (treats a cancelled/timed-out job as passing).
# Note: this folder is not called `release/` because .gitignore ignores every `release/` dir.
set -u
repo=${NESTWRIGHT_REPO:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}
cd "$repo" || exit 1
export GH_REPO=${GH_REPO:-mcpeixoto/Nestwright}
typeset -a todo; todo=("$@")
while (( ${#todo} > 0 )); do
  typeset -a next; next=()
  for n in $todo; do
    state=$(gh pr view $n --json state --jq .state 2>/dev/null)
    if [[ $state == MERGED || $state == CLOSED ]]; then printf '%s #%s %s\n' "$(date +%H:%M)" $n $state; continue; fi
    buckets=$(gh pr checks $n --json bucket --jq '.[].bucket' 2>/dev/null)
    if [[ -z $buckets ]] || print -r -- "$buckets" | grep -q pending; then next+=$n; continue; fi
    # A skipped job registers before CI's verify job exists; without verify there is nothing to trust yet.
    verify=$(gh pr checks $n --json name --jq '[.[] | select(.name == "verify")] | length' 2>/dev/null)
    if [[ ${verify:-0} -lt 1 ]]; then next+=$n; continue; fi
    if gh pr checks $n --json bucket --jq 'length > 0 and all(.[]; .bucket == "pass" or .bucket == "skipping")' | grep -qx true; then
      mg=$(gh pr view $n --json mergeable --jq .mergeable)
      if [[ $mg == UNKNOWN ]]; then next+=$n; continue; fi  # GitHub still computing
      if [[ $mg != MERGEABLE ]]; then printf '%s #%s not mergeable (%s), dropped\n' "$(date +%H:%M)" $n $mg; continue; fi
      if gh pr merge $n --squash; then printf '%s #%s merged: %s\n' "$(date +%H:%M)" $n "$(gh pr view $n --json state --jq .state)"
      else printf '%s #%s merge command failed\n' "$(date +%H:%M)" $n; fi
    else
      printf '%s #%s RED: %s\n' "$(date +%H:%M)" $n "$(gh pr checks $n --json name,bucket --jq '[.[]|select(.bucket!="pass" and .bucket!="skipping")|.name+"="+.bucket]|join(",")')"
    fi
  done
  todo=($next)
  (( ${#todo} > 0 )) && sleep 60
done
printf 'gate done\n'
