import { describe, it, expect } from 'vitest';
import { validateJob } from './index.js';
describe('jobs', () => { it('validates attempts', () => { const job={id:'1',name:'email',payload:{},attempts:0,createdAt:new Date().toISOString()}; expect(() => validateJob(job)).not.toThrow(); expect(() => validateJob({...job,attempts:-1})).toThrow(); }); });
