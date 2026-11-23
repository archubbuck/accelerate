const completed = new Set(['implemented', 'published']);
const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3, existing: 4 };
export function analyze(catalog) {
  const packages = catalog.packages;
  const byId = new Map(packages.map(p => [p.id, p]));
  const errors = [];
  const states = new Map();
  function dependencies(id, stack = []) {
    if (stack.includes(id)) { errors.push('Dependency cycle: ' + [...stack, id].join(' -> ')); return []; }
    const p = byId.get(id);
    if (!p) { errors.push('Unknown package dependency: ' + id); return []; }
    if (states.has(id)) return states.get(id);
    const result = new Set();
    for (const dep of p.dependencies || []) {
      if (!byId.has(dep)) { errors.push('Unknown dependency ' + dep + ' of ' + id); continue; }
      result.add(dep);
      for (const transitive of dependencies(dep, [...stack, id])) result.add(transitive);
    }
    const value = [...result].sort();
    states.set(id, value);
    return value;
  }
  const items = packages.map(p => {
    const transitive = dependencies(p.id);
    const blockers = transitive.filter(id => !completed.has(byId.get(id)?.lifecycle));
    const directBlockers = (p.dependencies || []).filter(id => !completed.has(byId.get(id)?.lifecycle));
    return {
      ...p, blockers, directBlockers,
      ready: !completed.has(p.lifecycle) && p.lifecycle !== 'deprecated' && blockers.length === 0,
      dependents: packages.filter(other => (other.dependencies || []).includes(p.id)).map(other => other.id).sort()
    };
  });
  const sort = (a, b) => (a.wave ?? 99) - (b.wave ?? 99) ||
    (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
    b.dependents.length - a.dependents.length || a.id.localeCompare(b.id);
  return { items: items.sort(sort), errors: [...new Set(errors)] };
}
export function findPackages(catalog, query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return analyze(catalog).items.map(p => {
    const id = p.id.toLowerCase();
    const name = p.name.toLowerCase();
    const category = p.category.toLowerCase();
    const terms = q.split(/\s+/);
    const score = terms.reduce((sum, term) => sum +
      (id === term || name === term ? 10 : id.includes(term) ? 5 : category.includes(term) ? 3 : name.includes(term) ? 2 : 0), 0);
    return { ...p, score };
  }).filter(p => p.score > 0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function readiness(pkg) {
  const checks = {
    implemented: Boolean(pkg.path),
    versioned: Boolean(pkg.version),
    documented: Boolean(pkg.path && pkg.documentationComplete === true),
    tested: Boolean(pkg.path && pkg.testsComplete === true),
    published: pkg.publication?.status === 'published'
  };
  return { checks, score: Object.values(checks).filter(Boolean).length, total: 5 };
}
