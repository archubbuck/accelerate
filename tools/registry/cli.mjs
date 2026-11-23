#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readWorkspace, synchronize, synchronizeNpm, writeCatalog } from './sync.mjs';
import { analyze, findPackages, readiness } from './planning.mjs';
const root = resolve(import.meta.dirname, '../..');
const catalog = JSON.parse(readFileSync(join(root, 'registry/packages.json'), 'utf8'));
const packages = catalog.packages;
const args = process.argv.slice(2);
const cmd = args[0] || 'list';
const ids = new Set(packages.map(p => p.id));
const failures = [];
function fail(message) { failures.push(message); }
function workspace() {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter(x => x.isDirectory() && existsSync(join(root, 'packages', x.name, 'package.json')))
    .map(x => {
      const pkg = JSON.parse(readFileSync(join(root, 'packages', x.name, 'package.json'), 'utf8'));
      return { id: x.name, ...pkg };
    });
}
function validate() {
  if (catalog.schemaVersion !== 1) fail('Unsupported schemaVersion');
  if (!Array.isArray(packages)) fail('packages must be an array');
  const names = new Set();
  for (const p of packages) {
    if (!p.id || !p.name || !p.category || !p.lifecycle || !p.publication) fail('Incomplete entry: ' + JSON.stringify(p));
    if (names.has(p.name)) fail('Duplicate package name: ' + p.name);
    names.add(p.name);
    if (!['proposed','planned','in-progress','implemented','published','deprecated'].includes(p.lifecycle)) fail('Invalid lifecycle: ' + p.id);
    for (const d of p.dependencies || []) if (!ids.has(d)) fail('Unknown dependency ' + d + ' in ' + p.id);
    if (p.path && !existsSync(join(root, p.path, 'package.json'))) fail('Missing package: ' + p.path);
    if (!p.path && !['proposed','planned'].includes(p.lifecycle)) fail('Missing implementation path: ' + p.id);
  }
  const ws = workspace();
  const synced = synchronize(catalog, readWorkspace(root));
  for (const name of synced.missing) fail('Unregistered workspace package: ' + name);
  for (const item of synced.catalog.packages) {
    const stored = packages.find(p => p.name === item.name);
    if (stored && stored.path && JSON.stringify(stored.workspaceDependencies || null) !== JSON.stringify(item.workspaceDependencies || null)) fail('Workspace dependencies out of sync: ' + item.id);
    if (stored && stored.path && stored.version !== item.version) fail('Workspace version out of sync: ' + item.id);
  }
  for (const w of ws) {
    const record = packages.find(p => p.name === w.name);
    if (!record) fail('Workspace package not registered: ' + w.name);
    else if (record.path !== 'packages/' + w.id) fail('Incorrect workspace path: ' + w.name);
  }
  const graph = new Map(packages.map(p => [p.id, p.dependencies || []]));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { fail('Dependency cycle at ' + id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const d of graph.get(id) || []) if (graph.has(d)) visit(d);
    visiting.delete(id); visited.add(id);
  }
  for (const id of ids) visit(id);
  for (const error of analyze(catalog).errors) fail(error);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Registry valid: ' + packages.length + ' entries; ' + ws.length + ' workspace packages');
}
function report() {
  const counts = {};
  for (const p of packages) counts[p.lifecycle] = (counts[p.lifecycle] || 0) + 1;
  console.log(JSON.stringify({ total: packages.length, lifecycle: counts, byWave: Object.fromEntries([0,1,2,3,4,5].map(w => [w, packages.filter(p => p.wave === w).length])) }, null, 2));
}
function docs() {
  const rows = ['# Package Registry', '', 'Generated from registry/packages.json. Do not edit manually.', '', '| Package | Category | Lifecycle | Priority | Wave |', '| --- | --- | --- | --- | --- |', ...packages.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`| \`${p.name}\` | ${p.category} | ${p.lifecycle} | ${p.priority} | ${p.wave} |`), ''];
  const out = join(root, 'docs/package-registry.md');
  const content = rows.join('\n');
  if (args.includes('--check')) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== content) { console.error('Generated docs out of date; run pnpm registry:docs'); process.exitCode = 1; }
  } else { writeFileSync(out, content); console.log('Wrote docs/package-registry.md'); }
}
async function sync() {
  const check = args.includes('--check');
  const npm = args.includes('--npm');
  const snapshot = synchronize(catalog, readWorkspace(root));
  if (snapshot.missing.length) { console.error('Unregistered packages: ' + snapshot.missing.join(', ')); process.exitCode = 1; return; }
  const updated = npm ? await synchronizeNpm(snapshot.catalog) : snapshot.catalog;
  const next = JSON.stringify(updated, null, 2) + '\n';
  if (check) {
    if (readFileSync(join(root, 'registry/packages.json'), 'utf8') !== next) { console.error('Registry is out of sync; run pnpm registry:sync'); process.exitCode = 1; }
    else console.log('Registry synchronized');
  } else { writeCatalog(join(root, 'registry/packages.json'), updated); console.log('Synchronized ' + readWorkspace(root).length + ' workspace packages' + (npm ? ' and npm metadata' : '')); }
}
switch (cmd) {
  case 'validate': validate(); break;
  case 'sync': await sync(); break;
  case 'list': for (const p of packages) console.log(p.id.padEnd(30), p.lifecycle.padEnd(14), p.priority); break;
  case 'show': { const p = packages.find(x=>x.id===args[1]); if (!p) { console.error('Unknown package'); process.exitCode=1; } else console.log(JSON.stringify(p,null,2)); break; }
  case 'roadmap': for (const p of analyze(catalog).items.filter(p=>p.wave>0)) console.log('Wave '+p.wave, p.priority, p.id, p.ready ? '[ready]' : '[blocked: '+p.blockers.join(', ')+']'); break;
  case 'next': for (const p of analyze(catalog).items.filter(p=>p.ready).slice(0,Number(args[1])||10)) console.log('Wave '+p.wave, p.priority, p.id); break;
  case 'publish-order': { const byId = new Map(packages.map(p=>[p.id,p])); const visited = new Set(); const active = new Set(); const order = []; function visit(id) { if(active.has(id)) throw new Error('Dependency cycle: '+id); if(visited.has(id))return; active.add(id); const p=byId.get(id); for(const dep of p.dependencies||[]) if(byId.get(dep)?.path) visit(dep); active.delete(id); visited.add(id); if(p.path)order.push(p.id); } for(const p of packages.filter(p=>p.path).sort((a,b)=>a.id.localeCompare(b.id)))visit(p.id); for(const id of order)console.log(id); break; }
  case 'search': { const matches = findPackages(catalog, args.slice(1).join(' ')); for (const p of matches) console.log(p.id.padEnd(30), p.lifecycle.padEnd(14), p.category); if (!matches.length) process.exitCode = 1; break; }
  case 'readiness': { const items = args[1] ? packages.filter(p=>p.id===args[1]) : packages.filter(p=>p.path); if (!items.length) { console.error('Unknown package'); process.exitCode=1; } for (const p of items) console.log(p.id, JSON.stringify(readiness(p))); break; }
  case 'agent-context': { const matches = args.length>1 ? findPackages(catalog,args.slice(1).join(' ')) : analyze(catalog).items.filter(p=>p.ready); console.log(JSON.stringify({ instruction:'Inspect matching packages and their dependencies before implementing a new package. Proposed packages are not implemented.', matches:matches.slice(0,20).map(p=>({id:p.id,name:p.name,category:p.category,lifecycle:p.lifecycle,path:p.path,dependencies:p.dependencies,blockers:p.blockers,ready:p.ready})) },null,2)); break; }
  case 'graph': console.log('digraph accelerate {'); for (const p of packages) { console.log('  "'+p.id+'";'); for(const d of p.dependencies||[]) console.log('  "'+p.id+'" -> "'+d+'";'); } console.log('}'); break;
  case 'report': report(); break;
  case 'docs': docs(); break;
  default: console.error('Unknown command: '+cmd); process.exitCode=1;
}
