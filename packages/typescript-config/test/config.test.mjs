import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('strict library preset extends base', () => { const base=JSON.parse(readFileSync(new URL('../base.json',import.meta.url))); const lib=JSON.parse(readFileSync(new URL('../library.json',import.meta.url))); assert.equal(base.compilerOptions.strict,true); assert.equal(lib.extends,'./base.json'); });
