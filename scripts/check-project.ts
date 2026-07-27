#!/usr/bin/env node
// Reads package.json for <targetDir> (or its nearest parent), syncs its
// dependency set against the local cache (adding new packages, detaching
// ones that were removed/replaced since last check), and prints a report.
// Packages already in the cache with research on file are reported straight
// from there — no network call, no AI call. Run via the /dcheck slash command.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadState, saveState } from './lib/state.ts';
import { extractMajor } from './lib/registry.ts';
import { syncProjectDeps } from './lib/project.ts';

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
const deps: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

const state = loadState();
const { removed, newlyAdded } = await syncProjectDeps(state, pkgPath, deps);

const results = [];
for (const name of Object.keys(deps)) {
  const range = deps[name];
  const entry = state.packages[name];

  const currentMajor = extractMajor(range);
  const latestMajor = extractMajor(entry.latest);
  const majorsBehind = currentMajor != null && latestMajor != null ? latestMajor - currentMajor : null;
  const flagged = Boolean(entry.deprecated) || (majorsBehind != null && majorsBehind >= 1);

  if (flagged && !entry.aiSummary) {
    entry.needsResearch = true;
  }

  results.push({
    name,
    declaredRange: range,
    latest: entry.latest,
    deprecated: entry.deprecated,
    majorsBehind,
    flagged,
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
}, null, 2) + '\n');
