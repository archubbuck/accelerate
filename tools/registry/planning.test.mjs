import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, findPackages, readiness } from './planning.mjs';
const make = (id, lifecycle, dependencies = []) => ({
  id, name: '@accelerate/' + id, category: 'api', lifecycle,
  priority: 'P0', wave: 1, dependencies, path: lifecycle === 'implemented' ? 'packages/' + id : null,
  publication: { status: 'unknown' }
});
test('transitive blockers prevent premature implementation', () => {
  const catalog = { packages: [make('a','proposed',['b']),make('b','proposed',['c']),make('c','implemented')] };
  const result = analyze(catalog);
  assert.deepEqual(result.items.find(x=>x.id==='a').blockers,['b']);
  assert.equal(result.items.find(x=>x.id==='b').ready,true);
  assert.equal(result.items.find(x=>x.id==='a').ready,false);
});
test('unknown dependencies and cycles are reported', () => {
  const catalog = { packages: [make('a','proposed',['b','missing']),make('b','proposed',['a'])] };
  const result = analyze(catalog);
  assert.ok(result.errors.some(e=>e.includes('Unknown dependency')));
  assert.ok(result.errors.some(e=>e.includes('cycle')));
});
test('search ranks exact matches ahead of category matches', () => {
  const result = findPackages({packages:[make('http-core','proposed'),make('core','proposed')]}, 'http-core');
  assert.equal(result[0].id,'http-core');
});
test('readiness does not assume tests or documentation exist', () => {
  const result = readiness(make('core','implemented'));
  assert.equal(result.checks.tested,false);
  assert.equal(result.checks.documented,false);
  assert.equal(result.checks.implemented,true);
});
