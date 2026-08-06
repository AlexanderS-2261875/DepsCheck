#!/usr/bin/env node
// Reads package.json for <targetDir> (or its nearest parent), syncs its
// dependency set against the local cache (adding new packages, detaching
// ones that were removed/replaced since last check), and prints a report.
// Packages already in the cache with research on file are reported straight
// from there — no network call, no AI call. Run via the /dcheck slash command.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadState, saveState, type State } from './lib/state.ts';
import { extractMajor } from './lib/registry.ts';
import { syncProjectDeps } from './lib/project.ts';
import { classifyDeps, collectDeps } from './lib/deps.ts';

function findPackageJson(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const targetDir = process.argv[2] || process.cwd();
const pkgPath = findPackageJson(targetDir);
if (!pkgPath) {
  console.error(JSON.stringify({ error: `No package.json found from ${targetDir} upward.` }));
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
// Local, workspace and git deps are set aside here rather than looked up —
// the registry would answer about an unrelated package of the same name.
const { registry: registryDeps, skipped } = classifyDeps(collectDeps(pkg));

// An unreadable cache is reported in the same JSON shape as any other failure,
// so /dcheck surfaces the reason instead of a raw stack trace.
let state: State;
try {
  state = loadState();
} catch (err) {
  console.error(JSON.stringify({ error: (err as Error).message }));
  process.exit(1);
}

const { removed, newlyAdded } = await syncProjectDeps(state, pkgPath, registryDeps);

const results = [];
for (const dep of registryDeps) {
  const entry = state.packages[dep.registryName];

  const currentMajor = extractMajor(dep.range);
  const latestMajor = extractMajor(entry.latest);
  const majorsBehind = currentMajor != null && latestMajor != null ? latestMajor - currentMajor : null;
  const flagged = Boolean(entry.deprecated) || (majorsBehind != null && majorsBehind >= 1);
  // No latest means the lookup never succeeded — that's an open question, not
  // a clean bill of health, so it gets its own status rather than "ok".
  const status = entry.latest === null ? 'unknown' : flagged ? 'flagged' : 'ok';

  if (flagged && !entry.aiSummary) {
    entry.needsResearch = true;
  }

  results.push({
    name: dep.declaredAs,
    ...(dep.registryName !== dep.declaredAs ? { aliasOf: dep.registryName } : {}),
    declaredRange: dep.range,
    latest: entry.latest,
    deprecated: entry.deprecated,
    majorsBehind,
    flagged,
    status,
    // ?? null so entries written before this field existed read as "fine",
    // not as a missing key the caller has to reason about.
    registryError: entry.registryError ?? null,
    aiSummary: entry.aiSummary,
    suggestedAction: entry.suggestedAction,
    researchedAt: entry.researchedAt,
    pendingResearch: flagged && !entry.aiSummary,
  });
}

saveState(state);

process.stdout.write(JSON.stringify({
  project: path.basename(path.dirname(pkgPath)),
  packageJson: pkgPath,
  newlyAdded,
  removed,
  results,
  skipped,
}, null, 2) + '\n');
