import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../index.js';
test('exports flat config with debugger prohibition', () => { assert.ok(Array.isArray(config)); assert.equal(config[1].rules['no-debugger'], 'error'); });
