import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synchronize, fetchNpmStatus } from './sync.mjs';

const catalog = { schemaVersion: 1, packages: [
  { id: 'core', name: '@accelerate/core', path: 'packages/core', dependencies: [], publication: { status: 'unknown' } },
  { id: 'node', name: '@accelerate/node', path: 'packages/node', dependencies: [], publication: { status: 'unknown' } }
] };

test('synchronizes version and internal dependency kinds', () => {
  const workspace = [
    { id: 'core', path: 'packages/core', pkg: { name: '@accelerate/core', version: '1.0.0' } },
    { id: 'node', path: 'packages/node', pkg: { name: '@accelerate/node', version: '1.1.0', peerDependencies: { '@accelerate/core': '^1.0.0', react: '^19' } } }
  ];
  const result = synchronize(catalog, workspace);
  const node = result.catalog.packages[1];
  assert.equal(node.version, '1.1.0');
  assert.deepEqual(node.dependencies, ['core']);
  assert.deepEqual(node.workspaceDependencies.peer, ['@accelerate/core']);
  assert.equal(catalog.packages[1].version, undefined);
});

test('detects unregistered packages', () => {
  const result = synchronize(catalog, [{ id: 'extra', path: 'packages/extra', pkg: { name: '@accelerate/extra' } }]);
  assert.deepEqual(result.missing, ['@accelerate/extra']);
});

test('npm 404 means unpublished', async () => {
  const status = await fetchNpmStatus('@accelerate/test', async () => ({ status: 404 }));
  assert.deepEqual(status, { status: 'unpublished', latestVersion: null });
});

test('npm latest tag is read without assuming workspace version', async () => {
  const status = await fetchNpmStatus('@accelerate/test', async () => ({ ok: true, json: async () => ({ 'dist-tags': { latest: '2.0.0' } }) }));
  assert.deepEqual(status, { status: 'published', latestVersion: '2.0.0' });
});

test('npm network failure remains unknown', async () => {
  const status = await fetchNpmStatus('@accelerate/test', async () => { throw new Error('offline'); });
  assert.equal(status.status, 'unknown');
});
