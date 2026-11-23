import { describe, it, expect } from 'vitest';
import { noopTracer, withSpan } from './index.js';
describe('tracing', () => { it('returns results and rethrows errors', async () => { await expect(withSpan(noopTracer(),'test',async () => 42)).resolves.toBe(42); await expect(withSpan(noopTracer(),'test',async () => { throw new Error('failure'); })).rejects.toThrow('failure'); }); });
