// Shared read/write for the local DepsCheck cache. Lives outside the repo,
// under the user's home dir, so it works regardless of whether this repo is
// ever pushed anywhere, and never ends up in a public history if it is.
import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface PackageEntry {
  watched: boolean;
  latest: string | null;
  deprecated: string | null;
  lastCheckedRegistry: string | null;
  // Why the last lookup failed, or null if it succeeded. Kept alongside the
  // last known good latest/deprecated rather than replacing them.
  registryError: string | null;
  aiSummary: string | null;
  suggestedAction: string | null;
  researchedAt: string | null;
  needsResearch: boolean;
  seenInProjects: string[];
}

export interface ProjectEntry {
  lastSeenDeps: string[];
  lastCheckedAt: string;
}

export interface State {
  packages: Record<string, PackageEntry>;
  projects: Record<string, ProjectEntry>;
}

// Overridable so tests (and CI) never touch the real cache.
export const STATE_DIR = process.env.DEPSCHECK_STATE_DIR ?? path.join(os.homedir(), '.claude', 'depscheck');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');
// Always holds the last cache that parsed cleanly, one save behind the live
// file. Recovering from this is what keeps a bad write from costing nights of
// AI research.
export const BACKUP_FILE = `${STATE_FILE}.bak`;

function parseState(raw: string): State {
  const parsed = JSON.parse(raw);
  return { packages: parsed.packages ?? {}, projects: parsed.projects ?? {} };
}

// Keeps an unreadable cache around under a unique name so a human can still
// salvage it by hand. Returns where it landed, or null if even that failed.
function quarantine(file: string): string | null {
  try {
    const dest = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(file, dest);
    return dest;
  } catch {
    return null;
  }
}

export function loadState(): State {
  // No file at all is the ordinary first run, not a failure.
  if (!existsSync(STATE_FILE)) {
    return { packages: {}, projects: {} };
  }

  try {
    return parseState(readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    const saved = quarantine(STATE_FILE);
    const savedNote = saved ? `A copy was kept at ${saved}.` : 'It could not be copied aside.';

    if (existsSync(BACKUP_FILE)) {
      try {
        const recovered = parseState(readFileSync(BACKUP_FILE, 'utf8'));
        console.error(`depscheck: ${STATE_FILE} was unreadable — recovered from ${BACKUP_FILE}.`);
        console.error(`depscheck: ${savedNote} Anything written since the last save is lost.`);
        return recovered;
      } catch {
        // Backup is unusable too — fall through and refuse to continue.
      }
    }

    // Returning an empty state here would look like a clean first run, and the
    // next saveState would overwrite the cache with just one project's deps.
    throw new Error(
      `DepsCheck cache at ${STATE_FILE} is unreadable and no usable backup exists. ` +
      `${savedNote} Repair or delete ${STATE_FILE} and re-run — deleting it starts a fresh ` +
      `watchlist. Underlying error: ${(err as Error).message}`,
    );
  }
}

export function saveState(state: State): void {
  mkdirSync(STATE_DIR, { recursive: true });

  if (existsSync(STATE_FILE)) {
    try {
      parseState(readFileSync(STATE_FILE, 'utf8'));
      copyFileSync(STATE_FILE, BACKUP_FILE);
    } catch {
      // Live file is already unreadable (we're most likely mid-recovery) —
      // leave the backup alone rather than overwriting it with garbage.
    }
  }

  // Write-then-rename, same directory so the rename is atomic: a concurrent
  // reader sees either the old cache or the new one, never a partial write.
  // The pid keeps two processes from sharing a temp file.
  const tmp = `${STATE_FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}
