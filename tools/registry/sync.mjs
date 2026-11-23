import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readWorkspace(root) {
  const dir = join(root, 'packages');
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(dir, entry.name, 'package.json')))
    .map(entry => {
      const pkg = JSON.parse(readFileSync(join(dir, entry.name, 'package.json'), 'utf8'));
      return { id: entry.name, path: 'packages/' + entry.name, pkg };
    }).sort((a, b) => a.id.localeCompare(b.id));
}

export function synchronize(catalog, workspace) {
  const result = structuredClone(catalog);
  const byName = new Map(result.packages.map(entry => [entry.name, entry]));
  const missing = [];
  for (const item of workspace) {
    const entry = byName.get(item.pkg.name);
    if (!entry) { missing.push(item.pkg.name); continue; }
    entry.path = item.path;
    entry.version = item.pkg.version;
    entry.dependencies = Object.keys({
      ...item.pkg.dependencies,
      ...item.pkg.peerDependencies,
      ...item.pkg.optionalDependencies
    }).filter(name => byName.has(name)).map(name => byName.get(name).id).sort();
    entry.workspaceDependencies = {
      runtime: Object.keys(item.pkg.dependencies || {}).filter(name => byName.has(name)).sort(),
      peer: Object.keys(item.pkg.peerDependencies || {}).filter(name => byName.has(name)).sort(),
      optional: Object.keys(item.pkg.optionalDependencies || {}).filter(name => byName.has(name)).sort()
    };
  }
  return { catalog: result, missing };
}

export function writeCatalog(path, catalog) {
  writeFileSync(path, JSON.stringify(catalog, null, 2) + '\n');
}

export async function fetchNpmStatus(name, fetcher = fetch) {
  const url = 'https://registry.npmjs.org/' + encodeURIComponent(name);
  try {
    const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (response.status === 404) return { status: 'unpublished', latestVersion: null };
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const metadata = await response.json();
    const latest = metadata['dist-tags']?.latest || null;
    return { status: latest ? 'published' : 'unknown', latestVersion: latest };
  } catch (error) {
    return { status: 'unknown', latestVersion: null, error: String(error.message || error) };
  }
}

export async function synchronizeNpm(catalog, fetcher = fetch) {
  const result = structuredClone(catalog);
  const implemented = result.packages.filter(entry => entry.path);
  for (const entry of implemented) entry.publication = await fetchNpmStatus(entry.name, fetcher);
  return result;
}
