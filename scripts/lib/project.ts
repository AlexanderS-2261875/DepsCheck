// Keeps state.packages[*].seenInProjects in sync with what each known
// project actually declares right now, so packages that get removed or
// replaced in a project eventually drop off the nightly watchlist instead
// of lingering forever.
import { fetchRegistryInfo } from './registry.ts';
import type { State } from './state.ts';

export interface SyncResult {
  removed: string[];
  newlyAdded: number;
}

export async function syncProjectDeps(
  state: State,
  pkgPath: string,
  deps: Record<string, string>,
): Promise<SyncResult> {
  const currentNames = Object.keys(deps);
  const prevEntry = state.projects[pkgPath];
  const prevNames = prevEntry?.lastSeenDeps ?? [];

  const removed = prevNames.filter((n) => !currentNames.includes(n));
  for (const name of removed) {
    const entry = state.packages[name];
    if (!entry) continue;
    entry.seenInProjects = (entry.seenInProjects ?? []).filter((p) => p !== pkgPath);
    if (entry.seenInProjects.length === 0) {
      entry.watched = false;
    }
  }

  let newlyAdded = 0;
  for (const name of currentNames) {
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
        seenInProjects: [],
      };
      state.packages[name] = entry;
      newlyAdded++;
    }
    entry.watched = true; // back in use somewhere, even if it was orphaned before
    if (!entry.seenInProjects) entry.seenInProjects = [];
    if (!entry.seenInProjects.includes(pkgPath)) entry.seenInProjects.push(pkgPath);
  }

  state.projects[pkgPath] = {
    lastSeenDeps: currentNames,
    lastCheckedAt: new Date().toISOString(),
  };

  return { removed, newlyAdded };
}

// Drops a project that no longer exists on disk and detaches it from every
// package it used to reference, pruning any package left with no referrers.
export function pruneMissingProject(state: State, pkgPath: string): void {
  delete state.projects[pkgPath];
  for (const entry of Object.values(state.packages)) {
    if (entry.seenInProjects?.includes(pkgPath)) {
      entry.seenInProjects = entry.seenInProjects.filter((p) => p !== pkgPath);
      if (entry.seenInProjects.length === 0) {
        entry.watched = false;
      }
    }
  }
}
