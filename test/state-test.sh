#!/usr/bin/env bash
# The cache is expensive to rebuild — every aiSummary in it cost a nightly AI
# run — so an unreadable state.json must never be treated as a fresh start and
# quietly overwritten with one project's deps. Both halves of that contract:
# recover from the backup when there is one, refuse to run when there isn't.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DEPSCHECK_STATE_DIR="$(mktemp -d)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPSCHECK_STATE_DIR" "$FIXTURE_DIR"' EXIT

STATE="$DEPSCHECK_STATE_DIR/state.json"
fail() { echo "FAIL: $1"; exit 1; }

cat > "$FIXTURE_DIR/package.json" <<'EOF'
{
  "name": "state-fixture",
  "version": "1.0.0",
  "private": true,
  "dependencies": { "lodash": "^4.17.21" }
}
EOF

# Seed the cache, then hand-add a package belonging to a different project.
# That entry is the canary: it is not recoverable from the fixture being
# checked, so if it survives, the whole cache did.
node scripts/check-project.ts "$FIXTURE_DIR" > /dev/null

node -e '
const fs = require("fs");
const p = process.env.DEPSCHECK_STATE_DIR + "/state.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
s.packages["only-elsewhere"] = {
  watched: true, latest: "1.0.0", deprecated: null, lastCheckedRegistry: null,
  aiSummary: "expensive to regenerate", suggestedAction: null,
  researchedAt: null, needsResearch: false,
  seenInProjects: ["/some/other/project/package.json"],
};
s.projects["/some/other/project/package.json"] = { lastSeenDeps: ["only-elsewhere"], lastCheckedAt: new Date().toISOString() };
fs.writeFileSync(p, JSON.stringify(s, null, 2));
'

# A second save is what promotes the seeded cache into state.json.bak.
node scripts/check-project.ts "$FIXTURE_DIR" > /dev/null
[ -f "$STATE.bak" ] || fail "expected a state.json.bak after the second save"

# --- 1. Corrupt cache, usable backup: recover, warn, keep the evidence. ---
printf '{"packages": {"lodash":' > "$STATE"

node scripts/check-project.ts "$FIXTURE_DIR" > /dev/null 2> "$FIXTURE_DIR/stderr.txt" \
  || fail "expected recovery from backup to succeed, exited non-zero"

grep -q "recovered from" "$FIXTURE_DIR/stderr.txt" \
  || fail "expected a recovery warning on stderr, got: $(cat "$FIXTURE_DIR/stderr.txt")"

ls "$STATE".corrupt-* > /dev/null 2>&1 \
  || fail "expected the unreadable cache to be kept as a .corrupt-* copy"

node -e '
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.env.DEPSCHECK_STATE_DIR + "/state.json", "utf8"));
if (!s.packages["only-elsewhere"]) { console.error("FAIL: unrelated package was wiped by the recovery"); process.exit(1); }
if (!s.projects["/some/other/project/package.json"]) { console.error("FAIL: unrelated project was wiped by the recovery"); process.exit(1); }
console.log("corrupt cache + backup: recovered, unrelated entries intact (ok)");
'

# --- 2. Corrupt cache, no backup: refuse to run, leave the file alone. ---
rm -f "$STATE".corrupt-* "$STATE.bak"
printf '{"packages": {"lodash":' > "$STATE"

if node scripts/check-project.ts "$FIXTURE_DIR" > /dev/null 2>&1; then
  fail "expected a non-zero exit when the cache is unreadable and no backup exists"
fi

grep -q '^{"packages": {"lodash":$' "$STATE" \
  || fail "expected the unreadable cache to be left untouched, not overwritten"

echo "corrupt cache, no backup: refused to run, cache left untouched (ok)"
echo "state-test.sh: all assertions passed"
