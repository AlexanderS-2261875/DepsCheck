#!/usr/bin/env bash
# Not every dependency spec names a package on the public registry. A `file:`
# or `workspace:` dep shares a name with some unrelated public package often
# enough that looking it up produces a confidently wrong answer, so those are
# set aside instead. Covers the classifier and the "couldn't resolve it" path.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DEPSCHECK_STATE_DIR="$(mktemp -d)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPSCHECK_STATE_DIR" "$FIXTURE_DIR"' EXIT

# `utils` and `chalk` are both real, popular packages on npm — declared here as
# a local path and a workspace member, which is exactly the collision that used
# to make DepsCheck report a stranger's version numbers as this project's.
cat > "$FIXTURE_DIR/package.json" <<'EOF'
{
  "name": "deps-fixture",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "lodash": "^4.17.21",
    "utils": "file:./packages/utils",
    "chalk": "workspace:*",
    "express": "expressjs/express",
    "tarball-dep": "https://example.com/pkg.tgz",
    "legacy-lodash": "npm:lodash@^3.0.0",
    "depscheck-no-such-package-9c8f2a": "^1.0.0"
  }
}
EOF

node scripts/check-project.ts "$FIXTURE_DIR" > "$FIXTURE_DIR/report.json"

node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };

if (!Array.isArray(r.skipped)) fail("report has no skipped[] — the dep classifier is not wired in");

const checked = r.results.map((x) => x.name).sort();
const skipped = Object.fromEntries(r.skipped.map((s) => [s.name, s.reason]));

// --- non-registry specs never reach the registry ---
for (const [name, reason] of [["utils","local path"],["chalk","workspace protocol"],["express","git shorthand"],["tarball-dep","url tarball"]]) {
  if (!(name in skipped)) fail(`${name} should have been skipped, got: ${JSON.stringify(r.skipped)}`);
  if (skipped[name] !== reason) fail(`${name} skipped as "${skipped[name]}", expected "${reason}"`);
  if (checked.includes(name)) fail(`${name} was looked up on the registry anyway`);
}

// --- npm: aliases resolve to the package they actually point at ---
const alias = r.results.find((x) => x.name === "legacy-lodash");
if (!alias) fail("legacy-lodash should have been checked");
if (alias.aliasOf !== "lodash") fail(`expected aliasOf=lodash, got ${alias.aliasOf}`);
if (alias.declaredRange !== "^3.0.0") fail(`expected the aliased range ^3.0.0, got ${alias.declaredRange}`);
if (alias.status !== "flagged") fail(`^3 of lodash should be flagged as behind, got status=${alias.status}`);

// --- a package that cannot be resolved is not reported as up to date ---
const missing = r.results.find((x) => x.name === "depscheck-no-such-package-9c8f2a");
if (!missing) fail("the unresolvable package should still appear in results");
if (missing.status !== "unknown") fail(`expected status=unknown, got ${missing.status}`);
if (!missing.registryError) fail("expected a registryError explaining why it could not be checked");
if (missing.flagged) fail("an unresolvable package should not be flagged for research");

// --- ordinary registry deps still work ---
const lodash = r.results.find((x) => x.name === "lodash");
if (!lodash || lodash.status !== "ok") fail(`lodash should be status=ok, got ${lodash && lodash.status}`);
if (lodash.aliasOf !== undefined) fail("a plain dep should not carry aliasOf");

console.log("skipped: local path, workspace, git shorthand, url tarball (ok)");
console.log("npm: alias resolved to lodash and flagged (ok)");
console.log("unresolvable package reported as unknown, not up to date (ok)");
' "$FIXTURE_DIR/report.json"

# The cache must be keyed by what the registry knows, so the alias is stored
# under lodash and the skipped deps leave no bogus entries behind.
node -e '
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.env.DEPSCHECK_STATE_DIR + "/state.json", "utf8"));
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };

for (const name of ["utils", "chalk", "express", "tarball-dep", "legacy-lodash"]) {
  if (s.packages[name]) fail(`${name} should not be tracked as a package, it is not a registry dep`);
}
if (!s.packages.lodash) fail("lodash should be tracked");
if (!s.projects[Object.keys(s.projects)[0]].lastSeenDeps.includes("lodash")) fail("lastSeenDeps should hold registry names");

console.log("cache holds registry names only, no bogus entries (ok)");
console.log("deps-test.sh: all assertions passed");
'
