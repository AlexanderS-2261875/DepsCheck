// Splits the raw `name: spec` pairs out of a package.json into the subset the
// npm registry can actually answer for, and everything else.
//
// This matters more than it looks. A spec like `file:../utils` or `workspace:*`
// names a package that has nothing to do with the public package of the same
// name — so asking the registry about it doesn't merely fail, it cheerfully
// reports some stranger's version numbers as yours. Skipping those is the
// difference between a missing answer and a wrong one.

export interface RegistryDep {
  /** The key exactly as written in package.json. */
  declaredAs: string;
  /** The package to ask the registry about — differs for `npm:` aliases. */
  registryName: string;
  /** The version range, with any alias prefix stripped. */
  range: string;
}

export interface SkippedDep {
  name: string;
  spec: string;
  reason: string;
}

// Ordered longest-prefix-first isn't needed here — none of these are prefixes
// of each other.
const NON_REGISTRY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['file:', 'local path'],
  ['link:', 'local link'],
  ['workspace:', 'workspace protocol'],
  ['portal:', 'yarn portal'],
  ['patch:', 'yarn patch'],
  ['catalog:', 'pnpm catalog'],
  ['git:', 'git dependency'],
  ['git+', 'git dependency'],
  ['github:', 'git dependency'],
  ['gitlab:', 'git dependency'],
  ['bitbucket:', 'git dependency'],
  ['gist:', 'git dependency'],
  ['http:', 'url tarball'],
  ['https:', 'url tarball'],
];

// `npm:lodash@^4.17.0`, `npm:@scope/pkg@^1.0.0`, or `npm:lodash` with no range.
// The last `@` past position 0 is the separator — position 0 belongs to a scope.
function parseAlias(rest: string): { registryName: string; range: string } {
  const at = rest.lastIndexOf('@');
  if (at > 0) return { registryName: rest.slice(0, at), range: rest.slice(at + 1) };
  return { registryName: rest, range: '*' };
}

export function classifyDeps(deps: Record<string, string>): {
  registry: RegistryDep[];
  skipped: SkippedDep[];
} {
  const registry: RegistryDep[] = [];
  const skipped: SkippedDep[] = [];

  for (const [name, rawSpec] of Object.entries(deps)) {
    const spec = (rawSpec ?? '').trim();

    if (spec.startsWith('npm:')) {
      registry.push({ declaredAs: name, ...parseAlias(spec.slice(4)) });
      continue;
    }

    const match = NON_REGISTRY_PREFIXES.find(([prefix]) => spec.startsWith(prefix));
    if (match) {
      skipped.push({ name, spec, reason: match[1] });
      continue;
    }

    // No prefix but a slash: the bare `user/repo` GitHub shorthand. A semver
    // range never contains one, so this is unambiguous.
    if (spec.includes('/')) {
      skipped.push({ name, spec, reason: 'git shorthand' });
      continue;
    }

    registry.push({ declaredAs: name, registryName: name, range: spec });
  }

  return { registry, skipped };
}

// Reads dependencies + devDependencies off an already-parsed package.json.
export function collectDeps(pkg: unknown): Record<string, string> {
  const p = (pkg ?? {}) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
}
