#!/usr/bin/env bash
# Clones every non-archived, non-excluded repo in $DEPSCHECK_ORG into $1
# (default: workspace/) using the gh CLI. In CI, gh must be authenticated
# via GH_TOKEN pointing at a PAT with read access to the org's private repos
# (the default GITHUB_TOKEN only sees the repo the workflow runs in).
set -euo pipefail

ORG="${DEPSCHECK_ORG:-schmittsoftware}"
WORKDIR="${1:-workspace}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUDE_FILE="$SCRIPT_DIR/../config/exclude.txt"

mkdir -p "$WORKDIR"

EXCLUDES=()
if [ -f "$EXCLUDE_FILE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && EXCLUDES+=("$line")
  done < "$EXCLUDE_FILE"
fi

is_excluded() {
  local name="$1"
  for ex in "${EXCLUDES[@]:-}"; do
    [ "$ex" = "$name" ] && return 0
  done
  return 1
}

repos=$(gh repo list "$ORG" --limit 200 --json name,isArchived --jq '.[] | select(.isArchived==false) | .name')

for repo in $repos; do
  if is_excluded "$repo"; then
    echo "skip (excluded): $repo"
    continue
  fi
  if [ -d "$WORKDIR/$repo" ]; then
    echo "already present: $repo"
    continue
  fi
  echo "cloning: $repo"
  if ! gh repo clone "$ORG/$repo" "$WORKDIR/$repo" -- --depth 1 --quiet; then
    echo "  failed to clone $repo, skipping"
  fi
done
