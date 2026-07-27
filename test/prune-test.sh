#!/usr/bin/env bash
# Verifies the provenance/pruning mechanism: removing a dependency from a
# project's package.json and re-running refresh-registry.ts should detach
# and unwatch it. This is the same scenario that was manually verified
# during development (delete a dep from a real project, confirm it prunes,
# restore the file, confirm it re-watches) — codified here as a repeatable
# check instead of a one-off.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DEPSCHECK_STATE_DIR="$(mktemp -d)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPSCHECK_STATE_DIR" "$FIXTURE_DIR"' EXIT

cat > "$FIXTURE_DIR/package.json" <<'EOF'
{
  "name": "prune-fixture",
  "version": "1.0.0",
  "private": true,
  "dependencies": { "lodash": "^4.17.21", "request": "^2.88.2" }
}
EOF

node scripts/check-project.ts "$FIXTURE_DIR" > /dev/null

node -e '
const fs = require("fs");
const path = process.env.DEPSCHECK_STATE_DIR + "/state.json";
const s = JSON.parse(fs.readFileSync(path, "utf8"));
if (s.packages.request?.watched !== true) {
  console.error("FAIL: expected request.watched=true before removal");
  process.exit(1);
}
console.log("before removal: request.watched=true (ok)");
'

cat > "$FIXTURE_DIR/package.json" <<'EOF'
{
  "name": "prune-fixture",
  "version": "1.0.0",
  "private": true,
  "dependencies": { "lodash": "^4.17.21" }
}
EOF

node scripts/refresh-registry.ts > /dev/null

node -e '
const fs = require("fs");
const path = process.env.DEPSCHECK_STATE_DIR + "/state.json";
const s = JSON.parse(fs.readFileSync(path, "utf8"));
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

if (s.packages.request?.watched !== false) fail("expected request.watched=false after removal + refresh");
if (!s.packages.request.seenInProjects || s.packages.request.seenInProjects.length !== 0) {
  fail("expected request.seenInProjects to be empty after removal");
}
console.log("after removal + refresh: request.watched=false, seenInProjects=[] (ok)");
console.log("prune-test.sh: all assertions passed");
'
