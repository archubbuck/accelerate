import type { DomainEvent } from "@accelerate/events-core";

export interface OutboxEvent<T = unknown> extends DomainEvent<T> {
  readonly correlationId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface Delivery {
  readonly event: OutboxEvent;
  readonly token: string;
  readonly attempt: number;
}

export interface PublisherStore {
  claim(leaseMs: number): Promise<Delivery | undefined>;
  acknowledge(delivery: Delivery): Promise<boolean>;
  retry(delivery: Delivery, delayMs: number): Promise<boolean>;
  deadLetter(delivery: Delivery): Promise<boolean>;
}

export interface PublishOptions {
  leaseMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}

export function validateInteger(value: number, min: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > 2147483647) {
    throw new RangeError(`Invalid ${label}`);
  }
}

export type PublishResult =
  | { status: "idle" }
  | {
      status: "published" | "retry" | "dead-letter" | "lease-lost";
      eventId: string;
      correlationId?: string;
      attempt: number;
    };

/** Perform one delivery. Store failures propagate so a lease can recover the record. */
export async function publishNext(
  store: PublisherStore,
  publish: (event: OutboxEvent) => Promise<void>,
  options: PublishOptions,
): Promise<PublishResult> {
  validateInteger(options.leaseMs, 1, "lease");
  validateInteger(options.maxAttempts, 1, "attempt limit");
  validateInteger(options.retryDelayMs, 0, "retry delay");
  const delivery = await store.claim(options.leaseMs);
  if (!delivery) return { status: "idle" };
  const context = {
    eventId: delivery.event.id,
    correlationId: delivery.event.correlationId,
    attempt: delivery.attempt,
  };
  try {
    await publish(delivery.event);
  } catch {
    const exhausted = delivery.attempt >= options.maxAttempts;
    const settled = exhausted
      ? await store.deadLetter(delivery)
      : await store.retry(delivery, options.retryDelayMs);
    return {
      ...context,
      status: settled ? (exhausted ? "dead-letter" : "retry") : "lease-lost",
    };
  }
  const settled = await store.acknowledge(delivery);
  return { ...context, status: settled ? "published" : "lease-lost" };
}
