#!/usr/bin/env node
// Scans every package.json under <rootDir> and flags dependencies that are
// either marked deprecated on npm or one-or-more majors behind latest.
// Heuristic only (regex-based major extraction, not full semver) — good
// enough to point a human/agent at what's worth a closer look.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.argv[2];
if (!rootDir) {
  console.error('Usage: node scan-deps.mjs <rootDir>');
  process.exit(1);
}

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.idea', '.next', '.vercel', '.turbo']);

function findPackageJsons(dir, depth = 0, maxDepth = 4) {
  const results = [];
  if (depth > maxDepth) return results;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPackageJsons(full, depth + 1, maxDepth));
    } else if (entry.name === 'package.json') {
      results.push(full);
    }
  }
  return results;
}

function projectNameFromPath(pkgPath, rootDir) {
  const rel = path.relative(rootDir, path.dirname(pkgPath));
  const top = rel.split(path.sep)[0];
  return top || path.basename(rootDir);
}

function extractMajor(rangeOrVersion) {
  const m = /(\d+)/.exec(rangeOrVersion || '');
  return m ? parseInt(m[1], 10) : null;
}

async function fetchRegistryInfo(pkgName) {
  const url = `https://registry.npmjs.org/${pkgName.replace('/', '%2F')}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.npm.install-v1+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const latest = data['dist-tags']?.latest;
    const latestInfo = latest ? data.versions?.[latest] : null;
    return { latest, deprecated: latestInfo?.deprecated || null };
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const pkgJsonPaths = findPackageJsons(rootDir);
const projects = [];

for (const pkgPath of pkgJsonPaths) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue;
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const depNames = Object.keys(deps);
  if (depNames.length === 0) continue;

  const infos = await mapWithConcurrency(depNames, 8, async (name) => {
    const range = deps[name];
    const registry = await fetchRegistryInfo(name);
    if (!registry || !registry.latest) return null;
    const currentMajor = extractMajor(range);
    const latestMajor = extractMajor(registry.latest);
    const majorsBehind = currentMajor != null && latestMajor != null ? latestMajor - currentMajor : null;
    const flagged = Boolean(registry.deprecated) || (majorsBehind != null && majorsBehind >= 1);
    if (!flagged) return null;
    return {
      name,
      declaredRange: range,
      latest: registry.latest,
      deprecated: registry.deprecated,
      majorsBehind,
    };
  });

  const flaggedDeps = infos.filter(Boolean);
  if (flaggedDeps.length > 0) {
    projects.push({
      project: projectNameFromPath(pkgPath, rootDir),
      packageJson: path.relative(rootDir, pkgPath),
      flagged: flaggedDeps,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  root: rootDir,
  scannedPackageJsons: pkgJsonPaths.length,
  projects,
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
