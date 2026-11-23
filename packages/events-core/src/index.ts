/** Framework-neutral typed event dispatch and subscription. */
export interface DomainEvent<T = unknown> { readonly type: string; readonly payload: T; readonly occurredAt: string; readonly id: string; }
export type EventHandler<T> = (event: DomainEvent<T>) => void | Promise<void>;
export interface EventBus { publish<T>(event: DomainEvent<T>): Promise<void>; subscribe<T>(type: string, handler: EventHandler<T>): () => void; }
export function createEvent<T>(type: string, payload: T, id: string, occurredAt = new Date().toISOString()): DomainEvent<T> { if (!type || !id) throw new Error('Event type and id are required'); return { type, payload, id, occurredAt }; }
