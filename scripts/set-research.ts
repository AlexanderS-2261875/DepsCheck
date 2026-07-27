#!/usr/bin/env node
// Safely merges one package's AI research findings into the state file.
// Takes a JSON file path rather than CLI args so the caller (an LLM writing
// via its own Write tool) never has to worry about shell-quoting a summary
// that might contain quotes, newlines, etc.
import { readFileSync } from 'node:fs';
import { loadState, saveState } from './lib/state.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: set-research.ts <jsonFile>');
  console.error('jsonFile shape: {"name": "...", "summary": "...", "suggestedAction": "..."}');
  process.exit(1);
}

const { name, summary, suggestedAction } = JSON.parse(readFileSync(file, 'utf8'));
const state = loadState();
const entry = state.packages[name];
if (!entry) {
  console.error(`Unknown package in state: ${name}`);
  process.exit(1);
}

entry.aiSummary = summary;
entry.suggestedAction = suggestedAction || null;
entry.researchedAt = new Date().toISOString();
entry.needsResearch = false;

saveState(state);
console.log(`updated research for ${name}`);
