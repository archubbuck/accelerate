import { describe, it, expect } from 'vitest';
import { createEvent } from './index.js';
describe('events', () => { it('creates an immutable-shape event', () => { const event=createEvent('created',{id:1},'event-1'); expect(event.type).toBe('created'); expect(event.payload).toEqual({id:1}); }); it('rejects missing identity', () => { expect(() => createEvent('',{},'id')).toThrow(); }); });
