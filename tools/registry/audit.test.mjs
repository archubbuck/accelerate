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
