import { describe, it, expect } from 'vitest';
import { assertMetricName, noopMeter } from './index.js';
describe('metrics', () => { it('validates metric names', () => { expect(assertMetricName('http.requests')).toBe('http.requests'); expect(() => assertMetricName('bad name')).toThrow(); }); it('provides safe no-op instruments', () => { expect(() => noopMeter().counter('requests').add(1)).not.toThrow(); }); });
