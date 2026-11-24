import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditWorkspace } from './audit.mjs';
test('audit verifies built entrypoints and internal dependency versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'accelerate-audit-'));
  try {
    const dir = join(root, 'packages/core');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    const pkg = { name: '@accelerate/core', version: '1.0.0', publishConfig: { access: 'public' },
      main: './dist/index.js', types: './dist/index.d.ts' };
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(dir, 'dist/index.js'), 'export {};');
    writeFileSync(join(dir, 'dist/index.d.ts'), 'export {};');
    const workspace = [{ id: 'core', path: 'packages/core', pkg }];
    assert.deepEqual(auditWorkspace(root, workspace), []);
    rmSync(join(dir, 'dist/index.d.ts'));
    assert.ok(auditWorkspace(root, workspace).some(x => x.includes('missing compiled entrypoint')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('audit verifies Angular package distribution exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'accelerate-angular-audit-'));
  try {
    const dir = join(root, 'packages/authorization-angular/dist');
    mkdirSync(join(dir, 'fesm2022'), { recursive: true });
    const pkg = { name: '@accelerate/authorization-angular', version: '1.0.0', publishConfig: { access: 'public' } };
    const published = { ...pkg, exports: { '.': { default: './fesm2022/sample.mjs', types: './index.d.ts' } } };
    writeFileSync(join(dir, 'package.json'), JSON.stringify(published));
    writeFileSync(join(dir, 'fesm2022/sample.mjs'), 'export {};');
    writeFileSync(join(dir, 'index.d.ts'), 'export {};');
    const workspace = [{ id: 'authorization-angular', path: 'packages/authorization-angular', pkg }];
    assert.deepEqual(auditWorkspace(root, workspace), []);
    rmSync(join(dir, 'fesm2022/sample.mjs'));
    assert.ok(auditWorkspace(root, workspace).some(x => x.includes('missing compiled entrypoint')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('audit detects incompatible internal dependency versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'accelerate-dependency-audit-'));
  try {
    const workspace = ['core', 'adapter'].map(id => {
      const dir = join(root, 'packages', id);
      mkdirSync(join(dir, 'dist'), { recursive: true });
      const pkg = { name: '@accelerate/' + id, version: '1.0.0', publishConfig: { access: 'public' },
        main: './dist/index.js', types: './dist/index.d.ts',
        ...(id === 'adapter' ? { dependencies: { '@accelerate/core': '0.9.0' } } : {}) };
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
      writeFileSync(join(dir, 'dist/index.js'), 'export {};');
      writeFileSync(join(dir, 'dist/index.d.ts'), 'export {};');
      return { id, path: 'packages/' + id, pkg };
    });
    assert.ok(auditWorkspace(root, workspace).some(x => x.includes('internal dependency range')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('audit accepts source-only configuration packages and detects missing exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'accelerate-config-audit-'));
  try {
    for (const id of ['eslint-config', 'typescript-config']) {
      const dir = join(root, 'packages', id);
      mkdirSync(dir, { recursive: true });
      const exports = id === 'eslint-config' ? { '.': './index.js' } : { './base.json': './base.json' };
      const pkg = { name: '@accelerate/' + id, version: '0.1.0', publishConfig: { access: 'public' }, exports };
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
      const asset = id === 'eslint-config' ? 'index.js' : 'base.json';
      writeFileSync(join(dir, asset), id === 'eslint-config' ? 'export default [];' : '{}');
      const workspace = [{ id, path: 'packages/' + id, pkg }];
      assert.deepEqual(auditWorkspace(root, workspace), []);
      rmSync(join(dir, asset));
      assert.ok(auditWorkspace(root, workspace).some(x => x.includes('missing configuration export')));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('audit accepts workspace protocols and tsc-built Angular adapters', () => {
  const root = mkdtempSync(join(tmpdir(), 'accelerate-workspace-audit-'));
  try {
    const workspace = ['core', 'sample-angular'].map(id => {
      const dir = join(root, 'packages', id);
      mkdirSync(join(dir, 'dist'), { recursive: true });
      const pkg = { name: '@accelerate/' + id, version: '1.0.0', publishConfig: { access: 'public' },
        main: './dist/index.js', types: './dist/index.d.ts',
        ...(id === 'sample-angular' ? { dependencies: { '@accelerate/core': 'workspace:*' } } : {}) };
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
      writeFileSync(join(dir, 'dist/index.js'), 'export {};');
      writeFileSync(join(dir, 'dist/index.d.ts'), 'export {};');
      return { id, path: 'packages/' + id, pkg };
    });
    assert.deepEqual(auditWorkspace(root, workspace), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
