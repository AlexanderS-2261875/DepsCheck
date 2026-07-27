You are auditing dependency health for Schmitt Software's client web projects.

Read `reports/latest-scan.json` in the current directory. It lists, per project,
dependencies that are either:

- marked `deprecated` on npm (with the deprecation message), or
- one or more major versions behind the latest published release (heuristic,
  not full semver — `majorsBehind` is a rough signal, not gospel).

For each flagged dependency:

1. Search the web to confirm whether it's genuinely deprecated/abandoned or
   just behind on majors.
2. If deprecated: identify the maintained replacement package (if any) and
   link to its docs or migration guide.
3. If just outdated: note whether upgrading is a drop-in bump or has known
   breaking changes (check the changelog/release notes spanning the majors
   between current and latest).
4. Keep it terse — one short paragraph per flagged dependency, not an essay.
   Skip dependencies that turn out to be a non-issue (e.g. a false-positive
   major bump like a `types` package that intentionally tracks a different
   version scheme).

Write the result as a markdown report to `reports/<today's date, YYYY-MM-DD>.md`,
grouped by project:

```
## ProjectName
- **package-name** (current: ^1.2.3, latest: 4.0.0) — deprecated/outdated,
  <finding>. Suggested action: <replace with X / follow Y migration guide /
  no action needed>.
```

If a project has no flagged dependencies worth reporting, omit it entirely.
End the report with a one-line total: how many dependencies across how many
projects need attention.
