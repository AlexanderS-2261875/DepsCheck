#!/usr/bin/env bash
# Entry point for the launchd job. Refreshes registry data for everything on
# the watchlist (cheap, no AI), and only spins up headless Claude if there's
# actually something new to research.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

LOG_DIR="$HOME/.claude/depscheck"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/nightly.log"

{
  echo "=== $(date) ==="
  RESULT="$(node scripts/refresh-registry.mjs)"
  echo "$RESULT"
  COUNT="$(node -e "console.log(JSON.parse(process.argv[1]).needsResearch.length)" "$RESULT")"
  if [ "$COUNT" -gt 0 ]; then
    echo "Researching $COUNT flagged package(s)..."
    claude -p "$(cat prompts/nightly-refresh.md)" --dangerously-skip-permissions
  else
    echo "Nothing new to research."
  fi
  echo "=== done ==="
} >> "$LOG_FILE" 2>&1
