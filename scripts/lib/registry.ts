// Thin wrapper around the public npm registry. No auth needed for public
// package metadata.

// A failed lookup is reported, never folded into "no data" — a package we
// couldn't resolve reads identically to an up-to-date one otherwise, which is
// the quietest possible way to be wrong.
export type RegistryResult =
  | { ok: true; latest: string | null; deprecated: string | null }
  | { ok: false; error: string };

export async function fetchRegistryInfo(pkgName: string): Promise<RegistryResult> {
  const url = `https://registry.npmjs.org/${pkgName.replace('/', '%2F')}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.npm.install-v1+json' } });
    if (res.status === 404) return { ok: false, error: 'not published on the public npm registry' };
    if (!res.ok) return { ok: false, error: `npm registry returned ${res.status}` };
    const data = await res.json();
    const latest = data['dist-tags']?.latest ?? null;
    const latestInfo = latest ? data.versions?.[latest] : null;
    return { ok: true, latest, deprecated: latestInfo?.deprecated || null };
  } catch (err) {
    return { ok: false, error: `registry unreachable (${(err as Error).message})` };
  }
}

// Heuristic only — regex-grabs the first number in a range/version string.
// Good enough to flag "N majors behind", not a semver replacement.
export function extractMajor(rangeOrVersion: string | null | undefined): number | null {
  const m = /(\d+)/.exec(rangeOrVersion || '');
  return m ? parseInt(m[1], 10) : null;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
