import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readWorkspace } from './sync.mjs';

/** Validate workspace metadata and compiled entrypoints before npm pack/publish. */
export function auditWorkspace(root, workspace = readWorkspace(root)) {
  const errors = [];
  const byName = new Map(workspace.map(({ pkg }) => [pkg.name, pkg]));
  for (const { id, path, pkg } of workspace) {
    if (pkg.private === true) continue;
    if (!pkg.name?.startsWith('@accelerate/')) errors.push(id + ': invalid package name');
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version || '')) errors.push(id + ': invalid version');
    if (pkg.publishConfig?.access !== 'public') errors.push(id + ': public npm access not configured');
    // Only ng-packagr packages publish a generated manifest from dist.
    // Other Angular adapters use tsc and publish their workspace manifest.
    const angular = id === 'authorization-angular' || id === 'logging-angular';
    const packageDir = join(root, path, ...(angular ? ['dist'] : []));
    const manifestPath = join(packageDir, 'package.json');
    if (!existsSync(manifestPath)) { errors.push(id + ': missing publish manifest at ' + manifestPath); continue; }
    const published = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (published.name !== pkg.name || published.version !== pkg.version) errors.push(id + ': publish manifest differs from workspace identity');
    // Configuration-only packages expose source JS or JSON subpaths rather than compiled declarations.
    const configOnly = id === 'eslint-config' || id === 'typescript-config';
    if (configOnly) {
      const exports = published.exports || {};
      const targets = Object.values(exports).map(value => typeof value === 'string' ? value : value?.default).filter(Boolean);
      if (!targets.length) errors.push(id + ': no configuration exports');
      for (const target of targets) if (!existsSync(resolve(packageDir, target))) errors.push(id + ': missing configuration export ' + target);
      continue;
    }
    const exported = published.exports?.['.'];
    const main = exported?.default || published.main;
    const types = exported?.types || published.types;
    if (!main || !types) errors.push(id + ': missing JS or TypeScript entrypoint');
    if (typeof main !== 'string' || typeof types !== 'string') errors.push(id + ': invalid export entrypoint type');
    for (const entry of [main, types]) {
      if (typeof entry === 'string' && !existsSync(resolve(packageDir, entry))) errors.push(id + ': missing compiled entrypoint ' + entry);
    }
    for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })) {
      if (!name.startsWith('@accelerate/')) continue;
      const dependency = byName.get(name);
      if (!dependency) errors.push(id + ': internal dependency missing from workspace: ' + name);
      else if (typeof range !== 'string' || !(range === 'workspace:*' || range === 'workspace:^' || range === 'workspace:~' || range === 'workspace:' + dependency.version || range === dependency.version || range === '^' + dependency.version || range === '~' + dependency.version)) errors.push(id + ': internal dependency range does not match workspace: ' + name + '@' + range);
    }
  }
  return errors;
}
