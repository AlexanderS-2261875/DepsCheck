// Shared read/write for the local DepsCheck cache. Lives outside the repo,
// under the user's home dir, so it works regardless of whether this repo is
// ever pushed anywhere, and never ends up in a public history if it is.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATE_DIR = path.join(os.homedir(), '.claude', 'depscheck');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');

export function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { packages: {}, projects: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { packages: parsed.packages ?? {}, projects: parsed.projects ?? {} };
  } catch {
    return { packages: {}, projects: {} };
  }
}

export function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
