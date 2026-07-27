#!/usr/bin/env node
// Prints the current needs-research queue (package names only). Used by the
// nightly research prompt so Claude doesn't have to hand-parse the whole
// state file to find what it's supposed to work on.
import { loadState } from './lib/state.mjs';

const state = loadState();
const names = Object.keys(state.packages).filter((n) => state.packages[n].needsResearch);
process.stdout.write(JSON.stringify(names) + '\n');
