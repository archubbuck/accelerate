/** Durable-job adapter contracts; persistence is provided by integrations. */
export interface Job<T = unknown> { readonly id: string; readonly name: string; readonly payload: T; readonly attempts: number; readonly createdAt: string; }
export type JobHandler<T> = (job: Job<T>, signal: AbortSignal) => Promise<void>;
export interface JobQueue { enqueue<T>(name: string, payload: T, options?: { id?: string; delayMs?: number }): Promise<string>; }
export interface JobWorker { register<T>(name: string, handler: JobHandler<T>): () => void; start(): Promise<void>; stop(): Promise<void>; }
export function validateJob(job: Job): void { if (!job.id || !job.name || !Number.isInteger(job.attempts) || job.attempts < 0) throw new Error('Invalid job'); }
