#!/usr/bin/env node
// Reads package.json for <targetDir> (or its nearest parent), diffs its
// dependencies against the local cache, adds any never-seen-before package
// to the watchlist with a one-off baseline registry check, and prints a
// report. Packages already in the cache are reported straight from there —
// no network call, no AI call. Run via the /dcheck slash command.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadState, saveState } from './lib/state.mjs';
import { fetchRegistryInfo, extractMajor } from './lib/registry.mjs';

function findPackageJson(startDir) {
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
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const depNames = Object.keys(deps);

const state = loadState();
const results = [];
let newlyAdded = 0;

for (const name of depNames) {
  const range = deps[name];
  let entry = state.packages[name];

  if (!entry) {
    const registry = await fetchRegistryInfo(name);
    entry = {
      watched: true,
      latest: registry?.latest ?? null,
      deprecated: registry?.deprecated ?? null,
      lastCheckedRegistry: new Date().toISOString(),
      aiSummary: null,
      suggestedAction: null,
      researchedAt: null,
      needsResearch: false,
    };
    state.packages[name] = entry;
    newlyAdded++;
  } else {
    entry.watched = true;
  }

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
  results,
}, null, 2) + '\n');
