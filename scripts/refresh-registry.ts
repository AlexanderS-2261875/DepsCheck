#!/usr/bin/env node
// Nightly step 1 (cheap, no AI):
//   a) re-diff every known project still on disk against its package.json,
//      so packages removed/replaced since the last check drop off the
//      watchlist (or get pruned entirely if this was their only referrer);
//      projects whose path no longer exists get detached outright.
//   b) refresh registry data (latest version, deprecated flag) for
//      everything still actually watched.
// If a package's facts changed since last check, any existing AI research
// on it is treated as stale and re-queued. Prints the current
// needs-research queue so the caller can decide whether to bother invoking
// Claude at all tonight.
import { existsSync, readFileSync } from 'node:fs';
import { loadState, saveState } from './lib/state.ts';
import { fetchRegistryInfo, mapWithConcurrency } from './lib/registry.ts';
import { syncProjectDeps, pruneMissingProject } from './lib/project.ts';

const state = loadState();

const projectPaths = Object.keys(state.projects);
const prunedProjects: string[] = [];
for (const pkgPath of projectPaths) {
  if (!existsSync(pkgPath)) {
    prunedProjects.push(pkgPath);
    pruneMissingProject(state, pkgPath);
    continue;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue;
  }
  const deps: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  await syncProjectDeps(state, pkgPath, deps);
}

const names = Object.keys(state.packages).filter((n) => state.packages[n].watched);

await mapWithConcurrency(names, 8, async (name) => {
  const entry = state.packages[name];
  const registry = await fetchRegistryInfo(name);
  if (!registry) return;

  const changed = registry.latest !== entry.latest || registry.deprecated !== entry.deprecated;
  entry.latest = registry.latest ?? null;
  entry.deprecated = registry.deprecated;
  entry.lastCheckedRegistry = new Date().toISOString();

  if (changed && entry.aiSummary) {
    entry.aiSummary = null;
    entry.suggestedAction = null;
    entry.researchedAt = null;
  }
  if (registry.deprecated && !entry.aiSummary) {
    entry.needsResearch = true;
  }
});

saveState(state);

const needsResearch = names.filter((n) => state.packages[n].needsResearch);
process.stdout.write(JSON.stringify({
  checkedProjects: projectPaths.length - prunedProjects.length,
  prunedProjects,
  checkedPackages: names.length,
  needsResearch,
}, null, 2) + '\n');
