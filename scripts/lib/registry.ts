// Thin wrapper around the public npm registry. No auth needed for public
// package metadata.

export interface RegistryInfo {
  latest: string | undefined;
  deprecated: string | null;
}

export async function fetchRegistryInfo(pkgName: string): Promise<RegistryInfo | null> {
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
