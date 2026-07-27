#!/usr/bin/env node
// Nightly step 1 (cheap, no AI): refresh registry data for every watched
// package. If a package's deprecated/latest facts changed since last check,
// any existing AI research on it is treated as stale and re-queued. Prints
// the current needs-research queue so the caller can decide whether to
// bother invoking Claude at all tonight.
import { loadState, saveState } from './lib/state.mjs';
import { fetchRegistryInfo, mapWithConcurrency } from './lib/registry.mjs';

const state = loadState();
const names = Object.keys(state.packages).filter((n) => state.packages[n].watched);

await mapWithConcurrency(names, 8, async (name) => {
  const entry = state.packages[name];
  const registry = await fetchRegistryInfo(name);
  if (!registry) return;

  const changed = registry.latest !== entry.latest || registry.deprecated !== entry.deprecated;
  entry.latest = registry.latest;
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
process.stdout.write(JSON.stringify({ checked: names.length, needsResearch }, null, 2) + '\n');
