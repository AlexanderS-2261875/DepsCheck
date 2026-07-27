#!/usr/bin/env bash
# Runs check-project.ts against a real fixture project and asserts the
# output shape and flag detection are correct. Uses a throwaway state dir
# so this never touches your real cache.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DEPSCHECK_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPSCHECK_STATE_DIR"' EXIT

echo "Using throwaway state dir: $DEPSCHECK_STATE_DIR"

OUTPUT="$(node scripts/check-project.ts test/fixtures/sample-project)"
echo "$OUTPUT"

echo "$OUTPUT" | node -e '
const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
const byName = Object.fromEntries(data.results.map((r) => [r.name, r]));
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

if (data.results.length !== 2) fail(`expected 2 dependencies in fixture output, got ${data.results.length}`);
if (!byName.request) fail("expected request in results");
if (byName.request.flagged !== true) fail("expected request to be flagged (known-deprecated fixture package)");
if (!byName.request.deprecated) fail("expected request.deprecated to be a non-empty message");
if (!byName.lodash) fail("expected lodash in results");
if (byName.lodash.flagged !== false) fail("expected lodash not to be flagged (stable major-4 fixture package)");

console.log("smoke-test.sh: all assertions passed");
'
